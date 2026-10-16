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

/**
 * T221. El gestor ve la agenda del día y no toca las horas (`SPEC-reservas.md` §
 * Observaciones del mesón, criterios 51 y 57; `SPEC-identidad.md` 26).
 *
 * En 2042, que nadie más usa.
 */
describe('El gestor en la agenda del día', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@agenda-t221.test';
  const CANCHA = 'Cancha T221';
  const CONTRASENA = 'raqueta lluviosa 44';
  const DIA = '2042-03-10';

  let canchaId: number;
  let reservaId: number;
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
          apellido: 'T221',
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
    reservaId = (
      await prisma.reserva.create({
        data: {
          folio: 'T221001',
          canchaId,
          inicio: instanteEnElClub(DIA, '19:00'),
          fin: instanteEnElClub(DIA, '20:00'),
          estado: EstadoReserva.CONFIRMADA,
          nombre: 'Visitante T221',
          email: `visitante${DOMINIO}`,
          telefono: '56900000000',
        },
        select: { id: true },
      })
    ).id;

    await crearCuenta('jefe', { esAdmin: true });
    await crearCuenta('gestora', { esGestor: true });
    await crearCuenta('profe');
    await prisma.profesor.create({
      data: {
        nombreVisible: 'Profe T221',
        telefono: '56933334444',
        especialidad: 'Iniciación',
        usuarioId: ids.profe,
      },
    });
    await crearCuenta('socia');
    await prisma.socio.create({
      data: {
        usuarioId: ids.socia,
        numeroSocio: 'T221-1',
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2026-01-01'),
        alDiaHasta: new Date('2099-12-31'),
      },
    });
    await crearCuenta('nueva');
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  it('el gestor ve la agenda del día con sus reservas (51)', async () => {
    const respuesta = await como('gestora')
      .get(`admin/reservas?fecha=${DIA}`)
      .expect(200);

    expect(
      (respuesta.body as { folio: string }[]).map((fila) => fila.folio),
    ).toContain('T221001');
  });

  it('el mesón le responde 403: no toma horas (51)', async () => {
    await como('gestora')
      .post('admin/reservas', {
        canchaId,
        inicio: instanteEnElClub(DIA, '10:00').toISOString(),
        duracionMin: 60,
        nombre: 'Alguien',
      })
      .expect(403);
    await como('gestora').get(`admin/reservas/cupo/${ids.socia}`).expect(403);
  });

  it('no cancela ni mueve la hora de nadie: le responde como a quien no es su dueño (51)', async () => {
    await como('gestora').delete(`reservas/${reservaId}`).expect(404);
    await como('gestora')
      .patch(`reservas/${reservaId}`, {
        canchaId,
        inicio: instanteEnElClub(DIA, '21:00').toISOString(),
        duracionMin: 60,
      })
      .expect(404);

    expect(
      await prisma.reserva.findUniqueOrThrow({
        where: { id: reservaId },
        select: { estado: true, inicio: true },
      }),
    ).toEqual({
      estado: EstadoReserva.CONFIRMADA,
      inicio: instanteEnElClub(DIA, '19:00'),
    });
  });

  it('al profesor y a la socia, la agenda y su stream les responden 403 (57)', async () => {
    for (const quien of ['profe', 'socia']) {
      await como(quien).get(`admin/reservas?fecha=${DIA}`).expect(403);
      await como(quien).get('admin/reservas/stream').expect(403);
    }
  });

  it('el gestor rige en la petición siguiente, sin volver a entrar (26)', async () => {
    await como('nueva').get(`admin/reservas?fecha=${DIA}`).expect(403);

    await como('jefe')
      .patch(`admin/usuarios/${ids.nueva}`, { esGestor: true })
      .expect(200);
    await como('nueva').get(`admin/reservas?fecha=${DIA}`).expect(200);

    await como('jefe')
      .patch(`admin/usuarios/${ids.nueva}`, { esGestor: false })
      .expect(200);
    await como('nueva').get(`admin/reservas?fecha=${DIA}`).expect(403);
  });
});
