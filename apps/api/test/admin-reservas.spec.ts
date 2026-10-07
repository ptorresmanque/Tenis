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
import { EventosDeReserva } from '../src/reservas/eventos';
import { ReservaRepository } from '../src/reservas/reserva.repository';

/**
 * T26. El día del club, como lo mira quien atiende el mesón.
 *
 * Acá sí van los datos de contacto: es el único lugar del sistema donde el teléfono
 * de quien reservó tiene que verse, porque el club llama cuando se suspende una hora
 * por lluvia. La grilla pública, en cambio, no dice ni quién reservó.
 */
describe('GET /api/admin/reservas', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let canchaId: number;
  let cookieAdmin: string;
  let cookieSocio: string;

  const NOMBRE_CANCHA = 'Cancha T26';
  const DOMINIO = '@t26.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  // Lunes de agosto, club en UTC-4: las 10:00 y las 11:00 del reloj del club.
  const DIA = '2026-08-17';
  const A_LAS_10 = '2026-08-17T14:00:00.000Z';
  const A_LAS_11 = '2026-08-17T15:00:00.000Z';

  const crearCuenta = async (sufijo: string, esAdmin: boolean) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'De prueba',
      });

    const usuario = await prisma.usuario.update({
      where: { email: `${sufijo}${DOMINIO}` },
      data: { esAdmin },
      select: { id: true },
    });

    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA });

    return {
      usuarioId: usuario.id,
      cookie: (respuesta.headers['set-cookie'] as unknown as string[])[0],
    };
  };

  const pedirElDia = (fecha = DIA, cookie = cookieAdmin) =>
    request(app.getHttpServer())
      .get('/api/admin/reservas')
      .query({ fecha })
      .set('Cookie', cookie);

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
      data: { nombre: NOMBRE_CANCHA, superficie: Superficie.ARCILLA },
      select: { id: true },
    });
    canchaId = cancha.id;

    cookieAdmin = (await crearCuenta('admin', true)).cookie;
    cookieSocio = (await crearCuenta('socio', false)).cookie;
  });

  it('lista las reservas del día con a quién llamar', async () => {
    await prisma.reserva.create({
      data: {
        folio: 'T26AAA1',
        canchaId,
        inicio: new Date(A_LAS_10),
        fin: new Date(A_LAS_11),
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'Visitante Uno',
        email: `visitante${DOMINIO}`,
        telefono: '+56911112222',
      },
    });

    const respuesta = await pedirElDia();

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toHaveLength(1);
    expect((respuesta.body as unknown[])[0]).toMatchObject({
      folio: 'T26AAA1',
      cancha: NOMBRE_CANCHA,
      nombre: 'Visitante Uno',
      // El teléfono es el punto del panel: por lluvia o mantención, el club llama.
      telefono: '+56911112222',
      estado: EstadoReserva.CONFIRMADA,
      esSocio: false,
    });
  });

  it('trae con quién juega cada socio', async () => {
    // Lo que el club mira en el mesón: quién viene y con quién. Sin esto, el panel
    // muestra una hora a nombre de alguien y cuatro personas entrando a la cancha.
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email: `socio${DOMINIO}` },
      select: { id: true },
    });
    const socio = await prisma.socio.create({
      data: {
        usuarioId: usuario.id,
        numeroSocio: 'T26-001',
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2026-01-01'),
        alDiaHasta: new Date('2027-01-01'),
      },
      select: { id: true },
    });

    await prisma.reserva.create({
      data: {
        folio: 'T26BBB2',
        canchaId,
        inicio: new Date(A_LAS_10),
        fin: new Date(A_LAS_11),
        estado: EstadoReserva.CONFIRMADA,
        socioId: socio.id,
        nombre: 'Persona socio',
        email: `socio${DOMINIO}`,
        telefono: '',
        acompanantes: { create: { nombre: 'Ana Invitada' } },
      },
    });

    const respuesta = await pedirElDia();

    expect((respuesta.body as { esSocio: boolean }[])[0]).toMatchObject({
      esSocio: true,
      acompanantes: ['Ana Invitada'],
    });
  });

  it('ordena por hora de inicio', async () => {
    // El panel se lee de arriba abajo mientras la gente llega.
    for (const [folio, inicio] of [
      ['T26TARDE', A_LAS_11],
      ['T26TEMPR', A_LAS_10],
    ]) {
      await prisma.reserva.create({
        data: {
          folio,
          canchaId,
          inicio: new Date(inicio),
          fin: new Date(new Date(inicio).getTime() + 3_600_000),
          estado: EstadoReserva.CONFIRMADA,
          nombre: 'Alguien',
          email: `visitante${DOMINIO}`,
          telefono: '',
        },
      });
    }

    const respuesta = await pedirElDia();

    expect((respuesta.body as { folio: string }[]).map((r) => r.folio)).toEqual(
      ['T26TEMPR', 'T26TARDE'],
    );
  });

  it('no muestra las canceladas ni las de otro día', async () => {
    await prisma.reserva.create({
      data: {
        folio: 'T26CANC',
        canchaId,
        inicio: new Date(A_LAS_10),
        fin: new Date(A_LAS_11),
        estado: EstadoReserva.CANCELADA,
        nombre: 'Se arrepintió',
        email: `visitante${DOMINIO}`,
        telefono: '',
      },
    });
    await prisma.reserva.create({
      data: {
        folio: 'T26OTRO',
        canchaId,
        inicio: new Date('2026-08-18T14:00:00.000Z'),
        fin: new Date('2026-08-18T15:00:00.000Z'),
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'Mañana',
        email: `visitante${DOMINIO}`,
        telefono: '',
      },
    });

    expect((await pedirElDia()).body).toEqual([]);
  });

  it('muestra la que está esperando el pago, marcada como tal', async () => {
    // El bloque está tomado y el club tiene que saberlo, pero también que puede
    // caerse: es la diferencia entre una cancha vendida y una en veremos.
    await prisma.reserva.create({
      data: {
        folio: 'T26PEND',
        canchaId,
        inicio: new Date(A_LAS_10),
        fin: new Date(A_LAS_11),
        estado: EstadoReserva.PENDIENTE_PAGO,
        nombre: 'Pagando',
        email: `visitante${DOMINIO}`,
        telefono: '',
      },
    });

    expect((await pedirElDia()).body).toMatchObject([
      { estado: EstadoReserva.PENDIENTE_PAGO },
    ]);
  });

  it('el día se lee en la hora del club, no en UTC', async () => {
    // Las 22:00 del lunes en Santiago son las 02:00Z del martes. Cortando el día por
    // UTC, la hora de la noche —la más disputada— desaparece del panel del lunes y
    // aparece en el del martes, cuando ya se jugó.
    await prisma.reserva.create({
      data: {
        folio: 'T26NOCHE',
        canchaId,
        inicio: new Date('2026-08-18T02:00:00.000Z'),
        fin: new Date('2026-08-18T03:00:00.000Z'),
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'De noche',
        email: `visitante${DOMINIO}`,
        telefono: '',
      },
    });

    expect((await pedirElDia()).body).toMatchObject([{ folio: 'T26NOCHE' }]);
  });

  describe('avisos en vivo', () => {
    /** El primer aviso que llegue, o null si no llega ninguno en medio segundo. */
    const esperarAviso = (): Promise<{ fecha: string } | null> =>
      new Promise((resolver) => {
        const suscripcion = app
          .get(EventosDeReserva)
          .flujo.subscribe((cambio) => {
            clearTimeout(reloj);
            suscripcion.unsubscribe();
            resolver(cambio);
          });

        const reloj = setTimeout(() => {
          suscripcion.unsubscribe();
          resolver(null);
        }, 500);
      });

    it('crear una reserva avisa, con el día del club al que pertenece', async () => {
      // Sin esto el panel muestra el día de ayer hasta que alguien recarga, que es
      // justo lo que el criterio 2 de `SPEC.md` pide que no pase.
      const aviso = esperarAviso();

      await app.get(ReservaRepository).crear({
        canchaId,
        inicio: new Date(A_LAS_10),
        fin: new Date(A_LAS_11),
        esPico: false,
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'Visitante',
        email: `visitante${DOMINIO}`,
        telefono: '',
      });

      expect(await aviso).toEqual({ fecha: DIA });
    });

    it('cancelar también avisa: la hora vuelve a estar libre', async () => {
      const reserva = await app.get(ReservaRepository).crear({
        canchaId,
        inicio: new Date(A_LAS_10),
        fin: new Date(A_LAS_11),
        esPico: false,
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'Visitante',
        email: `visitante${DOMINIO}`,
        telefono: '',
      });

      const aviso = esperarAviso();
      await app.get(ReservaRepository).cancelar(reserva.id);

      expect(await aviso).toEqual({ fecha: DIA });
    });

    // El aviso al confirmarse un pago se prueba en `reservas-no-socio.spec.ts`, que es
    // donde el flujo con la pasarela ya está montado de punta a punta.

    it('la hora de la noche avisa por su día del club, no por el UTC', async () => {
      // Las 22:00 del lunes son las 02:00Z del martes. Con el día en UTC, el panel
      // abierto en el lunes no se enteraría de la reserva que acaba de entrar.
      const aviso = esperarAviso();

      await app.get(ReservaRepository).crear({
        canchaId,
        inicio: new Date('2026-08-18T02:00:00.000Z'),
        fin: new Date('2026-08-18T03:00:00.000Z'),
        esPico: false,
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'De noche',
        email: `visitante${DOMINIO}`,
        telefono: '',
      });

      expect(await aviso).toEqual({ fecha: DIA });
    });
  });

  it('un socio no entra al panel', async () => {
    expect((await pedirElDia(DIA, cookieSocio)).status).toBe(403);
  });

  it('sin sesión tampoco', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/admin/reservas')
      .query({ fecha: DIA });

    expect(respuesta.status).toBe(401);
  });

  it('una fecha ilegible se rechaza con 400 y no con 500', async () => {
    expect((await pedirElDia('30-02-2026')).status).toBe(400);
  });
});
