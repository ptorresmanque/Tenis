import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { mesEnElClub } from '../src/comun/tiempo';
import { EstadoSolicitud, TipoSolicitud } from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import {
  PerfilGoogle,
  ProveedorGoogle,
} from '../src/identidad/google/google.port';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T32. El alta de socio por correo.
 *
 * **Desde T297 se invita solo a quien ya tiene cuenta** (SPEC-panel.md D12): la ficha
 * se crea en el acto. Las invitaciones de antes, a correos sin cuenta, se respetan
 * (D14): la ficha aparece cuando esa persona se registra. Los dos caminos de registro
 * —contraseña y Google— pasan por el mismo punto: si fueran dos, el socio que entra
 * por Google se quedaría sin ficha y nadie lo probaría a mano.
 */
describe('Alta de socio por correo', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let socio: string;

  const DOMINIO = '@invitacion-t32.test';
  const CONTRASENA = 'raqueta lluviosa 44';
  const INVITADO = `camila${DOMINIO}`;

  let perfil: PerfilGoogle;

  const proveedorDoble: ProveedorGoogle = {
    configurado: () => true,
    urlDeAutorizacion: (state, desafio) =>
      `https://accounts.google.example/auth?state=${state}&code_challenge=${desafio}`,
    perfil: () => Promise.resolve(perfil),
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ProveedorGoogle)
      .useValue(proveedorDoble)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);

    await limpiar();
    admin = await sesionDe('admin');
    socio = await sesionDe('unsocio');
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.solicitudContacto.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.invitacionSocio.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.usuario.deleteMany({ where: { email: INVITADO } });

    perfil = {
      googleId: 'google-t32',
      email: INVITADO,
      emailVerificado: true,
      nombre: 'Camila',
      apellido: 'Invitada',
    };
  });

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  async function limpiar(): Promise<void> {
    await prisma.solicitudContacto.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.invitacionSocio.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
  }

  async function sesionDe(quien: string): Promise<string> {
    const email = `${quien}${DOMINIO}`;

    await prisma.usuario.create({
      data: {
        email,
        nombre: quien,
        apellido: 'De Prueba',
        esAdmin: quien === 'admin',
        passwordHash: await hashear(CONTRASENA),
      },
    });

    const respuesta = await request(servidor())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);

    return (respuesta.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  }

  const invitar = (cuerpo: Record<string, unknown>, cookie = admin) =>
    request(servidor())
      .post('/api/admin/socios/invitaciones')
      .set('Cookie', cookie)
      .send(cuerpo);

  /** La cuenta de la invitada: desde T297 se invita a quien ya la tiene (D12). */
  const conCuenta = () =>
    prisma.usuario.create({
      data: { email: INVITADO, nombre: 'Camila', apellido: 'Invitada' },
    });

  /** Una invitación de antes de T297, a un correo sin cuenta, que nadie usó (D14). */
  const invitacionVieja = (numeroSocio = 'T32-001') =>
    prisma.invitacionSocio.create({
      data: {
        email: INVITADO,
        numeroSocio,
        alDiaHasta: new Date('2099-12-31T00:00:00.000Z'),
      },
    });

  const registrarse = (email = INVITADO) =>
    request(servidor()).post('/api/auth/registro').send({
      email,
      nombre: 'Camila',
      apellido: 'Invitada',
      telefono: '+56911112222',
      contrasena: CONTRASENA,
    });

  /** Entra con la contraseña y devuelve lo que la API dice de esa persona. */
  const quienEs = async (email: string) => {
    const login = await request(servidor())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);

    const cookie = (
      login.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];

    const yo = await request(servidor())
      .get('/api/yo')
      .set('Cookie', cookie)
      .expect(200);

    return yo.body as { socioId: number | null };
  };

  /** El camino completo de Google, hasta la sesión abierta. */
  const entrarConGoogle = async () => {
    const inicio = await request(servidor())
      .get('/api/auth/google')
      .expect(302);
    const state = new URL(inicio.headers.location).searchParams.get('state');
    const cookie = (
      inicio.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];

    await request(servidor())
      .get(`/api/auth/google/callback?code=cualquiera&state=${state}`)
      .set('Cookie', cookie)
      .expect(302);
  };

  describe('quién puede invitar', () => {
    it('sin sesión, 401', async () => {
      await request(servidor())
        .post('/api/admin/socios/invitaciones')
        .send({ email: INVITADO })
        .expect(401);
    });

    it('un socio cualquiera, 403', async () => {
      await invitar({ email: INVITADO }, socio).expect(403);
    });
  });

  describe('invitar', () => {
    it('**a un correo sin cuenta responde 409, y dice qué hacer** (D12)', async () => {
      const respuesta = await invitar({ email: INVITADO }).expect(409);

      expect((respuesta.body as { message: string }).message).toBe(
        'Ese correo no tiene cuenta todavía: pídele que se registre en el sitio.',
      );
      expect(
        await prisma.invitacionSocio.count({ where: { email: INVITADO } }),
      ).toBe(0);
    });

    it('alcanza con el correo: el número y la fecha los pone el club', async () => {
      await conCuenta();
      const respuesta = await invitar({ email: INVITADO }).expect(201);
      const invitacion = respuesta.body as {
        numeroSocio: string;
        alDiaHasta: string;
      };

      expect(invitacion.numeroSocio).not.toBe('');
      // Al día hasta fin del mes en curso: el socio que se inscribe puede usar el
      // club el mes que se inscribió, sin que nadie tenga que cargarle nada.
      // **El mes es el del club, no el de UTC.** A las 21:00 de un 31 en Santiago
      // ya es el día 1 del mes siguiente en UTC, y calcularlo así hacía fallar este
      // test todas las últimas noches de mes contra un servidor que estaba bien.
      const [ano, mes] = mesEnElClub(new Date()).split('-').map(Number);
      const finDeMes = new Date(Date.UTC(ano, mes, 0));
      expect(invitacion.alDiaHasta.slice(0, 10)).toBe(
        finDeMes.toISOString().slice(0, 10),
      );
    });

    it('guarda el correo en minúsculas', async () => {
      await conCuenta();
      await invitar({ email: INVITADO.toUpperCase() }).expect(201);

      // `Ana@club.cl` y `ana@club.cl` son la misma persona. Con dos filas, la
      // segunda invitación no haría nada y nadie sabría por qué.
      expect(
        await prisma.invitacionSocio.findUnique({ where: { email: INVITADO } }),
      ).not.toBeNull();
    });

    it('el admin puede fijar el número y hasta cuándo está al día', async () => {
      await conCuenta();
      const respuesta = await invitar({
        email: INVITADO,
        numeroSocio: 'T32-007',
        alDiaHasta: '2027-03-31',
      }).expect(201);

      expect(respuesta.body).toMatchObject({ numeroSocio: 'T32-007' });
    });

    it('el mismo correo dos veces responde 409', async () => {
      await conCuenta();
      await invitar({ email: INVITADO }).expect(201);
      await invitar({ email: INVITADO }).expect(409);
    });

    it('un correo sin forma de correo, 400', async () => {
      await invitar({ email: 'no-es-un-correo' }).expect(400);
    });
  });

  describe('una invitación de antes se cumple al registrarse (D14)', () => {
    it('quien se registra con un correo invitado queda con ficha de socio', async () => {
      // **Test obligatorio de T32.**
      await invitacionVieja();
      await registrarse().expect(201);

      expect((await quienEs(INVITADO)).socioId).not.toBeNull();
    });

    it('el socio nuevo estrena el número que le asignó el club', async () => {
      await invitacionVieja('T32-042');
      await registrarse().expect(201);

      const usuario = await prisma.usuario.findUniqueOrThrow({
        where: { email: INVITADO },
        select: { socio: { select: { numeroSocio: true } } },
      });
      expect(usuario.socio?.numeroSocio).toBe('T32-042');
    });

    it('entrando por Google pasa exactamente lo mismo', async () => {
      // **Test obligatorio de T32**: es el camino que se olvida. Dos copias de la
      // regla dejarían sin ficha justo a quien entra con Google.
      await invitacionVieja();
      await entrarConGoogle();

      const usuario = await prisma.usuario.findUniqueOrThrow({
        where: { email: INVITADO },
        select: { socio: { select: { id: true } } },
      });
      expect(usuario.socio).not.toBeNull();
    });

    it('la invitación queda marcada como usada, no borrada', async () => {
      await invitacionVieja();
      await registrarse().expect(201);

      const invitacion = await prisma.invitacionSocio.findUniqueOrThrow({
        where: { email: INVITADO },
      });
      // Es la única traza de a quién invitó el club y cuándo se sumó.
      expect(invitacion.usadaEn).not.toBeNull();
    });

    it('sin invitación, quien se registra queda como visitante', async () => {
      await registrarse().expect(201);

      expect((await quienEs(INVITADO)).socioId).toBeNull();
    });

    it('la respuesta del registro es la misma con y sin invitación', async () => {
      // Lo que impide enumerar socios: si la invitación cambiara la respuesta,
      // probar correos diría quién está invitado al club.
      const sinInvitacion = await registrarse().expect(201);
      await prisma.usuario.deleteMany({ where: { email: INVITADO } });

      await invitacionVieja();
      const conInvitacion = await registrarse().expect(201);

      expect(conInvitacion.body).toEqual(sinInvitacion.body);
    });
  });

  describe('invitar a quien ya tiene cuenta', () => {
    it('lo asocia en el acto, sin esperar a que se registre otra vez', async () => {
      await registrarse().expect(201);
      expect((await quienEs(INVITADO)).socioId).toBeNull();

      await invitar({ email: INVITADO }).expect(201);

      // Sin esto, invitar a alguien que ya se había registrado como visitante no
      // produce ningún efecto visible y el admin no se entera.
      expect((await quienEs(INVITADO)).socioId).not.toBeNull();
    });

    it('la invitación nace usada', async () => {
      await registrarse().expect(201);
      await invitar({ email: INVITADO }).expect(201);

      const invitacion = await prisma.invitacionSocio.findUniqueOrThrow({
        where: { email: INVITADO },
      });
      expect(invitacion.usadaEn).not.toBeNull();
    });

    it('invitar a quien ya es socio responde 409', async () => {
      await registrarse().expect(201);
      await invitar({ email: INVITADO }).expect(201);

      await prisma.invitacionSocio.deleteMany({ where: { email: INVITADO } });
      await invitar({ email: INVITADO }).expect(409);
    });
  });

  describe('revocar', () => {
    it('una invitación sin usar se borra', async () => {
      const { id } = await invitacionVieja();

      await request(servidor())
        .delete(`/api/admin/socios/invitaciones/${id}`)
        .set('Cookie', admin)
        .expect(204);

      expect(await prisma.invitacionSocio.count({ where: { id } })).toBe(0);
    });

    it('revocar una que no existe responde 404, no 204', async () => {
      // Con un 204, el admin cree que borró una invitación que sigue viva.
      await request(servidor())
        .delete('/api/admin/socios/invitaciones/999999')
        .set('Cookie', admin)
        .expect(404);
    });

    it('una ya usada no: para eso está cambiar el estado del socio', async () => {
      const { id } = await invitacionVieja();
      await registrarse().expect(201);

      await request(servidor())
        .delete(`/api/admin/socios/invitaciones/${id}`)
        .set('Cookie', admin)
        .expect(409);
    });
  });

  describe('lo que ve el admin', () => {
    it('lista los socios del club y las invitaciones pendientes', async () => {
      await invitacionVieja();

      const respuesta = await request(servidor())
        .get('/api/admin/socios')
        .set('Cookie', admin)
        .expect(200);

      const cuerpo = respuesta.body as {
        socios: { numeroSocio: string }[];
        invitaciones: { email: string; usadaEn: string | null }[];
      };

      expect(cuerpo.invitaciones.map((i) => i.email)).toContain(INVITADO);
      // Solo las pendientes: una usada ya es un socio de la lista de arriba, y
      // mostrarla dos veces hace creer que falta algo por hacer.
      expect(cuerpo.invitaciones.every((i) => i.usadaEn === null)).toBe(true);
      expect(Array.isArray(cuerpo.socios)).toBe(true);
    });
  });

  /**
   * T297 (SPEC-panel.md D13 y A14). La consulta «Quiero asociarme» de quien se hace socio
   * se enlaza sola, donde se crea la ficha: así se sigue contando cuántos interesados se
   * vuelven socios, ahora que el alta ya no sale de la bandeja de consultas.
   */
  describe('la consulta de quien se asocia', () => {
    const consulta = (
      datos: {
        tipo?: TipoSolicitud;
        estado?: EstadoSolicitud;
        invitacionId?: number;
      } = {},
    ) =>
      prisma.solicitudContacto.create({
        data: {
          tipo: TipoSolicitud.SOCIO,
          nombre: 'Camila',
          email: INVITADO,
          telefono: '+56911112222',
          ...datos,
        },
      });

    const despuesDe = (id: number) =>
      prisma.solicitudContacto.findUniqueOrThrow({ where: { id } });

    it('**al hacerla socia, su consulta Nueva queda enlazada y atendida**', async () => {
      const nueva = await consulta();
      await conCuenta();

      const { id: invitacionId } = (
        await invitar({ email: INVITADO }).expect(201)
      ).body as { id: number };

      const enlazada = await despuesDe(nueva.id);
      expect(enlazada).toMatchObject({
        invitacionId,
        estado: EstadoSolicitud.ATENDIDA,
      });
      expect(enlazada.atendidaEn).not.toBeNull();
    });

    it('una descartada se enlaza sin cambiar de estado; una de otro tipo no se toca', async () => {
      const descartada = await consulta({ estado: EstadoSolicitud.DESCARTADA });
      const deClases = await consulta({ tipo: TipoSolicitud.CLASES });
      await conCuenta();

      const { id: invitacionId } = (
        await invitar({ email: INVITADO }).expect(201)
      ).body as { id: number };

      expect(await despuesDe(descartada.id)).toMatchObject({
        invitacionId,
        estado: EstadoSolicitud.DESCARTADA,
      });
      expect(await despuesDe(deClases.id)).toMatchObject({
        invitacionId: null,
        estado: EstadoSolicitud.NUEVA,
      });
    });

    it('una que ya tenía su enlace no se toca', async () => {
      const yaEnlazada = await consulta({
        estado: EstadoSolicitud.ATENDIDA,
        invitacionId: 999_999,
      });
      await conCuenta();

      await invitar({ email: INVITADO }).expect(201);

      expect((await despuesDe(yaEnlazada.id)).invitacionId).toBe(999_999);
    });

    it('**también se enlaza al cumplirse una invitación de antes** (D14)', async () => {
      const nueva = await consulta();
      const { id: invitacionId } = await invitacionVieja();

      await registrarse().expect(201);

      expect(await despuesDe(nueva.id)).toMatchObject({
        invitacionId,
        estado: EstadoSolicitud.ATENDIDA,
      });
    });
  });
});
