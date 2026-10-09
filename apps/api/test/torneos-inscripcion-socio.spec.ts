import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { sembrarCategoriasDeJuego } from '../src/arranque';
import { EstadoSocio } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T129: el socio se inscribe sin llenar el formulario (punto 5 de la sexta parte).
 *
 * Elige la categoría, dice cuándo no puede jugar y paga **igual** que cualquiera
 * (decisión 5). Lo demás sale de su cuenta: el jugador es el de su ficha y el correo,
 * el de la cuenta.
 */
describe('POST /api/torneos/:id/inscripcion-socio', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let carpeta: string;

  let cookieSocio: string;
  let cookieSinFicha: string;
  let usuarioSocio: number;
  let socioId: number;
  let cuartaId: number;

  const DOMINIO = '@inscripcion-socio.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Copa del socio';
  const APELLIDO = 'DeLaFicha';
  const TELEFONO = '56955551111';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const crearCuenta = async (sufijo: string) => {
    await request(servidor())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: 'Javiera',
        apellido: APELLIDO,
      })
      .expect(201);

    return (
      await prisma.usuario.findUniqueOrThrow({
        where: { email: `${sufijo}${DOMINIO}` },
        select: { id: true },
      })
    ).id;
  };

  const entrar = async (sufijo: string) =>
    (
      (
        await request(servidor())
          .post('/api/auth/login')
          .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA })
          .expect(204)
      ).headers['set-cookie'] as unknown as string[]
    )[0];

  const crearTorneo = async (montoInscripcionClp = 0) => {
    const categoria = await prisma.categoriaTorneo.create({
      data: {
        nombre: `CatSocio ${Date.now()}${Math.random()}`,
        puntosCampeon: 250,
      },
    });

    return (
      await prisma.torneo.create({
        data: {
          nombre: `${MARCA} ${Date.now()}${Math.random()}`,
          fechaInicio: new Date('2027-12-01T00:00:00.000Z'),
          fechaFin: new Date('2027-12-07T00:00:00.000Z'),
          cierreInscripcion: new Date('2027-11-25T00:00:00.000Z'),
          cuadros: {
            create: {
              categoriaId: categoria.id,
              categoriaJuegoId: cuartaId,
              cupo: 8,
              montoInscripcionClp,
            },
          },
        },
        select: { id: true },
      })
    ).id;
  };

  const inscribirse = (
    torneoId: number,
    cuerpo: Record<string, unknown> = {},
    cookie = cookieSocio,
  ) =>
    request(servidor())
      .post(`/api/torneos/${torneoId}/inscripcion-socio`)
      .set('Cookie', cookie)
      .send({ categoriaJuegoId: cuartaId, ...cuerpo });

  /** La inscripción de este torneo, con su jugador. */
  const laInscripcion = (torneoId: number) =>
    prisma.inscripcionTorneo.findFirstOrThrow({
      where: { torneoId },
      select: {
        email: true,
        estadoPago: true,
        medioPago: true,
        comprobanteRuta: true,
        restricciones: { select: { diaSemana: true } },
        jugador: { select: { id: true, socioId: true, telefono: true } },
      },
    });

  const limpiar = async () => {
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatSocio' } },
    });
  };

  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'comprobantes-socio-'));
    process.env.SUBIDAS_DIR = carpeta;

    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
    await sembrarCategoriasDeJuego(prisma);
    cuartaId = (
      await prisma.categoriaJuego.findUniqueOrThrow({ where: { nombre: '4ª' } })
    ).id;

    await limpiar();
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    usuarioSocio = await crearCuenta('socia');
    socioId = (
      await prisma.socio.create({
        data: {
          usuarioId: usuarioSocio,
          numeroSocio: `SOC-${Date.now()}`,
          estado: EstadoSocio.ACTIVO,
          fechaIngreso: new Date('2020-01-01T00:00:00.000Z'),
          alDiaHasta: new Date('2027-01-01T00:00:00.000Z'),
        },
        select: { id: true },
      })
    ).id;
    cookieSocio = await entrar('socia');

    await crearCuenta('visita');
    cookieSinFicha = await entrar('visita');
  });

  afterAll(async () => {
    await limpiar();
    await prisma.socio.deleteMany({ where: { usuarioId: usuarioSocio } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
    await rm(carpeta, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await limpiar();
    await prisma.usuario.update({
      where: { id: usuarioSocio },
      data: { telefono: TELEFONO },
    });
  });

  it('el socio se inscribe con su ficha y el correo de su cuenta', async () => {
    const torneoId = await crearTorneo();

    const respuesta = await inscribirse(torneoId).expect(201);

    expect(respuesta.body).toMatchObject({
      estado: 'INSCRITA',
      categoria: '4ª',
      jugador: `Javiera ${APELLIDO}`,
    });
    const inscripcion = await laInscripcion(torneoId);
    expect(inscripcion.jugador.socioId).toBe(socioId);
    expect(inscripcion.email).toBe(`socia${DOMINIO}`);
  });

  it('**los datos salen de la sesión, no del cuerpo**', async () => {
    // Un cuerpo con otro nombre u otro correo no inscribe a otra persona: el camino
    // del socio no lee nada de eso.
    const torneoId = await crearTorneo();

    await inscribirse(torneoId, {
      nombre: 'Otra',
      email: 'otra@ejemplo.cl',
    }).expect(201);

    expect((await laInscripcion(torneoId)).email).toBe(`socia${DOMINIO}`);
  });

  it('dice cuándo no puede jugar, como en el formulario', async () => {
    const torneoId = await crearTorneo();

    await inscribirse(torneoId, {
      restricciones: [{ diaSemana: 2, horaDesde: '18:00', horaHasta: '21:00' }],
    }).expect(201);

    expect((await laInscripcion(torneoId)).restricciones).toEqual([
      { diaSemana: 2 },
    ]);
  });

  it('**sin ficha de socio responde 403**, y sin sesión 401', async () => {
    const torneoId = await crearTorneo();

    await inscribirse(torneoId, {}, cookieSinFicha).expect(403);
    await request(servidor())
      .post(`/api/torneos/${torneoId}/inscripcion-socio`)
      .send({ categoriaJuegoId: cuartaId })
      .expect(401);
  });

  describe('su jugador', () => {
    it('**el que ya jugó como externo queda vinculado**, sin crear otro', async () => {
      // Jugó el año pasado desde la calle, con su nombre y su teléfono: sus puntos y
      // su historial cuelgan de ese jugador, y partirlo en dos los separaría.
      const externo = await prisma.jugador.create({
        data: { nombre: 'Javiera', apellido: APELLIDO, telefono: TELEFONO },
        select: { id: true },
      });

      await inscribirse(await crearTorneo()).expect(201);

      const jugadores = await prisma.jugador.findMany({
        where: { apellido: APELLIDO },
        select: { id: true, socioId: true },
      });
      expect(jugadores).toEqual([{ id: externo.id, socioId }]);
    });

    it('en el torneo siguiente se reutiliza el mismo', async () => {
      await inscribirse(await crearTorneo()).expect(201);
      await inscribirse(await crearTorneo()).expect(201);

      expect(
        await prisma.jugador.count({ where: { apellido: APELLIDO } }),
      ).toBe(1);
    });

    it('**sin teléfono en la cuenta también puede inscribirse** (A6)', async () => {
      // Quien entró con Google no tiene teléfono: el jugador cuelga de su ficha y no
      // necesita el número como llave.
      await prisma.usuario.update({
        where: { id: usuarioSocio },
        data: { telefono: null },
      });
      const torneoId = await crearTorneo();

      await inscribirse(torneoId).expect(201);

      expect((await laInscripcion(torneoId)).jugador).toMatchObject({
        socioId,
        telefono: null,
      });
    });

    it('**el admin que anota al socio también lo vincula**, en vez de chocar', async () => {
      // Era el mismo defecto por la otra puerta: `deSocio` creaba un jugador con el
      // nombre y el teléfono de uno que ya existía, y la base lo rechazaba.
      const externo = await prisma.jugador.create({
        data: { nombre: 'Javiera', apellido: APELLIDO, telefono: TELEFONO },
        select: { id: true },
      });
      const torneoId = await crearTorneo();
      const cuadro = await prisma.torneoCategoria.findFirstOrThrow({
        where: { torneoId },
      });
      await prisma.usuario.update({
        where: { email: `visita${DOMINIO}` },
        data: { esAdmin: true },
      });

      await request(servidor())
        .post(`/api/admin/cuadros/${cuadro.id}/inscripciones`)
        .set('Cookie', cookieSinFicha)
        .send({ socioId })
        .expect(201);

      expect((await laInscripcion(torneoId)).jugador.id).toBe(externo.id);
      await prisma.usuario.update({
        where: { email: `visita${DOMINIO}` },
        data: { esAdmin: false },
      });
    });
  });

  describe('**paga igual que cualquiera** (decisión 5)', () => {
    it('un cuadro con monto no se toma sin decir cómo se paga', async () => {
      const torneoId = await crearTorneo(15_000);

      await inscribirse(torneoId).expect(400);

      expect(
        await prisma.inscripcionTorneo.count({ where: { torneoId } }),
      ).toBe(0);
    });

    it('con Webpay nace pendiente y devuelve su llave para pagar', async () => {
      const torneoId = await crearTorneo(15_000);

      const respuesta = await inscribirse(torneoId, {
        medioPago: 'WEBPAY',
      }).expect(201);

      expect(respuesta.body).toMatchObject({
        estadoPago: 'PENDIENTE',
        montoClp: 15_000,
      });
      expect(typeof (respuesta.body as { token: string }).token).toBe('string');
    });

    it('transfiriendo, el comprobante viaja en el mismo envío', async () => {
      const torneoId = await crearTorneo(15_000);
      const imagen = await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 3,
          background: { r: 10, g: 90, b: 200 },
        },
      })
        .jpeg()
        .toBuffer();

      await request(servidor())
        .post(`/api/torneos/${torneoId}/inscripcion-socio`)
        .set('Cookie', cookieSocio)
        .field('categoriaJuegoId', String(cuartaId))
        .field('medioPago', 'TRANSFERENCIA')
        .attach('comprobante', imagen, 'transferencia.jpg')
        .expect(201);

      const inscripcion = await laInscripcion(torneoId);
      expect(inscripcion.medioPago).toBe('TRANSFERENCIA');
      expect(inscripcion.comprobanteRuta).not.toBeNull();
    });

    it('transferir sin adjuntar el comprobante se rechaza', async () => {
      const torneoId = await crearTorneo(15_000);

      await inscribirse(torneoId, { medioPago: 'TRANSFERENCIA' }).expect(400);
    });
  });
});
