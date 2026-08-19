import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  EstadoReserva,
  EstadoSocio,
  Superficie,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { sembrarCatalogo } from '../prisma/seed-catalogo';

/**
 * T22. La reserva del socio, de punta a punta.
 *
 * Los rechazos son el producto acá: un socio que no puede reservar tiene que
 * entender por qué y qué hacer. Los tests miran el mensaje, no solo el código de
 * estado, porque un 409 sin explicación es un socio llamando al club.
 */
describe('POST /api/reservas — reserva de socio', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let canchaId: number;
  let socioId: number;
  let cookie: string;

  const NOMBRE_CANCHA = 'Cancha T22';
  const DOMINIO = '@t22.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  // Lunes de agosto: sin cambio de hora de por medio. El club en UTC-4.
  const LUNES = '2026-08-17';
  const A_LAS_10 = '2026-08-17T14:00:00.000Z';
  const A_LAS_11 = '2026-08-17T15:00:00.000Z';
  const A_LAS_19 = '2026-08-17T23:00:00.000Z';

  /** Crea una cuenta con ficha de socio y devuelve su id de socio. */
  const crearSocio = async (
    sufijo: string,
    parche: { estado?: EstadoSocio; alDiaHasta?: Date } = {},
  ) => {
    const usuario = await prisma.usuario.create({
      data: {
        email: `socio-${sufijo}${DOMINIO}`,
        nombre: `Socio ${sufijo}`,
        apellido: 'De prueba',
        telefono: '+56911112222',
        emailVerificado: true,
        socio: {
          create: {
            numeroSocio: `T22-${sufijo}`,
            estado: parche.estado ?? EstadoSocio.ACTIVO,
            fechaIngreso: new Date('2026-01-01'),
            alDiaHasta: parche.alDiaHasta ?? new Date('2027-01-01'),
          },
        },
      },
      select: { id: true, socio: { select: { id: true } } },
    });

    return { usuarioId: usuario.id, socioId: usuario.socio!.id };
  };

  /** Abre sesión con la contraseña de demo y devuelve la cookie. */
  const entrar = async (email: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA });

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  const reservar = (cuerpo: Record<string, unknown>, conCookie = cookie) =>
    request(app.getHttpServer())
      .post('/api/reservas')
      .set('Cookie', conCookie)
      .send(cuerpo);

  const unaReserva = (parche: Record<string, unknown> = {}) => ({
    canchaId,
    inicio: A_LAS_10,
    acompanantes: [{ nombre: 'Ana Invitada' }],
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
    await sembrarCatalogo(prisma);
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
        // Lunes de 08:00 a 22:00, con las 19:00 en horario pico.
        horarios: {
          create: { diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' },
        },
        franjas: {
          create: [
            {
              horaDesde: '08:00',
              horaHasta: '18:00',
              montoClp: 10000,
              esPico: false,
              vigenteDesde: new Date('2026-01-01'),
            },
            {
              horaDesde: '18:00',
              horaHasta: '22:00',
              montoClp: 15000,
              esPico: true,
              vigenteDesde: new Date('2026-01-01'),
            },
          ],
        },
      },
      select: { id: true },
    });
    canchaId = cancha.id;

    const titular = await crearSocio('titular');
    socioId = titular.socioId;
    // La contraseña se pone por el registro real, que es quien sabe hashearla.
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `desechable${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: 'Desechable',
        apellido: 'De prueba',
      });
    const hash = await prisma.usuario.findUniqueOrThrow({
      where: { email: `desechable${DOMINIO}` },
      select: { passwordHash: true },
    });
    await prisma.usuario.update({
      where: { id: titular.usuarioId },
      data: { passwordHash: hash.passwordHash },
    });

    cookie = await entrar(`socio-titular${DOMINIO}`);
  });

  it('el socio al día reserva sin pagar', async () => {
    const respuesta = await reservar(unaReserva());

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.folio).toBeTruthy();

    const reserva = await prisma.reserva.findUniqueOrThrow({
      where: { id: respuesta.body.id },
    });

    expect(reserva.estado).toBe(EstadoReserva.CONFIRMADA);
    expect(reserva.socioId).toBe(socioId);
    // Sin transacción detrás: el socio no paga por reservar (SPEC.md § Cupo del socio).
    expect(
      await prisma.transaccion.count({
        where: { concepto: 'RESERVA', conceptoId: reserva.id },
      }),
    ).toBe(0);
  });

  it('copia el teléfono del socio a la reserva', async () => {
    // El panel del admin (T26) lee la reserva para saber a quién llamar si hay que
    // avisar algo. Con el campo vacío tiene que ir a buscar la ficha a mano, que es
    // justo lo que el comentario del schema promete que no pasa.
    const respuesta = await reservar(unaReserva());

    expect(
      await prisma.reserva.findUniqueOrThrow({
        where: { id: respuesta.body.id },
      }),
    ).toMatchObject({ telefono: '+56911112222' });
  });

  it('la segunda reserva del día se rechaza con el límite y cuándo se renueva', async () => {
    await reservar(unaReserva());

    const respuesta = await reservar(unaReserva({ inicio: A_LAS_11 }));

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.motivo).toBe('CUPO_DIARIO');
    expect(respuesta.body.message).toMatch(/1 hora/);
    expect(respuesta.body.message).toMatch(/mañana/i);
  });

  it('la tercera hora pico de la semana se rechaza', async () => {
    // Las dos primeras horas pico las pone la base directamente: el cupo diario
    // impide tomarlas por la API el mismo día, y lo que se prueba acá es el semanal.
    for (const dia of ['2026-08-18', '2026-08-19']) {
      await prisma.reserva.create({
        data: {
          folio: `PICO${dia.slice(-2)}`,
          canchaId,
          inicio: new Date(`${dia}T23:00:00.000Z`),
          fin: new Date(`${dia}T23:59:00.000Z`),
          esPico: true,
          estado: EstadoReserva.CONFIRMADA,
          socioId,
          nombre: 'Socio titular',
          email: `socio-titular${DOMINIO}`,
          telefono: '',
        },
      });
    }

    const respuesta = await reservar(unaReserva({ inicio: A_LAS_19 }));

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.motivo).toBe('CUPO_PICO');
  });

  it('las horas pico gastadas no impiden reservar en horario valle', async () => {
    for (const dia of ['2026-08-18', '2026-08-19']) {
      await prisma.reserva.create({
        data: {
          folio: `VALL${dia.slice(-2)}`,
          canchaId,
          inicio: new Date(`${dia}T23:00:00.000Z`),
          fin: new Date(`${dia}T23:59:00.000Z`),
          esPico: true,
          estado: EstadoReserva.CONFIRMADA,
          socioId,
          nombre: 'Socio titular',
          email: `socio-titular${DOMINIO}`,
          telefono: '',
        },
      });
    }

    expect((await reservar(unaReserva())).status).toBe(201);
  });

  it('el socio moroso no reserva, y sus reservas anteriores se conservan', async () => {
    const previa = await prisma.reserva.create({
      data: {
        folio: 'PREVIA1',
        canchaId,
        inicio: new Date('2026-08-24T14:00:00.000Z'),
        fin: new Date('2026-08-24T15:00:00.000Z'),
        estado: EstadoReserva.CONFIRMADA,
        socioId,
        nombre: 'Socio titular',
        email: `socio-titular${DOMINIO}`,
        telefono: '',
      },
    });
    await prisma.socio.update({
      where: { id: socioId },
      data: { alDiaHasta: new Date('2026-07-31') },
    });

    const respuesta = await reservar(unaReserva());

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.motivo).toBe('CUOTA_VENCIDA');
    // "Las que ya tenía se mantienen" (SPEC.md): quitarle una hora ya reservada por
    // una cuota atrasada es una pelea que el club no quiere tener en la cancha.
    expect(
      await prisma.reserva.findUniqueOrThrow({ where: { id: previa.id } }),
    ).toMatchObject({ estado: EstadoReserva.CONFIRMADA });
  });

  it('el socio suspendido recibe un mensaje distinto al del moroso', async () => {
    await prisma.socio.update({
      where: { id: socioId },
      data: {
        estado: EstadoSocio.SUSPENDIDO,
        alDiaHasta: new Date('2026-07-31'),
      },
    });

    const respuesta = await reservar(unaReserva());

    expect(respuesta.body.motivo).toBe('MEMBRESIA_INACTIVA');
    // Suspendido *y* moroso: manda la suspensión, y no se le habla de la cuota.
    expect(respuesta.body.message).not.toMatch(/cuota/i);
  });

  it('sin declarar con quién juega, no hay reserva', async () => {
    const respuesta = await reservar(unaReserva({ acompanantes: [] }));

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.motivo).toBe('SIN_ACOMPANANTE');
  });

  it('un socio no puede estar declarado en dos canchas a la vez', async () => {
    const otro = await crearSocio('acompanante');
    const otraCancha = await prisma.cancha.create({
      data: {
        nombre: `${NOMBRE_CANCHA} bis`,
        superficie: Superficie.CEMENTO,
        horarios: {
          create: { diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' },
        },
      },
      select: { id: true },
    });

    await prisma.reserva.create({
      data: {
        folio: 'OCUPADO1',
        canchaId: otraCancha.id,
        inicio: new Date(A_LAS_10),
        fin: new Date(A_LAS_11),
        estado: EstadoReserva.CONFIRMADA,
        socioId: otro.socioId,
        nombre: 'Socio acompanante',
        email: `socio-acompanante${DOMINIO}`,
        telefono: '',
      },
    });

    const respuesta = await reservar(
      unaReserva({ acompanantes: [{ socioId: otro.socioId }] }),
    );

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.motivo).toBe('YA_ESTA_EN_OTRA_CANCHA');
    expect(respuesta.body.message).toMatch(/bis/);
  });

  it('una hora que no está en el horario de la cancha no se reserva', async () => {
    // Las 06:00, con el club abriendo a las 08:00. Sin este guardia, el cliente puede
    // pedir cualquier instante y la reserva existiría fuera de la grilla.
    const respuesta = await reservar(
      unaReserva({ inicio: '2026-08-17T10:00:00.000Z' }),
    );

    expect(respuesta.status).toBe(404);
  });

  it('un bloque en mantención no se reserva', async () => {
    await prisma.bloqueo.create({
      data: {
        canchaId,
        inicio: new Date(A_LAS_10),
        fin: new Date(A_LAS_11),
        motivo: 'MANTENCION',
      },
    });

    const respuesta = await reservar(unaReserva());

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.motivo).toBe('BLOQUE_NO_DISPONIBLE');
  });

  it('sin sesión no se reserva', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/reservas')
      .send(unaReserva());

    expect(respuesta.status).toBe(401);
  });

  it('cambiar el cupo diario en la configuración cambia el comportamiento', async () => {
    // El criterio de verificación: los límites salen de `ConfiguracionClub`, ninguno
    // está en el código.
    await prisma.configuracionClub.update({
      where: { id: 1 },
      data: { cupoDiarioSocioHoras: 2 },
    });

    try {
      await reservar(unaReserva());
      expect((await reservar(unaReserva({ inicio: A_LAS_11 }))).status).toBe(
        201,
      );
    } finally {
      await prisma.configuracionClub.update({
        where: { id: 1 },
        data: { cupoDiarioSocioHoras: 1 },
      });
    }
  });
});
