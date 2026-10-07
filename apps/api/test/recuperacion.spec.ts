import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { IntentosFallidos } from '../src/identidad/intentos';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Recuperar la contraseña. Sin esto, quien la olvidaba no tenía salida: la API no la
 * cambiaba, el club tampoco podía, y el correo de "alguien intentó registrarse" le
 * decía que la pidiera desde la pantalla de ingreso.
 */
describe('Recuperación de contraseña', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Dominio propio de este archivo: Jest corre los archivos en paralelo.
  const DOMINIO = '@recuperacion.test';
  const email = `olvido${DOMINIO}`;
  const VIEJA = 'raqueta lluviosa 44';
  const NUEVA = 'saque cruzado al fondo';

  const enviados: CorreoSaliente[] = [];
  let terminarEnvio = (): Promise<void> => Promise.resolve();
  const enviadorDoble: EnviadorCorreo = {
    enviar: (correo) => {
      enviados.push(correo);
      return terminarEnvio();
    },
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnviadorCorreo)
      .useValue(enviadorDoble)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.usuario.create({
      data: {
        email,
        nombre: 'Olga',
        apellido: 'Vidal',
        emailVerificado: true,
        passwordHash: await hashear(VIEJA),
      },
    });
    enviados.length = 0;
    terminarEnvio = () => Promise.resolve();

    // El freno vive en memoria y lo comparte todo el archivo. Las cuatro formas en
    // que Express puede reportar el localhost, igual que en contacto.spec.ts.
    const intentos = app.get(IntentosFallidos);
    for (const ip of ['::ffff:127.0.0.1', '127.0.0.1', '::1', 'sin-ip']) {
      intentos.perdonar(`recuperacion|${email}|${ip}`);
    }
  });

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const pedir = (correo: string) =>
    request(servidor()).post('/api/auth/recuperar').send({ email: correo });

  const restablecer = (token: string, contrasena: string) =>
    request(servidor())
      .post('/api/auth/restablecer')
      .send({ token, contrasena });

  const login = (contrasena: string) =>
    request(servidor()).post('/api/auth/login').send({ email, contrasena });

  /** El token del último correo, sacado del enlace como lo abriría la persona. */
  const tokenDelUltimoCorreo = (): string => {
    const enlace = /\/nueva-contrasena\?token=([\w-]+)/.exec(
      enviados.at(-1)?.cuerpo ?? '',
    );
    if (!enlace) {
      throw new Error('El correo enviado no trae el enlace para cambiarla.');
    }
    return enlace[1];
  };

  it('el enlace del correo deja elegir una contraseña nueva, y la vieja deja de servir', async () => {
    await pedir(email).expect(201);

    expect(enviados.map((correo) => correo.para)).toEqual([email]);
    await restablecer(tokenDelUltimoCorreo(), NUEVA).expect(204);

    await login(NUEVA).expect(204);
    await login(VIEJA).expect(401);
  });

  it('responde lo mismo a un correo sin cuenta, y no le manda nada', async () => {
    const conCuenta = await pedir(email).expect(201);
    const sinCuenta = await pedir(`nadie${DOMINIO}`).expect(201);

    expect(sinCuenta.body).toEqual(conCuenta.body);
    expect(enviados.map((correo) => correo.para)).toEqual([email]);
  });

  it('el enlace sirve una sola vez', async () => {
    await pedir(email);
    const token = tokenDelUltimoCorreo();
    await restablecer(token, NUEVA).expect(204);

    await restablecer(token, 'otra clave bien larga').expect(400);

    await login(NUEVA).expect(204);
  });

  it('un enlace vencido no sirve', async () => {
    await pedir(email);
    await prisma.usuario.update({
      where: { email },
      data: { recuperacionExpiraEn: new Date(Date.now() - 1000) },
    });

    await restablecer(tokenDelUltimoCorreo(), NUEVA).expect(400);

    await login(VIEJA).expect(204);
  });

  it('pedir otro enlace deja sin efecto el anterior', async () => {
    await pedir(email);
    const anterior = tokenDelUltimoCorreo();
    await pedir(email);

    await restablecer(anterior, NUEVA).expect(400);
    await restablecer(tokenDelUltimoCorreo(), NUEVA).expect(204);
  });

  it('una contraseña débil se rechaza diciendo por qué, sin repetirla, y el enlace sigue sirviendo', async () => {
    await pedir(email);
    const token = tokenDelUltimoCorreo();

    const respuesta = await restablecer(token, 'password123').expect(400);

    expect(JSON.stringify(respuesta.body)).toContain('filtradas');
    expect(JSON.stringify(respuesta.body)).not.toContain('password123');
    await restablecer(token, NUEVA).expect(204);
  });

  it('cierra las sesiones abiertas: quien tenía la cuenta queda afuera', async () => {
    // Si alguien registró este correo antes que su dueño y entró con su clave,
    // cambiarla sin cerrar su sesión lo dejaría adentro igual.
    const entrada = await login(VIEJA).expect(204);
    const cookie = (entrada.headers['set-cookie'] as unknown as string[])[0];
    await pedir(email);

    await restablecer(tokenDelUltimoCorreo(), NUEVA).expect(204);

    const yo = await request(servidor())
      .get('/api/yo')
      .set('Cookie', cookie.split(';')[0]);
    expect(yo.body).toEqual({});
  });

  it('deja el correo verificado: abrir el enlace prueba que el correo es suyo', async () => {
    await prisma.usuario.update({
      where: { email },
      data: { emailVerificado: false },
    });
    await pedir(email);

    await restablecer(tokenDelUltimoCorreo(), NUEVA).expect(204);

    const usuario = await prisma.usuario.findUnique({ where: { email } });
    expect(usuario?.emailVerificado).toBe(true);
  });

  it('quien entraba solo con Google puede elegir una contraseña', async () => {
    // SPEC-identidad: de Google a contraseña se pasa por acá, nunca fijándola sin
    // probar que el correo es suyo.
    await prisma.usuario.update({
      where: { email },
      data: { passwordHash: null, googleId: 'google-olvido' },
    });
    await pedir(email);

    await restablecer(tokenDelUltimoCorreo(), NUEVA).expect(204);

    await login(NUEVA).expect(204);
  });

  it('no espera a que el correo termine de salir', async () => {
    // Si la respuesta lo esperara, lo que tarda sendmail diría qué correos tienen
    // cuenta: a los que no tienen no se les manda nada.
    let soltar = () => {};
    terminarEnvio = () => new Promise<void>((resolver) => (soltar = resolver));

    try {
      await pedir(email).timeout(2000).expect(201);
    } finally {
      soltar();
    }
  });

  it('responde lo mismo aunque el envío falle', async () => {
    const bien = await pedir(email).expect(201);
    terminarEnvio = () => Promise.reject(new Error('sendmail salió con 75'));

    const mal = await pedir(email).expect(201);

    expect(mal.body).toEqual(bien.body);
  });

  it('al sexto pedido seguido responde 429, tenga o no cuenta el correo', async () => {
    // Correo propio: este test agota su cuota y el `beforeEach` no la limpia.
    const correo = `freno${DOMINIO}`;
    for (let i = 0; i < 5; i++) {
      await pedir(correo).expect(201);
    }

    await pedir(correo).expect(429);
  });

  it('rechaza un correo con formato inválido y un cuerpo sin token', async () => {
    await pedir('no-es-un-correo').expect(400);
    await restablecer('', NUEVA).expect(400);
  });
});
