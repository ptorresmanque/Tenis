import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  EstadoReserva,
  EstadoSocio,
  Superficie,
} from '../src/generated/prisma/client';
import { UsuarioActual } from '../src/identidad/usuario-actual';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReservasService } from '../src/reservas/reservas.service';
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
  // Y en el futuro: la API no reserva horas que ya empezaron. 2037 repite el
  // calendario de 2026, así que los días de la semana no cambian.
  const A_LAS_10 = '2037-08-17T14:00:00.000Z';
  const A_LAS_11 = '2037-08-17T15:00:00.000Z';
  const A_LAS_19 = '2037-08-17T23:00:00.000Z';

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

  /** Lo que estos tests leen de la respuesta. supertest la entrega como `any`. */
  const reservar = async (
    cuerpo: Record<string, unknown>,
    conCookie = cookie,
  ) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/reservas')
      .set('Cookie', conCookie)
      .send(cuerpo);

    return respuesta as Omit<typeof respuesta, 'body'> & {
      body: { id: number; folio: string; motivo: string; message: string };
    };
  };

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
    await app.listen(0, '127.0.0.1');

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

  it('**el socio reserva 1 hora y media, aunque la franja no la venda a quien no es socio** (T83b)', async () => {
    // El socio no paga la hora, así que el precio de 1 hora y media no le hace falta.
    const respuesta = await reservar(unaReserva({ duracionMin: 90 }));

    expect(respuesta.status).toBe(201);
    const reserva = await prisma.reserva.findUniqueOrThrow({
      where: { id: (respuesta.body as { id: number }).id },
    });
    expect(reserva.fin.getTime() - reserva.inicio.getTime()).toBe(
      90 * 60 * 1000,
    );
  });

  it('una duración ilegible responde 400 también al socio (T83b)', async () => {
    const respuesta = await reservar(unaReserva({ duracionMin: 45 }));

    expect(respuesta.status).toBe(400);
  });

  it('la segunda reserva del día se rechaza con el límite y cuándo se renueva', async () => {
    await reservar(unaReserva());

    const respuesta = await reservar(unaReserva({ inicio: A_LAS_11 }));

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.motivo).toBe('CUPO_DIARIO');
    // Cuenta reservas, no horas (T84), y no promete "mañana": el cupo es del día de juego.
    const { message } = respuesta.body as { message: string };
    expect(message).toMatch(/1 reserva por día/);
    expect(message).toMatch(/otro día/);
  });

  it('la tercera reserva pico de la semana se rechaza', async () => {
    // Las dos primeras reservas pico las pone la base directamente: el cupo diario
    // impide tomarlas por la API el mismo día, y lo que se prueba acá es el semanal.
    for (const dia of ['2037-08-18', '2037-08-19']) {
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

  it('**dos pico de 1 hora y media caben en un cupo pico de 2: cuenta reservas, no horas** (T85)', async () => {
    // Contando horas serían 3 de 2 y la segunda se rechazaría. La primera la pone la
    // base el martes: el club de este spec abre solo los lunes.
    await prisma.reserva.create({
      data: {
        folio: 'PICO90A',
        canchaId,
        inicio: new Date('2037-08-18T23:00:00.000Z'),
        fin: new Date('2037-08-19T00:30:00.000Z'),
        esPico: true,
        estado: EstadoReserva.CONFIRMADA,
        socioId,
        nombre: 'Socio titular',
        email: `socio-titular${DOMINIO}`,
        telefono: '',
      },
    });

    const respuesta = await reservar(
      unaReserva({ inicio: A_LAS_19, duracionMin: 90 }),
    );

    expect(respuesta.status).toBe(201);
  });

  it('la segunda reserva del día se rechaza también cuando la primera fue de 1 hora y media (T85)', async () => {
    expect((await reservar(unaReserva({ duracionMin: 90 }))).status).toBe(201);

    const segunda = await reservar(
      unaReserva({ inicio: '2037-08-17T17:00:00.000Z' }),
    );

    expect(segunda.status).toBe(409);
    expect((segunda.body as { motivo: string }).motivo).toBe('CUPO_DIARIO');
  });

  it('las reservas pico gastadas no impiden reservar en horario valle', async () => {
    for (const dia of ['2037-08-18', '2037-08-19']) {
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
        inicio: new Date('2037-08-24T14:00:00.000Z'),
        fin: new Date('2037-08-24T15:00:00.000Z'),
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

  describe('declarar al acompañante por su número de socio', () => {
    // Es lo que la persona conoce y lo que el formulario manda: el id interno no lo
    // sabe nadie fuera de la base. La traducción es código nuevo y hasta acá no
    // tenía ningún test que la ejercitara.
    it('acepta el número y guarda al socio como acompañante', async () => {
      const otro = await crearSocio('companiero');

      const respuesta = await reservar(
        unaReserva({ acompanantes: [{ numeroSocio: 'T22-companiero' }] }),
      );

      expect(respuesta.status).toBe(201);

      const acompanantes = await prisma.acompananteReserva.findMany({
        where: { reservaId: respuesta.body.id },
      });

      expect(acompanantes).toHaveLength(1);
      expect(acompanantes[0]).toMatchObject({
        socioId: otro.socioId,
        nombre: null,
      });
    });

    it('un número que no existe se rechaza diciendo cuál', async () => {
      // Sin esto, un número mal tecleado quedaría como un acompañante que
      // misteriosamente no cuenta, o como un rechazo por "no declaraste con quién".
      const respuesta = await reservar(
        unaReserva({ acompanantes: [{ numeroSocio: 'NO-EXISTE' }] }),
      );

      expect(respuesta.status).toBe(404);
      expect(respuesta.body.message).toContain('NO-EXISTE');
    });

    it('un socio sin membresía activa no entra como acompañante', async () => {
      // El agujero que tapa esta regla: un acompañante con `socioId` no descuenta
      // invitados del mes, así que el número de alguien retirado sería la forma de
      // meter gente gratis y sin tope. La lista de la interfaz ya no los ofrece,
      // pero la que manda es esta.
      await crearSocio('retirado', { estado: EstadoSocio.RETIRADO });

      const respuesta = await reservar(
        unaReserva({ acompanantes: [{ numeroSocio: 'T22-retirado' }] }),
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.motivo).toBe('ACOMPANANTE_NO_ACTIVO');
      // Y se le dice por dónde sí puede: como invitado, gastando cupo.
      expect(respuesta.body.message).toContain('invitado');
    });

    it('un socio suspendido tampoco: la membresía está en pausa', async () => {
      await crearSocio('suspendido', { estado: EstadoSocio.SUSPENDIDO });

      const respuesta = await reservar(
        unaReserva({ acompanantes: [{ numeroSocio: 'T22-suspendido' }] }),
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.motivo).toBe('ACOMPANANTE_NO_ACTIVO');
    });

    it('el socio acompañante no gasta su propio cupo del día', async () => {
      // La regla del club: es un registro, no una reserva suya. Si le descontara la
      // hora, quien acompaña dos veces en un día quedaría sin poder reservar la suya.
      const otro = await crearSocio('acompaniante2');
      await reservar(
        unaReserva({ acompanantes: [{ numeroSocio: 'T22-acompaniante2' }] }),
      );

      expect(
        await prisma.reserva.count({
          where: { socioId: otro.socioId, estado: EstadoReserva.CONFIRMADA },
        }),
      ).toBe(0);
    });
  });

  describe('invitados del mes (T25)', () => {
    /** Deja `cuantos` invitados ya registrados en el mes de la reserva. */
    const gastarInvitados = async (cuantos: number, mes = '2037-08') => {
      for (let i = 0; i < cuantos; i++) {
        await prisma.reserva.create({
          data: {
            folio: `INV${mes.slice(-2)}${i}`,
            canchaId,
            // Días distintos: el cupo diario no interviene, y así el conteo mensual es
            // lo único que puede rechazar.
            inicio: new Date(
              `${mes}-${String(10 + i).padStart(2, '0')}T14:00:00.000Z`,
            ),
            fin: new Date(
              `${mes}-${String(10 + i).padStart(2, '0')}T15:00:00.000Z`,
            ),
            estado: EstadoReserva.CONFIRMADA,
            socioId,
            nombre: 'Socio titular',
            email: `socio-titular${DOMINIO}`,
            telefono: '',
            acompanantes: { create: { nombre: `Invitado ${i}` } },
          },
        });
      }
    };

    it('el quinto invitado del mes se rechaza, diciendo cuántos lleva', async () => {
      await gastarInvitados(4);

      const respuesta = await reservar(unaReserva());

      expect(respuesta.status).toBe(409);
      const rechazo = respuesta.body as { motivo: string; message: string };
      expect(rechazo.motivo).toBe('CUPO_INVITADOS');
      expect(rechazo.message).toMatch(/4 de 4/);
    });

    it('el cuarto todavía pasa', async () => {
      await gastarInvitados(3);

      expect((await reservar(unaReserva())).status).toBe(201);
    });

    it('los invitados del mes pasado no cuentan: el cupo se renueva el día 1', async () => {
      // El criterio del reinicio mensual, contra la base y no solo contra la función
      // pura. Cuatro invitados en julio no impiden reservar en agosto.
      await gastarInvitados(4, '2037-07');

      expect((await reservar(unaReserva())).status).toBe(201);
    });

    it('una reserva cancelada devuelve el invitado que había gastado', async () => {
      // Igual que el resto de los cupos: cancelar no puede ser peor que no haber
      // reservado (`SPEC-reservas.md` § Reglas del socio).
      await gastarInvitados(4);
      await prisma.reserva.updateMany({
        where: { folio: 'INV080' },
        data: { estado: EstadoReserva.CANCELADA },
      });

      expect((await reservar(unaReserva())).status).toBe(201);
    });

    it('jugar con otro socio no gasta invitados aunque el cupo esté agotado', async () => {
      await gastarInvitados(4);
      await crearSocio('companiero-invitados');

      const respuesta = await reservar(
        unaReserva({
          acompanantes: [{ numeroSocio: 'T22-companiero-invitados' }],
        }),
      );

      expect(respuesta.status).toBe(201);
    });

    it('el límite sale de la configuración', async () => {
      await prisma.configuracionClub.update({
        where: { id: 1 },
        data: { invitadosPorMes: 2 },
      });

      try {
        await gastarInvitados(2);

        expect((await reservar(unaReserva())).status).toBe(409);
      } finally {
        await prisma.configuracionClub.update({
          where: { id: 1 },
          data: { invitadosPorMes: 4 },
        });
      }
    });
  });

  it('dos reservas simultáneas del mismo socio no le dan dos horas el mismo día', async () => {
    // El cupo se evaluaba sobre lo que había al consultar: dos pestañas apretando
    // "Reservar" a la vez leían las dos "cero reservas hoy" y las dos pasaban. El
    // bloque no se duplicaba —de eso se encarga el índice— pero el socio terminaba con
    // dos horas, y el que quedó afuera del cupo era otro.
    const [primera, segunda] = await Promise.all([
      reservar(unaReserva()),
      reservar(unaReserva({ inicio: A_LAS_11 })),
    ]);

    const estados = [primera.status, segunda.status].sort();
    expect(estados).toEqual([201, 409]);
    expect(
      await prisma.reserva.count({
        where: { socioId, estado: EstadoReserva.CONFIRMADA },
      }),
    ).toBe(1);
  });

  it('una hora que no está en el horario de la cancha no se reserva', async () => {
    // Las 06:00, con el club abriendo a las 08:00. Sin este guardia, el cliente puede
    // pedir cualquier instante y la reserva existiría fuera de la grilla.
    const respuesta = await reservar(
      unaReserva({ inicio: '2037-08-17T10:00:00.000Z' }),
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

  it('una hora que ya empezó no se reserva', async () => {
    // Por el servicio y no por HTTP: `ahora` va inyectado para no depender del reloj.
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email: `socio-titular${DOMINIO}` },
    });
    const yo: UsuarioActual = {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      telefono: usuario.telefono,
      esAdmin: false,
      socioId,
      socioActivo: true,
      socioAlDia: true,
      profesorId: null,
    };
    const ahora = new Date(new Date(A_LAS_10).getTime() + 40 * 60 * 1000);

    await expect(
      app.get(ReservasService).reservarComoSocio(
        yo,
        {
          canchaId,
          inicio: new Date(A_LAS_10),
          duracionMin: 60,
          acompanantes: [{ nombre: 'Ana Invitada' }],
        },
        ahora,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        motivo: 'BLOQUE_EN_EL_PASADO',
        message: 'Esa hora ya pasó. Elige una que todavía no haya empezado.',
      },
    });

    expect(await prisma.reserva.count({ where: { canchaId } })).toBe(0);
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
      data: { cupoDiarioSocioReservas: 2 },
    });

    try {
      await reservar(unaReserva());
      expect((await reservar(unaReserva({ inicio: A_LAS_11 }))).status).toBe(
        201,
      );
    } finally {
      await prisma.configuracionClub.update({
        where: { id: 1 },
        data: { cupoDiarioSocioReservas: 1 },
      });
    }
  });
});
