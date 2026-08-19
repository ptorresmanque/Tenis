import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  EstadoReserva,
  EstadoTransaccion,
  Superficie,
} from '../src/generated/prisma/client';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T23. El corazón de la demo: un visitante sin cuenta reserva una hora y la paga.
 *
 * El bloque queda tomado mientras está pagando y vuelve a la grilla si el pago no
 * llega. Todo contra el doble de pasarela, que para eso se construyó antes que el
 * adaptador de Webpay (T16).
 */
describe('Reserva de no-socio con pago', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pasarela: PasarelaFake;
  let canchaId: number;

  const NOMBRE_CANCHA = 'Cancha T23 pago';
  const LUNES = '2026-08-17';
  const A_LAS_10 = '2026-08-17T14:00:00.000Z';

  const datosDelVisitante = {
    nombre: 'Camila Visitante',
    email: 'camila@ejemplo.cl',
    telefono: '+56955556666',
  };

  const reservarYPagar = (parche: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/reservas/no-socio')
      .send({ canchaId, inicio: A_LAS_10, ...datosDelVisitante, ...parche });

  const volverDeWebpay = (token: string) =>
    request(app.getHttpServer()).get(`/api/reservas/retorno?token_ws=${token}`);

  /** El token que la pasarela le entregó a la última reserva iniciada. */
  const tokenDe = async (reservaId: number) => {
    const transaccion = await prisma.transaccion.findFirstOrThrow({
      where: { concepto: 'RESERVA', conceptoId: reservaId },
    });

    return transaccion.tokenPasarela!;
  };

  const bloqueLibre = async () => {
    const respuesta = await request(app.getHttpServer()).get(
      `/api/disponibilidad?cancha=${canchaId}&fecha=${LUNES}`,
    );

    return !respuesta.body.find(
      (b: { inicio: string }) => b.inicio === A_LAS_10,
    ).reservado;
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    pasarela = app.get(PasarelaPago);
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await app.close();
  });

  beforeEach(async () => {
    pasarela.reiniciar();
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

  it('reservar sin sesión pide solo nombre, correo y teléfono', async () => {
    const respuesta = await reservarYPagar();

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.urlRedireccion).toBeTruthy();
    expect(respuesta.body.folio).toBeTruthy();

    const reserva = await prisma.reserva.findUniqueOrThrow({
      where: { id: respuesta.body.reservaId },
    });

    // Esperando el pago, no confirmada: nadie tiene la cancha hasta que pague.
    expect(reserva).toMatchObject({
      estado: EstadoReserva.PENDIENTE_PAGO,
      socioId: null,
      nombre: 'Camila Visitante',
      telefono: '+56955556666',
    });
  });

  it('el monto lo calcula el servidor y el del cliente se ignora', async () => {
    // `SPEC.md` § Boundaries: nunca confiar en un precio que venga del cliente. Es el
    // guardia que T16 dejó anotado para acá, donde por fin hay un borde real.
    const respuesta = await reservarYPagar({ montoClp: 1, monto: 1 });

    const transaccion = await prisma.transaccion.findFirstOrThrow({
      where: { concepto: 'RESERVA', conceptoId: respuesta.body.reservaId },
    });

    expect(transaccion.montoClp).toBe(12000);
    expect(pasarela.ordenes[0].montoClp).toBe(12000);
  });

  it('el bloque queda tomado mientras el pago está pendiente', async () => {
    await reservarYPagar();

    expect(await bloqueLibre()).toBe(false);
  });

  it('nadie más puede reservar ese bloque mientras tanto', async () => {
    await reservarYPagar();

    const segunda = await reservarYPagar({ email: 'otro@ejemplo.cl' });

    expect(segunda.status).toBe(409);
    expect(segunda.body.motivo).toBe('BLOQUE_TOMADO');
  });

  it('pago autorizado: la reserva queda confirmada y se ve el folio', async () => {
    const inicio = await reservarYPagar();
    const token = await tokenDe(inicio.body.reservaId);

    const retorno = await volverDeWebpay(token);

    // Webpay vuelve por GET y el navegador viene con el usuario: se redirige a la
    // SPA con el folio, no se responde un JSON que nadie va a ver (T17).
    expect(retorno.status).toBe(302);
    expect(retorno.headers.location).toContain(inicio.body.folio);

    expect(
      await prisma.reserva.findUniqueOrThrow({
        where: { id: inicio.body.reservaId },
      }),
    ).toMatchObject({ estado: EstadoReserva.CONFIRMADA });
  });

  it('volver dos veces del pago no crea dos reservas ni cobra dos veces', async () => {
    const inicio = await reservarYPagar();
    const token = await tokenDe(inicio.body.reservaId);

    await volverDeWebpay(token);
    const segunda = await volverDeWebpay(token);

    // La idempotencia de T18 sostiene la recarga de la página de retorno.
    expect(segunda.status).toBe(302);
    expect(pasarela.confirmaciones).toHaveLength(1);
    expect(await prisma.reserva.count({ where: { canchaId } })).toBe(1);
  });

  it('pago rechazado: el bloque vuelve a estar disponible', async () => {
    pasarela.respuesta = 'RECHAZADA';
    const inicio = await reservarYPagar();
    const token = await tokenDe(inicio.body.reservaId);

    await volverDeWebpay(token);

    expect(
      await prisma.reserva.findUniqueOrThrow({
        where: { id: inicio.body.reservaId },
      }),
    ).toMatchObject({ estado: EstadoReserva.EXPIRADA });
    expect(await bloqueLibre()).toBe(true);
  });

  it('quien anula en Webpay vuelve sin token y el bloque se libera', async () => {
    // Webpay manda `TBK_TOKEN` cuando la persona aprieta "anular compra", y como
    // orden de compra devuelve **la referencia de la transacción**, que es lo que
    // viajó como `buyOrder` — no el folio de la reserva, que Webpay nunca vio.
    const inicio = await reservarYPagar();
    const { referencia } = await prisma.transaccion.findFirstOrThrow({
      where: { concepto: 'RESERVA', conceptoId: inicio.body.reservaId },
      select: { referencia: true },
    });

    const retorno = await request(app.getHttpServer()).get(
      `/api/reservas/retorno?TBK_TOKEN=abc&TBK_ORDEN_COMPRA=${referencia}`,
    );

    expect(retorno.status).toBe(302);
    expect(
      await prisma.reserva.findUniqueOrThrow({
        where: { id: inicio.body.reservaId },
      }),
    ).toMatchObject({ estado: EstadoReserva.EXPIRADA });
  });

  it('si la pasarela no acepta la orden, no queda una reserva fantasma', async () => {
    pasarela.fallarAlIniciar = true;

    const respuesta = await reservarYPagar();

    expect(respuesta.status).toBeGreaterThanOrEqual(400);
    // El bloque tiene que volver a la grilla enseguida: esperar los 15 minutos del
    // barrido por una pasarela que ni siquiera aceptó la orden es una hora perdida.
    expect(await bloqueLibre()).toBe(true);
  });

  it('un bloque en mantención no se puede reservar ni pagar', async () => {
    await prisma.bloqueo.create({
      data: {
        canchaId,
        inicio: new Date(A_LAS_10),
        fin: new Date('2026-08-17T15:00:00.000Z'),
        motivo: 'MANTENCION',
      },
    });

    expect((await reservarYPagar()).status).toBe(409);
  });

  it('rechaza datos de contacto incompletos antes de tocar la pasarela', async () => {
    const respuesta = await reservarYPagar({ email: 'no-es-un-correo' });

    expect(respuesta.status).toBe(400);
    expect(pasarela.ordenes).toHaveLength(0);
  });

  it('un token de retorno desconocido no rompe la página', async () => {
    const retorno = await volverDeWebpay('token-que-no-existe');

    // Redirige con el error a la vista, no un 500: del otro lado hay alguien que
    // acaba de pagar y necesita entender qué pasó.
    expect(retorno.status).toBe(302);
    expect(retorno.headers.location).toMatch(/error/);
  });
});
