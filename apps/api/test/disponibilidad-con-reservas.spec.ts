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

    return respuesta.body.find(
      (b: { inicio: string }) =>
        new Date(b.inicio).getTime() === A_LAS_10.getTime(),
    );
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
    await app.init();
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
