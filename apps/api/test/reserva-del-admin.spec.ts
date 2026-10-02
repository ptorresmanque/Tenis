import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hoyEnElClub } from '../src/comun/tiempo';
import {
  EstadoReserva,
  EstadoSocio,
  Superficie,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReservaDelAdminService } from '../src/reservas/reserva-del-admin.service';

/**
 * T6.3: la hora que toma el club por teléfono o en el mesón.
 *
 * Lo que se prueba: que **la reserva del admin no es una puerta de atrás**. Pasa por
 * las mismas reglas de cupo que la del socio (decisión § 5.2 del plan), así que el
 * club no puede regalarle a un socio una segunda hora del día sin enterarse, y el
 * panel muestra el cupo antes de que alguien decida por teléfono.
 */
describe('POST /api/admin/reservas y GET /api/admin/reservas/cupo/:socioId', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let canchaId: number;
  let socioId: number;
  let cookieAdmin: string;
  let bloques: { inicio: string; fin: string }[];

  const NOMBRE_CANCHA = 'Cancha mesón';
  const DOMINIO = '@meson.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  const enTresDias = () =>
    new Date(hoyEnElClub().getTime() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'Del mesón',
      });

    const usuario = await prisma.usuario.update({
      where: { email: `${sufijo}${DOMINIO}` },
      data: { esAdmin },
      select: { id: true },
    });

    return usuario.id;
  };

  const entrar = async (sufijo: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA });

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

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
        superficie: Superficie.CEMENTO,
        techada: false,
        iluminacion: true,
        activa: true,
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

    const usuarioSocio = await crearCuenta('socio');
    const socio = await prisma.socio.create({
      data: {
        usuarioId: usuarioSocio,
        numeroSocio: `MESON-${Date.now()}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2026-01-01'),
        alDiaHasta: new Date('2027-01-01'),
      },
      select: { id: true },
    });
    socioId = socio.id;

    await crearCuenta('admin', true);
    cookieAdmin = await entrar('admin');

    const grilla = await request(app.getHttpServer()).get(
      `/api/disponibilidad?cancha=${canchaId}&fecha=${enTresDias()}`,
    );
    bloques = grilla.body as { inicio: string; fin: string }[];
  });

  it('el club puede tomar una hora a nombre de un visitante, ya confirmada', async () => {
    // Sin pasarela: el cobro pasa en el mesón. Es el único camino en que una reserva
    // de no-socio nace confirmada sin transacción detrás.
    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/reservas')
      .set('Cookie', cookieAdmin)
      .send({
        canchaId,
        inicio: bloques[0].inicio,
        nombre: 'Quien llamó por teléfono',
        telefono: '+56911112222',
      })
      .expect(201);

    const guardada = await prisma.reserva.findUniqueOrThrow({
      where: { id: (respuesta.body as { id: number }).id },
      select: { estado: true, socioId: true, nombre: true },
    });

    expect(guardada).toMatchObject({
      estado: EstadoReserva.CONFIRMADA,
      socioId: null,
      nombre: 'Quien llamó por teléfono',
    });
  });

  it('a nombre de un socio, la reserva queda con su ficha', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/reservas')
      .set('Cookie', cookieAdmin)
      .send({
        canchaId,
        inicio: bloques[0].inicio,
        socioId,
        acompanantes: [{ nombre: 'Invitado del mesón' }],
      });

    expect(respuesta.status).toBe(201);

    const guardada = await prisma.reserva.findUniqueOrThrow({
      where: { id: (respuesta.body as { id: number }).id },
      select: { socioId: true, estado: true },
    });

    expect(guardada).toEqual({
      socioId,
      estado: EstadoReserva.CONFIRMADA,
    });
  });

  it('**consume el cupo del socio, igual que si reservara él**', async () => {
    // La decisión de § 5.2. Si el mesón pudiera saltarse el cupo, el socio
    // descubriría que perdió su hora del día por una reserva que no pidió.
    await request(app.getHttpServer())
      .post('/api/admin/reservas')
      .set('Cookie', cookieAdmin)
      .send({
        canchaId,
        inicio: bloques[0].inicio,
        socioId,
        acompanantes: [{ nombre: 'Invitado del mesón' }],
      })
      .expect(201);

    const segunda = await request(app.getHttpServer())
      .post('/api/admin/reservas')
      .set('Cookie', cookieAdmin)
      .send({
        canchaId,
        inicio: bloques[2].inicio,
        socioId,
        acompanantes: [{ nombre: 'Otro invitado' }],
      })
      .expect(409);

    expect((segunda.body as { motivo: string }).motivo).toBe('CUPO_DIARIO');
  });

  it('el cupo se puede consultar antes de decidir', async () => {
    const antes = await request(app.getHttpServer())
      .get(`/api/admin/reservas/cupo/${socioId}?fecha=${enTresDias()}`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    expect(antes.body).toMatchObject({
      socioId,
      alDia: true,
      reservasDelDia: 0,
    });
    // Positivo y no "cualquier número": un cupo en 0 dejaría la pantalla del
    // mesón diciendo que el socio no puede reservar nunca.
    expect(
      (antes.body as { cupoDiarioSocioHoras: number }).cupoDiarioSocioHoras,
    ).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post('/api/admin/reservas')
      .set('Cookie', cookieAdmin)
      .send({
        canchaId,
        inicio: bloques[0].inicio,
        socioId,
        acompanantes: [{ nombre: 'Invitado del mesón' }],
      })
      .expect(201);

    const despues = await request(app.getHttpServer())
      .get(`/api/admin/reservas/cupo/${socioId}?fecha=${enTresDias()}`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    expect((despues.body as { reservasDelDia: number }).reservasDelDia).toBe(1);
  });

  describe('la hora en curso', () => {
    // El mesón existe para quien llega en persona: el que entra a las 16:10 quiere
    // jugar la de las 16:00. Por el servicio, con `ahora` inyectado.
    const diezMinutosDespuesDe = (instante: string) =>
      new Date(new Date(instante).getTime() + 10 * 60 * 1000);

    it('el club la toma a nombre de un visitante', async () => {
      const reserva = await app.get(ReservaDelAdminService).crear(
        {
          canchaId,
          inicio: new Date(bloques[0].inicio),
          nombre: 'Llegó al club',
          telefono: '+56911112222',
        },
        diezMinutosDespuesDe(bloques[0].inicio),
      );

      expect(reserva.folio).toBeTruthy();
    });

    it('y a nombre de un socio, aunque el socio solo no podría', async () => {
      const reserva = await app.get(ReservaDelAdminService).crear(
        {
          canchaId,
          inicio: new Date(bloques[0].inicio),
          socioId,
          acompanantes: [{ nombre: 'Invitado del mesón' }],
        },
        diezMinutosDespuesDe(bloques[0].inicio),
      );

      expect(reserva.folio).toBeTruthy();
    });

    it('la que ya terminó no se anota', async () => {
      await expect(
        app.get(ReservaDelAdminService).crear(
          {
            canchaId,
            inicio: new Date(bloques[0].inicio),
            nombre: 'Llegó tarde',
            telefono: '+56911112222',
          },
          new Date(bloques[0].fin),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          motivo: 'BLOQUE_EN_EL_PASADO',
          message: 'Esa hora ya terminó.',
        },
      });

      expect(await prisma.reserva.count({ where: { canchaId } })).toBe(0);
    });
  });

  it('sin socio y sin nombre no se crea nada', async () => {
    // La hora del mesón es la que alguien puede no venir a usar: el club necesita
    // saber a quién llamar.
    await request(app.getHttpServer())
      .post('/api/admin/reservas')
      .set('Cookie', cookieAdmin)
      .send({ canchaId, inicio: bloques[0].inicio })
      .expect(400);
  });

  it('no lo puede usar quien no es admin', async () => {
    const cookieSocio = await entrar('socio');

    await request(app.getHttpServer())
      .post('/api/admin/reservas')
      .set('Cookie', cookieSocio)
      .send({ canchaId, inicio: bloques[0].inicio, nombre: 'Alguien' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/admin/reservas')
      .send({ canchaId, inicio: bloques[0].inicio, nombre: 'Alguien' })
      .expect(401);
  });
});
