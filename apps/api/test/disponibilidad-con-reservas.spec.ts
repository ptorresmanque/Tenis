import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  ConceptoPago,
  EstadoReserva,
  EstadoTransaccion,
  Superficie,
} from '../src/generated/prisma/client';
import { MINUTOS_PARA_EXPIRAR } from '../src/pagos/expiracion';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventosDeReserva } from '../src/reservas/eventos';

/**
 * T23. La grilla pública tiene que decir la verdad: un bloque reservado no se ofrece.
 *
 * Hasta T22 la disponibilidad solo sabía de horarios y bloqueos —`catalogo-canchas` no
 * conoce las reservas a propósito—, así que la pantalla mostraba libre una hora que ya
 * estaba tomada y el choque aparecía recién al confirmar. Acá `reservas` superpone lo
 * suyo, que es lo que `SPEC-reservas.md` § Contrato describe.
 */
describe('GET /api/disponibilidad — con las reservas superpuestas', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let canchaId: number;

  const NOMBRE_CANCHA = 'Cancha T23 grilla';
  const LUNES = '2026-08-17';
  const A_LAS_10 = new Date('2026-08-17T14:00:00.000Z');
  const A_LAS_11 = new Date('2026-08-17T15:00:00.000Z');

  const bloqueDeLas10 = async () => {
    const respuesta = await request(app.getHttpServer()).get(
      `/api/disponibilidad?cancha=${canchaId}&fecha=${LUNES}`,
    );

    // supertest entrega el cuerpo como `any`; esto es lo que leen estos tests.
    return (
      respuesta.body as {
        inicio: string;
        reservado: boolean;
        montoClp: number;
      }[]
    ).find((b) => new Date(b.inicio).getTime() === A_LAS_10.getTime())!;
  };

  const unaReserva = (parche: Record<string, unknown> = {}) => ({
    folio: `T23${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    canchaId,
    inicio: A_LAS_10,
    fin: A_LAS_11,
    estado: EstadoReserva.CONFIRMADA,
    nombre: 'Visitante',
    email: 'visitante@ejemplo.cl',
    telefono: '+56900000000',
    ...parche,
  });

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
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    const cancha = await prisma.cancha.create({
      data: {
        nombre: NOMBRE_CANCHA,
        superficie: Superficie.ARCILLA,
        horarios: {
          create: { diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' },
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
  });

  it('un bloque sin reservas se ofrece libre', async () => {
    expect(await bloqueDeLas10()).toMatchObject({
      reservado: false,
      montoClp: 12000,
    });
  });

  it('un bloque reservado aparece tomado', async () => {
    await prisma.reserva.create({ data: unaReserva() });

    expect((await bloqueDeLas10()).reservado).toBe(true);
  });

  it('una reserva de 10:00 a 11:00 toma también los inicios de 09:30 y 10:30 (T78)', async () => {
    // Con inicios cada media hora, la grilla marca tomada toda hora que se pise con
    // una reserva, no solo la que empieza con ella. Ofrecer las 10:30 libre sería
    // invitar a pagar una hora que el índice va a rechazar.
    await prisma.reserva.create({ data: unaReserva() });

    const respuesta = await request(app.getHttpServer()).get(
      `/api/disponibilidad?cancha=${canchaId}&fecha=${LUNES}`,
    );
    const tomadas = (respuesta.body as { inicio: string; reservado: boolean }[])
      .filter((b) => b.reservado)
      .map((b) => b.inicio);

    expect(tomadas).toEqual([
      '2026-08-17T13:30:00.000Z',
      '2026-08-17T14:00:00.000Z',
      '2026-08-17T14:30:00.000Z',
    ]);
  });

  it('una reserva esperando pago también lo ocupa', async () => {
    // Mientras el no-socio está en Webpay, esa hora no se le ofrece a nadie más.
    await prisma.reserva.create({
      data: unaReserva({ estado: EstadoReserva.PENDIENTE_PAGO }),
    });

    expect((await bloqueDeLas10()).reservado).toBe(true);
  });

  it('una reserva cancelada devuelve el bloque a la grilla', async () => {
    await prisma.reserva.create({
      data: unaReserva({ estado: EstadoReserva.CANCELADA }),
    });

    expect((await bloqueDeLas10()).reservado).toBe(false);
  });

  it('no filtra quién reservó', async () => {
    // La grilla es pública: decir el nombre de quien reservó sería publicar quién
    // juega y cuándo, que no es de nadie más.
    await prisma.reserva.create({
      data: unaReserva({ nombre: 'Sofía Reservó' }),
    });

    expect(JSON.stringify(await bloqueDeLas10())).not.toMatch(/Sofía/);
  });

  it('un bloque tomado no muestra precio', async () => {
    // Igual que el bloqueado en T12: un monto al lado de "reservado" invita a
    // intentar pagarlo.
    await prisma.reserva.create({ data: unaReserva() });

    expect((await bloqueDeLas10()).montoClp).toBe(0);
  });

  describe('el barrido de pendientes vencidas ocurre al consultar', () => {
    it('libera el bloque de una reserva cuyo pago nunca llegó', async () => {
      // El criterio de T19 que no se podía cerrar sin `Reserva`: sin barrido, quien
      // abandona el pago deja la cancha tomada para siempre.
      const reserva = await prisma.reserva.create({
        data: unaReserva({ estado: EstadoReserva.PENDIENTE_PAGO }),
      });
      const transaccion = await prisma.transaccion.create({
        data: {
          referencia: `T23EXP${Date.now()}`,
          concepto: ConceptoPago.RESERVA,
          conceptoId: reserva.id,
          montoClp: 12000,
          pasarela: 'doble',
          estado: EstadoTransaccion.PENDIENTE,
          creadaEn: new Date(Date.now() - (MINUTOS_PARA_EXPIRAR + 1) * 60_000),
        },
      });

      expect((await bloqueDeLas10()).reservado).toBe(false);

      expect(
        await prisma.transaccion.findUniqueOrThrow({
          where: { id: transaccion.id },
        }),
      ).toMatchObject({ estado: EstadoTransaccion.EXPIRADA });
      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } }),
      ).toMatchObject({ estado: EstadoReserva.EXPIRADA });
    });

    it('**también libera la que expiró otra consulta**', async () => {
      // El barrido es global y la liberación es por cancha y día. Si otra consulta —el
      // lunes, otra cancha, o la misma grilla del día con sus ocho canchas en paralelo—
      // expiró la transacción primero, esta encontraba "cero expiradas" y se iba sin
      // liberar: la reserva quedaba PENDIENTE_PAGO y la hora tomada para siempre.
      // Encontrado el 2026-10-04 con una reserva de prueba que no se liberaba.
      const reserva = await prisma.reserva.create({
        data: unaReserva({ estado: EstadoReserva.PENDIENTE_PAGO }),
      });
      await prisma.transaccion.create({
        data: {
          referencia: `T23YAEXP${Date.now()}`,
          concepto: ConceptoPago.RESERVA,
          conceptoId: reserva.id,
          montoClp: 12000,
          pasarela: 'doble',
          estado: EstadoTransaccion.EXPIRADA,
          creadaEn: new Date(Date.now() - (MINUTOS_PARA_EXPIRAR + 1) * 60_000),
        },
      });

      const bloque = (await bloqueDeLas10()) as { reservado: boolean };
      expect(bloque.reservado).toBe(false);
      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } }),
      ).toMatchObject({ estado: EstadoReserva.EXPIRADA });
    });

    it('avisa al panel del admin que esa hora se liberó (T26)', async () => {
      // El panel se repuebla con los avisos del servidor. Si el barrido libera el
      // bloque en silencio, el club sigue viendo "Esperando el pago" por una hora que
      // ya volvió a la venta, y esa pantalla es la que usa para trabajar.
      const reserva = await prisma.reserva.create({
        data: unaReserva({ estado: EstadoReserva.PENDIENTE_PAGO }),
      });
      await prisma.transaccion.create({
        data: {
          referencia: `T26EXP${Date.now()}`,
          concepto: ConceptoPago.RESERVA,
          conceptoId: reserva.id,
          montoClp: 12000,
          pasarela: 'doble',
          estado: EstadoTransaccion.PENDIENTE,
          creadaEn: new Date(Date.now() - (MINUTOS_PARA_EXPIRAR + 1) * 60_000),
        },
      });

      const avisos: string[] = [];
      const suscripcion = app
        .get(EventosDeReserva)
        .flujo.subscribe((cambio) => avisos.push(cambio.fecha));

      await bloqueDeLas10();
      suscripcion.unsubscribe();

      expect(avisos).toContain(LUNES);
    });

    it('no toca una reserva cuyo pago recién empezó', async () => {
      const reserva = await prisma.reserva.create({
        data: unaReserva({ estado: EstadoReserva.PENDIENTE_PAGO }),
      });
      await prisma.transaccion.create({
        data: {
          referencia: `T23VIVA${Date.now()}`,
          concepto: ConceptoPago.RESERVA,
          conceptoId: reserva.id,
          montoClp: 12000,
          pasarela: 'doble',
          estado: EstadoTransaccion.PENDIENTE,
        },
      });

      // Expirar a alguien que está tecleando su tarjeta le quita el bloque en la
      // mitad del pago.
      expect((await bloqueDeLas10()).reservado).toBe(true);
    });
  });
});
