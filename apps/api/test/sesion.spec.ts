import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import { NOMBRE_COOKIE } from '../src/identidad/sesion/cookie';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T6. La sesión vive en el servidor y la cookie solo lleva un identificador opaco.
 * Lo que estos tests protegen es que cerrar sesión sirva de algo: si la cookie
 * siguiera valiendo después del logout, no habría forma de echar a nadie.
 */
describe('Sesión, login y logout', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@sesion.test';
  const email = `socia${DOMINIO}`;
  const CONTRASENA = 'raqueta lluviosa 44';

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Una cuenta de este archivo, con la contraseña de siempre. */
  const crearCuenta = async (correo: string) =>
    prisma.usuario.create({
      data: {
        email: correo,
        nombre: 'Carolina',
        apellido: 'Díaz',
        emailVerificado: true,
        passwordHash: await hashear(CONTRASENA),
      },
    });

  beforeEach(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await crearCuenta(email);
  });

  // Jest corre los archivos en paralelo: las sesiones se cuentan solo para las
  // cuentas de este archivo, nunca la tabla entera.
  const sesionesDeAca = { usuario: { email: { endsWith: DOMINIO } } };

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const login = (cuerpo: Record<string, unknown>) =>
    request(servidor()).post('/api/auth/login').send(cuerpo);

  /** Devuelve la cookie de sesión tal como la mandaría el navegador. */
  const entrar = async (): Promise<string> => {
    const respuesta = await login({ email, contrasena: CONTRASENA }).expect(
      204,
    );
    const cookie = respuesta.headers['set-cookie'][0];

    return cookie.split(';')[0];
  };

  // `/api/yo` es el contrato que expone `identidad` desde T8; acá se usa solo
  // para comprobar si la cookie sigue abriendo sesión.
  const verSesion = (cookie: string) =>
    request(servidor()).get('/api/yo').set('Cookie', cookie);

  it('el login correcto deja una cookie de sesión', async () => {
    const respuesta = await login({ email, contrasena: CONTRASENA }).expect(
      204,
    );
    const cookie: string = respuesta.headers['set-cookie'][0];

    expect(cookie).toContain(`${NOMBRE_COOKIE}=`);
    // Sin HttpOnly, cualquier XSS se lleva la sesión. Sin SameSite, se la lleva
    // cualquier formulario de otro sitio. `Secure` depende del entorno y tiene
    // sus propios tests en src/identidad/sesion/cookie.spec.ts.
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  describe('freno a la fuerza bruta', () => {
    // Cada test usa su propio correo. El contador vive en memoria del proceso y no en
    // la base, así que no lo limpia el `beforeEach`: compartir correo entre estos
    // tests los haría depender del orden, y de paso dejaría bloqueada a la cuenta que
    // usa el resto del archivo.
    const malaClave = (correo: string) =>
      login({ email: correo, contrasena: 'no-es-la-que-va' });

    const gastarLosIntentos = async (correo: string) => {
      for (let i = 0; i < 5; i++) await malaClave(correo);
    };

    it('tras cinco contraseñas malas, la sexta recibe 429 y no otro 401', async () => {
      // Sin esto, probar mil claves contra una cuenta es cuestión de minutos. El 429
      // se distingue del 401 a propósito: quien de verdad se equivocó tiene que poder
      // leer "espera un rato" en vez de seguir intentando.
      const correo = `bloqueo-uno${DOMINIO}`;
      await gastarLosIntentos(correo);

      const respuesta = await malaClave(correo);

      expect(respuesta.status).toBe(429);
      expect(respuesta.body.message).toMatch(/quince minutos/i);
    });

    it('bloqueada la cuenta, la contraseña correcta tampoco entra', async () => {
      // Si la buena pasara igual, el freno no serviría: bastaría con seguir probando.
      const correo = `bloqueo-dos${DOMINIO}`;
      await crearCuenta(correo);
      await gastarLosIntentos(correo);

      expect(
        (await login({ email: correo, contrasena: CONTRASENA })).status,
      ).toBe(429);
    });

    it('bloquear una cuenta no deja afuera a las demás del club', async () => {
      // El club entero sale por una sola IP: si el freno fuera por IP a secas, un
      // socio equivocándose dejaría sin entrar a todos los demás.
      await gastarLosIntentos(`bloqueo-tres${DOMINIO}`);

      expect((await malaClave(`vecina${DOMINIO}`)).status).toBe(401);
    });

    it('entrar bien borra los intentos fallidos anteriores', async () => {
      // Quien tecleó mal cuatro veces y entra a la quinta no puede quedar a un error
      // del bloqueo por el resto del cuarto de hora.
      const correo = `bloqueo-cuatro${DOMINIO}`;
      await crearCuenta(correo);

      for (let i = 0; i < 4; i++) await malaClave(correo);
      await login({ email: correo, contrasena: CONTRASENA }).expect(204);

      for (let i = 0; i < 4; i++) {
        expect((await malaClave(correo)).status).toBe(401);
      }
    });
  });

  it('con la API en https la cookie sale con Secure', async () => {
    // El unitario de cookiesSeguras cubre la decisión; esto comprueba que la
    // decisión llega de verdad al encabezado que recibe el navegador.
    const anterior = process.env.API_PUBLIC_URL;
    process.env.API_PUBLIC_URL = 'https://club.example.cl/api';

    try {
      const respuesta = await login({ email, contrasena: CONTRASENA });
      expect(respuesta.headers['set-cookie'][0]).toContain('Secure');
    } finally {
      process.env.API_PUBLIC_URL = anterior;
    }
  });

  it('la sesión se resuelve en cada request', async () => {
    const cookie = await entrar();

    const respuesta = await verSesion(cookie).expect(200);

    expect(respuesta.body).toMatchObject({ email, nombre: 'Carolina' });
  });

  it('el correo entra escrito como sea: mayúsculas y espacios no dejan a nadie afuera', async () => {
    await login({
      email: `  SOCIA${DOMINIO.toUpperCase()} `,
      contrasena: CONTRASENA,
    }).expect(204);
  });

  it('las sesiones vencidas del usuario se limpian al volver a entrar', async () => {
    const cookie = await entrar();
    await prisma.sesion.updateMany({
      where: sesionesDeAca,
      data: { expiraEn: new Date(Date.now() - 1000) },
    });

    await login({ email, contrasena: CONTRASENA }).expect(204);

    // Sin esto la tabla solo crece: una sesión abandonada que nadie vuelve a usar
    // no se borra nunca, porque el borrado ocurre al resolverla.
    expect(await prisma.sesion.count({ where: sesionesDeAca })).toBe(1);
    // La sonda cambió de forma, no de sentido: antes el 401 probaba que la
    // sesión murió y ahora lo prueba el cuerpo vacío. La afirmación es la misma
    // —esa cookie no autentica a nadie— dicha como el endpoint la dice desde
    // que responder "nadie" dejó de ser un error.
    expect((await verSesion(cookie).expect(200)).body).toEqual({});
  });

  it('sin cookie no hay sesión', async () => {
    // Responde 200 con el cuerpo vacío y no 401: preguntar quién soy con
    // respuesta "nadie" es información, no un error. Lo que este test protege
    // sigue siendo lo mismo —que sin cookie no aparezca ningún usuario—, y lo
    // que cambió el 2026-09-08 es que decirlo dejó de ensuciar la consola de
    // cada visita pública.
    const respuesta = await request(servidor()).get('/api/yo').expect(200);

    expect(respuesta.body).toEqual({});
  });

  it('una cookie con un identificador inventado no abre sesión', async () => {
    const respuesta = await verSesion(`${NOMBRE_COOKIE}=inventado`).expect(200);

    expect(respuesta.body).toEqual({});
  });

  it('en la base no queda el identificador que viaja en la cookie', async () => {
    const cookie = await entrar();
    const token = cookie.split('=')[1];

    const sesiones = await prisma.sesion.findMany({ where: sesionesDeAca });

    // Quien lea la base —un dump, un backup filtrado— no puede hacerse pasar por
    // nadie: guardamos el hash del identificador, no el identificador.
    expect(sesiones.map((s) => s.tokenHash)).not.toContain(token);
  });

  describe('logout', () => {
    it('invalida la sesión en el servidor: la misma cookie ya no trae a nadie', async () => {
      const cookie = await entrar();
      await verSesion(cookie).expect(200);

      await request(servidor())
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      expect((await verSesion(cookie).expect(200)).body).toEqual({});
    });

    it('borra la sesión de la base, no solo la cookie del navegador', async () => {
      const cookie = await entrar();

      await request(servidor())
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      expect(await prisma.sesion.count({ where: sesionesDeAca })).toBe(0);
    });

    it('cerrar sesión sin tenerla no es un error', async () => {
      await request(servidor()).post('/api/auth/logout').expect(204);
    });
  });

  describe('credenciales inválidas', () => {
    const mismaRespuesta = async (
      cuerpo: Record<string, unknown>,
    ): Promise<unknown> => {
      const respuesta = await login(cuerpo).expect(401);
      return respuesta.body as unknown;
    };

    it('responde lo mismo con contraseña incorrecta que con correo inexistente', async () => {
      const conContrasenaMala: unknown = await mismaRespuesta({
        email,
        contrasena: 'otra contraseña larga',
      });
      const conCorreoInexistente: unknown = await mismaRespuesta({
        email: `fantasma${DOMINIO}`,
        contrasena: CONTRASENA,
      });

      // Si difirieran, el formulario de ingreso diría quién tiene cuenta en el club.
      expect(conContrasenaMala).toEqual(conCorreoInexistente);
    });

    it('una cuenta sin contraseña —solo Google— no entra por acá', async () => {
      await prisma.usuario.update({
        where: { email },
        data: { passwordHash: null },
      });

      await login({ email, contrasena: CONTRASENA }).expect(401);
    });

    it('no deja sesión abierta tras un intento fallido', async () => {
      await login({ email, contrasena: 'otra contraseña larga' }).expect(401);

      expect(await prisma.sesion.count({ where: sesionesDeAca })).toBe(0);
    });

    it('un cuerpo sin credenciales se rechaza igual, sin reventar', async () => {
      await login({}).expect(401);
    });
  });

  describe('vencimiento y renovación deslizante', () => {
    it('una sesión vencida no sirve', async () => {
      const cookie = await entrar();
      await prisma.sesion.updateMany({
        where: sesionesDeAca,
        data: { expiraEn: new Date(Date.now() - 1000) },
      });

      expect((await verSesion(cookie).expect(200)).body).toEqual({});
    });

    it('usar una sesión que se acerca al vencimiento la extiende', async () => {
      const cookie = await entrar();
      const enCincoDias = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      await prisma.sesion.updateMany({
        where: sesionesDeAca,
        data: { expiraEn: enCincoDias },
      });

      await verSesion(cookie).expect(200);

      const sesion = await prisma.sesion.findFirst({ where: sesionesDeAca });
      // Quien entra todos los días no tiene por qué volver a escribir la contraseña
      // cada 30 días contados desde el primer login.
      expect(sesion!.expiraEn.getTime()).toBeGreaterThan(enCincoDias.getTime());
    });

    it('una sesión recién creada no se reescribe en cada request', async () => {
      const cookie = await entrar();
      const original = (await prisma.sesion.findFirst({
        where: sesionesDeAca,
      }))!.expiraEn;

      await verSesion(cookie).expect(200);

      // Extender en cada request sería un UPDATE por request para no ganar nada.
      expect(
        (await prisma.sesion.findFirst({ where: sesionesDeAca }))!.expiraEn,
      ).toEqual(original);
    });
  });
});
