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
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.usuario.create({
      data: {
        email,
        nombre: 'Carolina',
        apellido: 'Díaz',
        emailVerificado: true,
        passwordHash: await hashear(CONTRASENA),
      },
    });
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
    await verSesion(cookie).expect(401);
  });

  it('sin cookie no hay sesión', async () => {
    await request(servidor()).get('/api/yo').expect(401);
  });

  it('una cookie con un identificador inventado no abre sesión', async () => {
    await verSesion(`${NOMBRE_COOKIE}=inventado`).expect(401);
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
    it('invalida la sesión en el servidor: la misma cookie da 401', async () => {
      const cookie = await entrar();
      await verSesion(cookie).expect(200);

      await request(servidor())
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      await verSesion(cookie).expect(401);
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

      await verSesion(cookie).expect(401);
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
