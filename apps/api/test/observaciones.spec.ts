import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  EstadoReserva,
  EstadoSocio,
  Superficie,
} from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

interface Observacion {
  id: number;
  texto: string;
  autorId: number;
  autorNombre: string;
  creadaEn: string;
  editadaEn: string | null;
}

interface ReservaDeLaAgenda {
  id: number;
  folio: string;
  socioId: number | null;
  observaciones: Observacion[];
  observacionesAnteriores: number;
}

/**
 * T225. Las observaciones del mesón sobre una reserva (`SPEC-reservas.md` §
 * Observaciones del mesón, criterios 52–57): las escriben el admin y el gestor, las
 * corrigen el autor y el admin, y el socio no las ve nunca.
 *
 * En 2043, que nadie más usa.
 */
describe('Observaciones de las reservas', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@observaciones-t225.test';
  const CANCHA = 'Cancha T225';
  const CONTRASENA = 'raqueta lluviosa 44';
  const DIA = '2043-05-12';

  let canchaId: number;
  let socioId: number;
  let deLaSocia: number;
  let anteriores: number[];
  let delVisitante: number;
  const cookies: Record<string, string> = {};
  const ids: Record<string, number> = {};

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const crearCuenta = async (
    quien: string,
    datos: { esAdmin?: boolean; esGestor?: boolean } = {},
  ) => {
    ids[quien] = (
      await prisma.usuario.create({
        data: {
          email: `${quien}${DOMINIO}`,
          nombre: quien,
          apellido: 'T225',
          passwordHash: await hashear(CONTRASENA),
          ...datos,
        },
        select: { id: true },
      })
    ).id;

    const respuesta = await request(servidor())
      .post('/api/auth/login')
      .send({ email: `${quien}${DOMINIO}`, contrasena: CONTRASENA })
      .expect(204);
    cookies[quien] = (
      respuesta.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];
  };

  let folio = 0;
  const reserva = async (
    fecha: string,
    desde: string,
    hasta: string,
    socio = true,
  ) =>
    (
      await prisma.reserva.create({
        data: {
          folio: `T225${String((folio += 1)).padStart(3, '0')}`,
          canchaId,
          socioId: socio ? socioId : null,
          inicio: instanteEnElClub(fecha, desde),
          fin: instanteEnElClub(fecha, hasta),
          estado: EstadoReserva.CONFIRMADA,
          nombre: socio ? 'socia T225' : 'Visitante T225',
          email: `reserva${DOMINIO}`,
          telefono: '56900000000',
        },
        select: { id: true },
      })
    ).id;

  const como = (quien: string) => ({
    get: (ruta: string) =>
      request(servidor()).get(`/api/${ruta}`).set('Cookie', cookies[quien]),
    post: (ruta: string, cuerpo: object = {}) =>
      request(servidor())
        .post(`/api/${ruta}`)
        .set('Cookie', cookies[quien])
        .send(cuerpo),
    patch: (ruta: string, cuerpo: object = {}) =>
      request(servidor())
        .patch(`/api/${ruta}`)
        .set('Cookie', cookies[quien])
        .send(cuerpo),
    delete: (ruta: string) =>
      request(servidor()).delete(`/api/${ruta}`).set('Cookie', cookies[quien]),
  });

  const anotar = async (quien: string, reservaId: number, texto: string) =>
    (
      await como(quien)
        .post(`admin/reservas/${reservaId}/observaciones`, { texto })
        .expect(201)
    ).body as Observacion;

  const agenda = async (fecha = DIA) =>
    (await como('jefe').get(`admin/reservas?fecha=${fecha}`).expect(200))
      .body as ReservaDeLaAgenda[];

  const limpiar = async () => {
    await prisma.cancha.deleteMany({ where: { nombre: CANCHA } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);

    await limpiar();

    canchaId = (
      await prisma.cancha.create({
        data: { nombre: CANCHA, superficie: Superficie.CEMENTO },
        select: { id: true },
      })
    ).id;

    await crearCuenta('jefe', { esAdmin: true });
    await crearCuenta('gestora', { esGestor: true });
    await crearCuenta('otra-gestora', { esGestor: true });
    await crearCuenta('profe');
    await prisma.profesor.create({
      data: {
        nombreVisible: 'Profe T225',
        telefono: '56933334444',
        especialidad: 'Iniciación',
        usuarioId: ids.profe,
      },
    });
    await crearCuenta('socia');
    socioId = (
      await prisma.socio.create({
        data: {
          usuarioId: ids.socia,
          numeroSocio: 'T225-1',
          estado: EstadoSocio.ACTIVO,
          fechaIngreso: new Date('2026-01-01'),
          alDiaHasta: new Date('2099-12-31'),
        },
        select: { id: true },
      })
    ).id;

    deLaSocia = await reserva(DIA, '19:00', '20:00');
    anteriores = [
      await reserva('2043-05-01', '19:00', '20:00'),
      await reserva('2043-05-05', '19:00', '20:00'),
    ];
    delVisitante = await reserva(DIA, '10:00', '11:00', false);
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.observacionReserva.deleteMany({
      where: { reserva: { canchaId } },
    });
  });

  it('el gestor anota una observación: queda con su nombre y la hora, y sale en la agenda (52)', async () => {
    const nota = await anotar(
      'gestora',
      deLaSocia,
      'Se pasó 20 minutos de su hora.',
    );

    expect(nota).toMatchObject({
      texto: 'Se pasó 20 minutos de su hora.',
      autorId: ids.gestora,
      autorNombre: 'gestora T225',
      editadaEn: null,
    });

    const enLaAgenda = (await agenda()).find((r) => r.id === deLaSocia)!;
    expect(enLaAgenda.socioId).toBe(socioId);
    expect(enLaAgenda.observaciones.map((o) => o.texto)).toEqual([
      'Se pasó 20 minutos de su hora.',
    ]);
  });

  it('varias por reserva, en orden; y la reserva dice cuántas tiene el socio de antes (53)', async () => {
    await anotar('gestora', anteriores[0], 'Dejó la cancha sucia.');
    await anotar('jefe', anteriores[1], 'Llegó tarde.');
    await anotar('gestora', deLaSocia, 'Primera.');
    await anotar('jefe', deLaSocia, 'Segunda.');

    const dia = await agenda();
    const suya = dia.find((r) => r.id === deLaSocia)!;
    expect(suya.observaciones.map((o) => o.texto)).toEqual([
      'Primera.',
      'Segunda.',
    ]);
    expect(suya.observacionesAnteriores).toBe(2);

    // El visitante no tiene historial: nada lo une entre una reserva y otra.
    expect(dia.find((r) => r.id === delVisitante)).toMatchObject({
      socioId: null,
      observacionesAnteriores: 0,
    });
  });

  it('el historial del socio trae todas, de la reserva más nueva a la más vieja, con su fecha y su cancha (53)', async () => {
    await anotar('gestora', anteriores[0], 'Dejó la cancha sucia.');
    await anotar('gestora', deLaSocia, 'Se pasó de su hora.');

    const historial = (
      await como('gestora')
        .get(`admin/reservas/observaciones?socioId=${socioId}`)
        .expect(200)
    ).body as {
      texto: string;
      cancha: string;
      inicio: string;
      folio: string;
    }[];

    expect(historial.map((o) => o.texto)).toEqual([
      'Se pasó de su hora.',
      'Dejó la cancha sucia.',
    ]);
    expect(historial[0]).toMatchObject({ cancha: CANCHA });
    expect(new Date(historial[0].inicio)).toEqual(
      instanteEnElClub(DIA, '19:00'),
    );
  });

  describe('corregir y borrar (54)', () => {
    it('el autor corrige la suya, y queda la hora de la corrección', async () => {
      const nota = await anotar('gestora', deLaSocia, 'Se pasó 10 minutos.');

      const corregida = (
        await como('gestora')
          .patch(`admin/reservas/observaciones/${nota.id}`, {
            texto: 'Se pasó 20 minutos.',
          })
          .expect(200)
      ).body as Observacion;

      expect(corregida).toMatchObject({ texto: 'Se pasó 20 minutos.' });
      expect(corregida.editadaEn).not.toBeNull();
    });

    it('el admin corrige y borra la de cualquiera', async () => {
      const nota = await anotar('gestora', deLaSocia, 'Texto.');

      await como('jefe')
        .patch(`admin/reservas/observaciones/${nota.id}`, { texto: 'Otro.' })
        .expect(200);
      await como('jefe')
        .delete(`admin/reservas/observaciones/${nota.id}`)
        .expect(200);

      expect(
        await prisma.observacionReserva.count({ where: { id: nota.id } }),
      ).toBe(0);
    });

    it('otro gestor no toca la ajena: 403, y queda como estaba', async () => {
      const nota = await anotar('gestora', deLaSocia, 'De la gestora.');

      await como('otra-gestora')
        .patch(`admin/reservas/observaciones/${nota.id}`, { texto: 'No.' })
        .expect(403);
      await como('otra-gestora')
        .delete(`admin/reservas/observaciones/${nota.id}`)
        .expect(403);

      expect(
        await prisma.observacionReserva.findUniqueOrThrow({
          where: { id: nota.id },
          select: { texto: true },
        }),
      ).toEqual({ texto: 'De la gestora.' });
    });

    it('el autor borra la suya', async () => {
      const nota = await anotar(
        'gestora',
        deLaSocia,
        'Me equivoqué de reserva.',
      );

      await como('gestora')
        .delete(`admin/reservas/observaciones/${nota.id}`)
        .expect(200);

      expect(
        await prisma.observacionReserva.count({ where: { id: nota.id } }),
      ).toBe(0);
    });

    it('una observación que no existe responde 404', async () => {
      await como('jefe')
        .patch('admin/reservas/observaciones/999999999', { texto: 'x' })
        .expect(404);
    });
  });

  it('vacía, solo espacios o de más de 500 caracteres se rechaza con 400; 500 justos, no (56)', async () => {
    const ruta = `admin/reservas/${deLaSocia}/observaciones`;

    await como('gestora').post(ruta, { texto: '' }).expect(400);
    await como('gestora').post(ruta, { texto: '   ' }).expect(400);
    await como('gestora').post(ruta, {}).expect(400);
    await como('gestora')
      .post(ruta, { texto: 'a'.repeat(501) })
      .expect(400);
    await como('gestora')
      .post(ruta, { texto: 'a'.repeat(500) })
      .expect(201);
  });

  it('sobre una reserva que no existe responde 404', async () => {
    await como('gestora')
      .post('admin/reservas/999999999/observaciones', { texto: 'x' })
      .expect(404);
  });

  it('el socio no las ve nunca: ni en Mis reservas ni en su sesión (55)', async () => {
    await anotar('gestora', deLaSocia, 'Nota interna del club.');

    const mias = await como('socia').get('reservas/mias').expect(200);
    const yo = await como('socia').get('yo').expect(200);

    for (const cuerpo of [mias.body, yo.body]) {
      const texto = JSON.stringify(cuerpo);
      expect(texto).not.toContain('Nota interna del club.');
      expect(texto).not.toContain('"observaciones"');
    }
  });

  it('el profesor y el socio reciben 403 en las observaciones (57)', async () => {
    const nota = await anotar('gestora', deLaSocia, 'Texto.');

    for (const quien of ['profe', 'socia']) {
      await como(quien)
        .post(`admin/reservas/${deLaSocia}/observaciones`, { texto: 'x' })
        .expect(403);
      await como(quien)
        .patch(`admin/reservas/observaciones/${nota.id}`, { texto: 'x' })
        .expect(403);
      await como(quien)
        .delete(`admin/reservas/observaciones/${nota.id}`)
        .expect(403);
      await como(quien)
        .get(`admin/reservas/observaciones?socioId=${socioId}`)
        .expect(403);
    }
  });
});
