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
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * La página pública de la reserva: el destino del QR de portería.
 *
 * Lo que se prueba acá es sobre todo **qué no sale**. La página es abierta —el mesón
 * escanea con un teléfono sin sesión— así que lo único que la protege es que el
 * token no se pueda adivinar, y que lo que devuelva alcance para dejar entrar a
 * alguien y no para armar la agenda de un socio ajeno.
 */
describe('GET /api/reservas/publica/:token', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let canchaId: number;

  const NOMBRE_CANCHA = 'Cancha QR';
  const DOMINIO = '@qr.ejemplo.cl';

  /**
   * La hora se pasa por parámetro porque el club no deja dos reservas activas en el
   * mismo bloque: el índice único de la base lo impide, y con razón.
   */
  const unaReserva = async (
    estado: EstadoReserva = EstadoReserva.CONFIRMADA,
    horaUtc = 18,
  ) =>
    prisma.reserva.create({
      data: {
        folio: `Q${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        canchaId,
        inicio: new Date(
          `2026-09-10T${String(horaUtc).padStart(2, '0')}:00:00.000Z`,
        ),
        fin: new Date(
          `2026-09-10T${String(horaUtc + 1).padStart(2, '0')}:00:00.000Z`,
        ),
        estado,
        nombre: 'Camila Rojas',
        email: `camila${DOMINIO}`,
        telefono: '+56955556666',
        acompanantes: { create: [{ nombre: 'Invitado' }] },
      },
      select: { token: true, folio: true },
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
        superficie: Superficie.CEMENTO,
        techada: false,
        iluminacion: true,
        activa: true,
      },
      select: { id: true },
    });

    canchaId = cancha.id;
  });

  it('toda reserva nace con su token, sin que nadie lo pida', async () => {
    // El default vive en el schema justamente para esto: por `reserva.create` pasan
    // el socio, el no-socio, el seed y los tests, y un token que dependa de que cada
    // camino se acuerde de generarlo es un token que alguna reserva no tendría.
    const { token } = await unaReserva();

    expect(token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('dos reservas no comparten token', async () => {
    const una = await unaReserva();
    const otra = await unaReserva(EstadoReserva.CONFIRMADA, 20);

    expect(una.token).not.toBe(otra.token);
  });

  it('con el token devuelve lo que portería necesita', async () => {
    const { token, folio } = await unaReserva();

    const respuesta = await request(app.getHttpServer())
      .get(`/api/reservas/publica/${token}`)
      .expect(200);

    expect(respuesta.body).toMatchObject({
      folio,
      cancha: NOMBRE_CANCHA,
      nombre: 'Camila Rojas',
      estado: EstadoReserva.CONFIRMADA,
      acompanantes: 1,
    });
  });

  it('**no devuelve el teléfono ni el correo del titular**', async () => {
    // Es una URL que se reenvía por WhatsApp y que queda en el historial del
    // teléfono del mesón. Para dejar entrar a alguien basta con su nombre.
    const { token } = await unaReserva();

    const respuesta = await request(app.getHttpServer())
      .get(`/api/reservas/publica/${token}`)
      .expect(200);

    expect(JSON.stringify(respuesta.body)).not.toContain('+56955556666');
    expect(JSON.stringify(respuesta.body)).not.toContain('camila');
  });

  it('el folio no sirve como llave: la página cuelga del token', async () => {
    // El folio es corto y se dicta por teléfono. Si abriera esta página, recorrer
    // los folios posibles sería leer la agenda del club entero.
    const { folio } = await unaReserva();

    await request(app.getHttpServer())
      .get(`/api/reservas/publica/${folio}`)
      .expect(400);
  });

  it('un token que no existe da 404, igual que uno de una reserva borrada', async () => {
    await request(app.getHttpServer())
      .get('/api/reservas/publica/00000000-0000-4000-8000-000000000000')
      .expect(404);
  });

  it('no acepta escritura, ni siquiera con el token correcto', async () => {
    // Decisión tomada: **el QR no cancela**. El enlace se reenvía por WhatsApp y
    // queda en el historial del teléfono del mesón; con poder de cancelación,
    // perderlo de vista un segundo sería perder la hora. Quien reservó sin cuenta
    // cancela llamando al club.
    const { token } = await unaReserva();

    await request(app.getHttpServer())
      .delete(`/api/reservas/publica/${token}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/reservas/publica/${token}`)
      .expect(404);

    // Desde T88 el PATCH existe —el no-socio cambia su hora desde el enlace—, pero mueve
    // y nada más: un cuerpo que no dice cancha ni hora es un 400, no una cancelación.
    await request(app.getHttpServer())
      .patch(`/api/reservas/publica/${token}`)
      .send({ estado: 'CANCELADA' })
      .expect(400);

    // Y la reserva sigue como estaba: los intentos no la tocaron.
    const despues = await request(app.getHttpServer())
      .get(`/api/reservas/publica/${token}`)
      .expect(200);

    expect((despues.body as { estado: string }).estado).toBe(
      EstadoReserva.CONFIRMADA,
    );
  });

  it('**cambiar por el enlace con un token que no existe da 404, igual que la página** (T88)', async () => {
    await request(app.getHttpServer())
      .patch('/api/reservas/publica/00000000-0000-4000-8000-000000000000')
      .send({ canchaId, inicio: '2026-09-10T18:00:00.000Z' })
      .expect(404);
  });

  it('**trae lo pagado, sumando todos los pagos autorizados** (T88)', async () => {
    // Para que la grilla muestre la diferencia como dato; el servidor la recalcula al mover.
    const reserva = await unaReserva();
    const { id } = await prisma.reserva.findUniqueOrThrow({
      where: { token: reserva.token },
      select: { id: true },
    });
    for (const [i, montoClp] of [12000, 4000].entries()) {
      await prisma.transaccion.create({
        data: {
          referencia: `QR-T88-${id}-${i}`,
          concepto: ConceptoPago.RESERVA,
          conceptoId: id,
          montoClp,
          pasarela: 'doble',
          estado: EstadoTransaccion.AUTORIZADA,
        },
      });
    }

    const respuesta = await request(app.getHttpServer())
      .get(`/api/reservas/publica/${reserva.token}`)
      .expect(200);

    // Del 10 de septiembre de 2026, ya pasada: no se puede cambiar.
    expect(respuesta.body).toMatchObject({
      pagadoClp: 16000,
      sePuedeCambiar: false,
    });
  });

  it('**ofrece cambiarla si es de visitante, está activa y falta más que la ventana** (T88)', async () => {
    const enElFuturo = (estado: EstadoReserva, folio: string) =>
      prisma.reserva.create({
        data: {
          folio,
          canchaId,
          inicio: new Date('2037-09-10T18:00:00.000Z'),
          fin: new Date('2037-09-10T19:00:00.000Z'),
          estado,
          nombre: 'Camila Rojas',
          email: `camila${DOMINIO}`,
          telefono: '+56955556666',
        },
        select: { token: true },
      });
    const sePuede = async (token: string) =>
      (
        (
          await request(app.getHttpServer())
            .get(`/api/reservas/publica/${token}`)
            .expect(200)
        ).body as { sePuedeCambiar: boolean }
      ).sePuedeCambiar;

    const activa = await enElFuturo(EstadoReserva.CONFIRMADA, 'QT88ACT');
    expect(await sePuede(activa.token)).toBe(true);

    await prisma.reserva.update({
      where: { token: activa.token },
      data: { estado: EstadoReserva.CANCELADA },
    });
    expect(await sePuede(activa.token)).toBe(false);
  });

  it('la reserva cancelada se puede mirar, y lo dice', async () => {
    // Portería tiene que poder distinguir "esta hora se canceló" de "este enlace no
    // existe": lo primero pasa de verdad y hay alguien parado en el mesón.
    const { token } = await unaReserva(EstadoReserva.CANCELADA);

    const respuesta = await request(app.getHttpServer())
      .get(`/api/reservas/publica/${token}`)
      .expect(200);

    expect((respuesta.body as { estado: string }).estado).toBe(
      EstadoReserva.CANCELADA,
    );
  });
});
