import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  EstadoReserva,
  EstadoSocio,
  Superficie,
} from '../src/generated/prisma/client';
import { hoyEnElClub } from '../src/comun/tiempo';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T24, la parte HTTP: mis reservas, moverlas y cancelarlas.
 *
 * Las ventanas de 6 y 24 horas ya están probadas contra el servicio en
 * `reservas-modificacion.spec.ts`, donde el instante se puede controlar. Acá se
 * prueba el cableado —rutas, guards, forma de la respuesta— y sobre todo **de quién
 * es cada reserva**: es lo único que impide que alguien cancele la hora de otro.
 */
describe('GET /api/reservas/mias, PATCH y DELETE', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let canchaId: number;
  let socioId: number;
  let cookie: string;

  const NOMBRE_CANCHA = 'Cancha T24 HTTP';
  const DOMINIO = '@t24.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  /** Bloques reales de la grilla, dentro de tres días: sobra para las dos ventanas. */
  let bloques: { inicio: string; fin: string }[];

  const enTresDias = () =>
    new Date(hoyEnElClub().getTime() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

  const crearCuenta = async (
    sufijo: string,
    conFichaDeSocio = true,
  ): Promise<{ usuarioId: number; socioId: number | null }> => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'De prueba',
      });

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email: `${sufijo}${DOMINIO}` },
      select: { id: true },
    });

    if (!conFichaDeSocio) return { usuarioId: usuario.id, socioId: null };

    const socio = await prisma.socio.create({
      data: {
        usuarioId: usuario.id,
        numeroSocio: `T24-${sufijo}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2026-01-01'),
        alDiaHasta: new Date('2027-01-01'),
      },
      select: { id: true },
    });

    return { usuarioId: usuario.id, socioId: socio.id };
  };

  const entrar = async (email: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA });

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  const unaReservaDe = (
    duenoId: number | null,
    bloque: { inicio: string; fin: string },
  ) =>
    prisma.reserva.create({
      data: {
        folio: `M${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        canchaId,
        inicio: new Date(bloque.inicio),
        fin: new Date(bloque.fin),
        estado: EstadoReserva.CONFIRMADA,
        socioId: duenoId,
        nombre: 'Titular',
        email: `titular${DOMINIO}`,
        telefono: '+56911112222',
      },
      select: { id: true, folio: true },
    });

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
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    const cancha = await prisma.cancha.create({
      data: {
        nombre: NOMBRE_CANCHA,
        superficie: Superficie.ARCILLA,
        // Todos los días, para que el bloque de dentro de tres días exista sin
        // depender de qué día es hoy.
        horarios: {
          create: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
            diaSemana,
            horaApertura: '08:00',
            horaCierre: '22:00',
          })),
        },
        franjas: {
          create: {
            horaDesde: '08:00',
            horaHasta: '22:00',
            montoClp: 12000,
            vigenteDesde: new Date('2026-01-01'),
          },
        },
      },
      select: { id: true },
    });
    canchaId = cancha.id;

    // Los bloques se piden a la grilla en vez de calcularlos acá: es la misma fuente
    // que usa el servicio, así que el test no puede quedar corrido por la zona horaria.
    const grilla = await request(app.getHttpServer())
      .get('/api/disponibilidad')
      .query({ cancha: canchaId, fecha: enTresDias() });
    bloques = grilla.body as { inicio: string; fin: string }[];

    const titular = await crearCuenta('titular');
    socioId = titular.socioId!;
    cookie = await entrar(`titular${DOMINIO}`);
  });

  describe('GET /api/reservas/mias', () => {
    it('lista las reservas del socio con lo que hace falta para mostrarlas', async () => {
      const reserva = await unaReservaDe(socioId, bloques[0]);

      const respuesta = await request(app.getHttpServer())
        .get('/api/reservas/mias')
        .set('Cookie', cookie);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toHaveLength(1);
      expect((respuesta.body as unknown[])[0]).toMatchObject({
        id: reserva.id,
        folio: reserva.folio,
        cancha: NOMBRE_CANCHA,
        estado: EstadoReserva.CONFIRMADA,
        // Falta más de un día: se puede mover, y como no hubo pago no hay plata que
        // devolver. La pantalla necesita las dos cosas *antes* de que la persona
        // apriete cancelar.
        sePuedeModificar: true,
        pagada: false,
        devolucionAlCancelar: false,
      });
    });

    it('no muestra las reservas de otro socio', async () => {
      const otro = await crearCuenta('otro');
      await unaReservaDe(otro.socioId, bloques[0]);

      const respuesta = await request(app.getHttpServer())
        .get('/api/reservas/mias')
        .set('Cookie', cookie);

      expect(respuesta.body).toEqual([]);
    });

    it('no muestra las canceladas ni las que ya pasaron', async () => {
      const cancelada = await unaReservaDe(socioId, bloques[0]);
      await prisma.reserva.update({
        where: { id: cancelada.id },
        data: { estado: EstadoReserva.CANCELADA },
      });
      // Una hora de la semana pasada: sigue en la base para el historial, pero en
      // "mis reservas" solo estorba.
      await prisma.reserva.create({
        data: {
          folio: 'PASADA1',
          canchaId,
          inicio: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
          fin: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000 + 3_600_000),
          estado: EstadoReserva.CONFIRMADA,
          socioId,
          nombre: 'Titular',
          email: `titular${DOMINIO}`,
          telefono: '',
        },
      });

      const respuesta = await request(app.getHttpServer())
        .get('/api/reservas/mias')
        .set('Cookie', cookie);

      expect(respuesta.body).toEqual([]);
    });

    it('la hora que se está jugando ahora mismo sigue en la lista', async () => {
      // Empezó hace veinte minutos y termina en cuarenta. Filtrando por `inicio`
      // desaparecería justo cuando la persona la muestra en el mesón.
      await prisma.reserva.create({
        data: {
          folio: 'ENCURSO',
          canchaId,
          inicio: new Date(Date.now() - 20 * 60 * 1000),
          fin: new Date(Date.now() + 40 * 60 * 1000),
          estado: EstadoReserva.CONFIRMADA,
          socioId,
          nombre: 'Titular',
          email: `titular${DOMINIO}`,
          telefono: '',
        },
      });

      const respuesta = await request(app.getHttpServer())
        .get('/api/reservas/mias')
        .set('Cookie', cookie);

      expect(respuesta.body).toHaveLength(1);
    });

    it('sin sesión, no hay lista', async () => {
      const respuesta = await request(app.getHttpServer()).get(
        '/api/reservas/mias',
      );

      expect(respuesta.status).toBe(401);
    });

    it('quien no es socio no ve las reservas de los visitantes', async () => {
      // Una reserva de no-socio tiene `socioId` nulo. Quien entró sin ficha de socio
      // también tiene `socioId` nulo: comparar los dos con `===` le entregaría las
      // reservas de todos los visitantes del club.
      await unaReservaDe(null, bloques[0]);
      await crearCuenta('sinficha', false);
      const suya = await entrar(`sinficha${DOMINIO}`);

      const respuesta = await request(app.getHttpServer())
        .get('/api/reservas/mias')
        .set('Cookie', suya);

      expect(respuesta.body).toEqual([]);
    });
  });

  describe('PATCH /api/reservas/:id', () => {
    it('mueve la reserva a otro bloque de la grilla', async () => {
      const reserva = await unaReservaDe(socioId, bloques[0]);

      const respuesta = await request(app.getHttpServer())
        .patch(`/api/reservas/${reserva.id}`)
        .set('Cookie', cookie)
        .send({ canchaId, inicio: bloques[1].inicio });

      expect(respuesta.status).toBe(200);
      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } }),
      ).toMatchObject({ inicio: new Date(bloques[1].inicio) });
    });

    it('una hora que no está en la grilla se rechaza', async () => {
      const reserva = await unaReservaDe(socioId, bloques[0]);

      const respuesta = await request(app.getHttpServer())
        .patch(`/api/reservas/${reserva.id}`)
        .set('Cookie', cookie)
        .send({ canchaId, inicio: '2026-01-01T05:00:00.000Z' });

      expect(respuesta.status).toBe(404);
    });

    it('un cuerpo sin hora se rechaza con 400 y no con 500', async () => {
      const reserva = await unaReservaDe(socioId, bloques[0]);

      const respuesta = await request(app.getHttpServer())
        .patch(`/api/reservas/${reserva.id}`)
        .set('Cookie', cookie)
        .send({ canchaId });

      expect(respuesta.status).toBe(400);
    });

    it('la reserva de otro socio responde como si no existiera', async () => {
      const otro = await crearCuenta('ajeno');
      const ajena = await unaReservaDe(otro.socioId, bloques[0]);

      const respuesta = await request(app.getHttpServer())
        .patch(`/api/reservas/${ajena.id}`)
        .set('Cookie', cookie)
        .send({ canchaId, inicio: bloques[1].inicio });

      expect(respuesta.status).toBe(404);
    });
  });

  describe('DELETE /api/reservas/:id', () => {
    it('cancela y explica que no había plata que devolver', async () => {
      const reserva = await unaReservaDe(socioId, bloques[0]);

      const respuesta = await request(app.getHttpServer())
        .delete(`/api/reservas/${reserva.id}`)
        .set('Cookie', cookie);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({
        folio: reserva.folio,
        huboDevolucion: false,
      });
      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } }),
      ).toMatchObject({ estado: EstadoReserva.CANCELADA });
    });

    it('la reserva de otro socio responde como si no existiera', async () => {
      const otro = await crearCuenta('ajeno2');
      const ajena = await unaReservaDe(otro.socioId, bloques[0]);

      const respuesta = await request(app.getHttpServer())
        .delete(`/api/reservas/${ajena.id}`)
        .set('Cookie', cookie);

      expect(respuesta.status).toBe(404);
      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: ajena.id } }),
      ).toMatchObject({ estado: EstadoReserva.CONFIRMADA });
    });

    it('quien no es socio no cancela la reserva de un visitante', async () => {
      // El mismo agujero del `socioId` nulo, pero acá cuesta una cancha: quien entró
      // sin ficha de socio podría cancelar cualquier reserva pagada del club.
      const delVisitante = await unaReservaDe(null, bloques[0]);
      await crearCuenta('sinficha2', false);
      const suya = await entrar(`sinficha2${DOMINIO}`);

      const respuesta = await request(app.getHttpServer())
        .delete(`/api/reservas/${delVisitante.id}`)
        .set('Cookie', suya);

      expect(respuesta.status).toBe(404);
      expect(
        await prisma.reserva.findUniqueOrThrow({
          where: { id: delVisitante.id },
        }),
      ).toMatchObject({ estado: EstadoReserva.CONFIRMADA });
    });

    it('el admin cancela la de cualquiera', async () => {
      const reserva = await unaReservaDe(null, bloques[0]);
      const admin = await crearCuenta('admin', false);
      await prisma.usuario.update({
        where: { id: admin.usuarioId },
        data: { esAdmin: true },
      });
      const suya = await entrar(`admin${DOMINIO}`);

      const respuesta = await request(app.getHttpServer())
        .delete(`/api/reservas/${reserva.id}`)
        .set('Cookie', suya);

      expect(respuesta.status).toBe(200);
    });

    it('sin sesión, no se cancela nada', async () => {
      const reserva = await unaReservaDe(socioId, bloques[0]);

      const respuesta = await request(app.getHttpServer()).delete(
        `/api/reservas/${reserva.id}`,
      );

      expect(respuesta.status).toBe(401);
    });
  });
});
