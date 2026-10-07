import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { comoFechaCivil, hoyEnElClub } from '../src/comun/tiempo';
import { hashear } from '../src/identidad/contrasena';
import {
  EstadoReserva,
  EstadoSocio,
  Superficie,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T34. Reportar una hora reservada que quedó sin usar, y la sanción que el club
 * aplica después de mirarla.
 *
 * Dos cosas se protegen acá y no son la misma: que **nadie pueda reportar lo que no
 * puede haber visto**, y que **la respuesta no diga quién reportó**. La segunda es
 * lo que sostiene la función: sin anonimato nadie reporta al vecino.
 */
describe('Reportes de hora no usada', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let testigo: string;
  let testigoSocioId: number;
  let acusadoSocioId: number;
  let canchaId: number;

  const DOMINIO = '@reportes-t34.test';
  const CONTRASENA = 'raqueta lluviosa 44';
  const NOMBRE_CANCHA = 'Cancha T34';

  // Una hora que terminó hace dos: ya transcurrida y dentro del plazo para
  // reportarla. Con "ayer a las 10" el bloque caía fuera de las 24 horas y el
  // servidor lo rechazaba con razón.
  const HACE_TRES_HORAS = new Date(Date.now() - 3 * 3600_000);
  const HACE_DOS_HORAS = new Date(Date.now() - 2 * 3600_000);

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);

    await limpiar();
    admin = await sesionDe('admin');
    testigo = await sesionDe('testigo', 'T34-testigo');
    await sesionDe('acusado', 'T34-acusado');

    testigoSocioId = await socioIdDe(`testigo${DOMINIO}`);
    acusadoSocioId = await socioIdDe(`acusado${DOMINIO}`);
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.reserva.deleteMany({
      where: { cancha: { nombre: { startsWith: NOMBRE_CANCHA } } },
    });
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await prisma.socio.updateMany({
      where: { id: { in: [testigoSocioId, acusadoSocioId] } },
      data: { sancionadoHasta: null },
    });

    const cancha = await prisma.cancha.create({
      data: { nombre: NOMBRE_CANCHA, superficie: Superficie.ARCILLA },
      select: { id: true },
    });
    canchaId = cancha.id;
  });

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  async function limpiar(): Promise<void> {
    await prisma.reserva.deleteMany({
      where: { cancha: { nombre: { startsWith: NOMBRE_CANCHA } } },
    });
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
  }

  async function socioIdDe(email: string): Promise<number> {
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email },
      select: { socio: { select: { id: true } } },
    });

    return usuario.socio!.id;
  }

  async function sesionDe(
    quien: string,
    numeroSocio?: string,
  ): Promise<string> {
    const email = `${quien}${DOMINIO}`;

    await prisma.usuario.create({
      data: {
        email,
        nombre: quien,
        apellido: 'De Prueba',
        telefono: '+56911112222',
        esAdmin: quien === 'admin',
        passwordHash: await hashear(CONTRASENA),
        socio: numeroSocio
          ? {
              create: {
                numeroSocio,
                estado: EstadoSocio.ACTIVO,
                fechaIngreso: new Date('2026-01-01T00:00:00.000Z'),
                alDiaHasta: new Date('2099-12-31T00:00:00.000Z'),
              },
            }
          : undefined,
      },
    });

    const respuesta = await request(servidor())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);

    return (respuesta.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  }

  /** Una reserva del socio acusado, ya transcurrida y reportable. */
  const unaReserva = async (
    parche: {
      inicio?: Date;
      fin?: Date;
      estado?: EstadoReserva;
      socioId?: number | null;
      acompanantes?: number[];
    } = {},
  ) => {
    const reserva = await prisma.reserva.create({
      data: {
        folio: `T34${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        canchaId,
        inicio: parche.inicio ?? HACE_TRES_HORAS,
        fin: parche.fin ?? HACE_DOS_HORAS,
        estado: parche.estado ?? EstadoReserva.CONFIRMADA,
        socioId: parche.socioId === undefined ? acusadoSocioId : parche.socioId,
        nombre: 'Acusado De Prueba',
        email: `acusado${DOMINIO}`,
        telefono: '+56911112222',
        acompanantes: parche.acompanantes
          ? { create: parche.acompanantes.map((socioId) => ({ socioId })) }
          : undefined,
      },
      select: { id: true },
    });

    return reserva.id;
  };

  const reportar = (reservaId: number, cookie = testigo) =>
    request(servidor())
      .post(`/api/reservas/${reservaId}/reportes`)
      .set('Cookie', cookie);

  const resolver = (reservaId: number, decision: string, cookie = admin) =>
    request(servidor())
      .post(`/api/admin/reportes/${reservaId}`)
      .set('Cookie', cookie)
      .send({ decision });

  describe('quién puede reportar', () => {
    it('sin sesión, 401', async () => {
      const id = await unaReserva();

      await request(servidor())
        .post(`/api/reservas/${id}/reportes`)
        .expect(401);
    });

    it('quien no tiene ficha de socio, 403', async () => {
      const id = await unaReserva();
      const visitante = await sesionDe('visitante');

      await reportar(id, visitante).expect(403);
      await prisma.usuario.deleteMany({
        where: { email: `visitante${DOMINIO}` },
      });
    });

    it('un socio testigo puede, y el reporte queda pendiente', async () => {
      const id = await unaReserva();

      await reportar(id).expect(201);

      expect(
        await prisma.reporteNoUso.count({
          where: { reservaId: id, estado: 'PENDIENTE' },
        }),
      ).toBe(1);
    });
  });

  describe('lo que no se puede reportar', () => {
    it('la reserva propia', async () => {
      // Quien iba a jugar no es testigo: es parte.
      const id = await unaReserva({ socioId: testigoSocioId });

      await reportar(id).expect(403);
    });

    it('una en la que el reportante estaba declarado como acompañante', async () => {
      const id = await unaReserva({ acompanantes: [testigoSocioId] });

      await reportar(id).expect(403);
    });

    it('una hora que todavía no empieza', async () => {
      const enDosHoras = new Date(Date.now() + 2 * 3600_000);
      const id = await unaReserva({
        inicio: enDosHoras,
        fin: new Date(enDosHoras.getTime() + 3600_000),
      });

      await reportar(id).expect(409);
    });

    it('una de hace tres días', async () => {
      // Pasadas 24 horas nadie puede verificar nada, y un reporte que no se puede
      // comprobar solo sirve para molestar.
      const haceTresDias = new Date(Date.now() - 72 * 3600_000);
      const id = await unaReserva({
        inicio: haceTresDias,
        fin: new Date(haceTresDias.getTime() + 3600_000),
      });

      await reportar(id).expect(409);
    });

    it('una cancelada: liberó la cancha, nadie la dejó vacía', async () => {
      const id = await unaReserva({ estado: EstadoReserva.CANCELADA });

      await reportar(id).expect(409);
    });

    it('dos veces la misma: 409 y un solo reporte', async () => {
      const id = await unaReserva();

      await reportar(id).expect(201);
      await reportar(id).expect(409);

      expect(
        await prisma.reporteNoUso.count({ where: { reservaId: id } }),
      ).toBe(1);
    });
  });

  describe('qué horas puede reportar el socio (T35)', () => {
    // El día **de la reserva sembrada**, en hora del club. No "hoy": entre medianoche
    // y las tres de la mañana, una hora que terminó hace dos cae en el día anterior, y
    // el endpoint devolvía los reportables de un día en el que todavía no pasó nada.
    //
    // La versión anterior cambió `new Date()` por `hoyEnElClub()` para arreglar esto
    // mismo entre las 20:00 y la medianoche; **mudó la ventana rota en vez de
    // cerrarla**, y estos dos tests seguían fallando tres horas cada noche. Preguntar
    // por el día al que pertenece lo que se sembró es cierto a cualquier hora.
    const elDiaDeLaReserva = () => comoFechaCivil(hoyEnElClub(HACE_TRES_HORAS));

    const reportables = (cookie = testigo) =>
      request(servidor())
        .get(`/api/reservas/reportables?fecha=${elDiaDeLaReserva()}`)
        .set('Cookie', cookie);

    it('trae la hora ajena ya transcurrida', async () => {
      const id = await unaReserva();

      const respuesta = await reportables().expect(200);

      expect(
        (respuesta.body as { reservaId: number }[]).map((r) => r.reservaId),
      ).toContain(id);
    });

    it('no trae las suyas ni aquellas en las que estaba declarado', async () => {
      const propia = await unaReserva({ socioId: testigoSocioId });
      const comoAcompanante = await unaReserva({
        acompanantes: [testigoSocioId],
        inicio: new Date(Date.now() - 5 * 3600_000),
        fin: new Date(Date.now() - 4 * 3600_000),
      });

      const respuesta = await reportables().expect(200);
      const ids = (respuesta.body as { reservaId: number }[]).map(
        (r) => r.reservaId,
      );

      // De esas no es testigo, es parte. Ofrecerle el botón sería prometerle algo
      // que el servidor le va a negar.
      expect(ids).not.toContain(propia);
      expect(ids).not.toContain(comoAcompanante);
    });

    it('marca la que ya reportó, para no ofrecer un 409', async () => {
      const id = await unaReserva();
      await reportar(id).expect(201);

      const respuesta = await reportables().expect(200);
      const fila = (
        respuesta.body as { reservaId: number; yaReportada: boolean }[]
      ).find((r) => r.reservaId === id);

      expect(fila?.yaReportada).toBe(true);
    });

    it('no trae lo que todavía no empezó', async () => {
      const enDosHoras = new Date(Date.now() + 2 * 3600_000);
      const id = await unaReserva({
        inicio: enDosHoras,
        fin: new Date(enDosHoras.getTime() + 3600_000),
      });

      const respuesta = await reportables().expect(200);

      expect(
        (respuesta.body as { reservaId: number }[]).map((r) => r.reservaId),
      ).not.toContain(id);
    });

    it('quien no es socio no puede preguntarlo', async () => {
      const visitante = await sesionDe('curioso');

      await reportables(visitante).expect(403);
      await prisma.usuario.deleteMany({
        where: { email: `curioso${DOMINIO}` },
      });
    });
  });

  describe('la bandeja del admin', () => {
    it('lista la hora reportada con cuántos reportes tiene', async () => {
      const id = await unaReserva();
      await reportar(id).expect(201);

      const respuesta = await request(servidor())
        .get('/api/admin/reportes')
        .set('Cookie', admin)
        .expect(200);

      const fila = (
        respuesta.body as { reservaId: number; reportes: number }[]
      ).find((r) => r.reservaId === id);
      expect(fila?.reportes).toBe(1);
    });

    it('**no dice quién reportó**, por ningún camino', async () => {
      // **Test obligatorio de T34.** El anonimato es lo que sostiene la función, y
      // un `select` de más lo rompería en silencio. Se mira el JSON entero y no un
      // campo: mañana alguien lo devuelve anidado en otra cosa.
      const id = await unaReserva();
      await reportar(id).expect(201);

      const respuesta = await request(servidor())
        .get('/api/admin/reportes')
        .set('Cookie', admin)
        .expect(200);

      const texto = JSON.stringify(respuesta.body);
      expect(texto).not.toContain('reportante');
      expect(texto).not.toContain(`"${testigoSocioId}"`);
      expect(texto).not.toContain('T34-testigo');
    });

    it('un socio no entra a la bandeja', async () => {
      await request(servidor())
        .get('/api/admin/reportes')
        .set('Cookie', testigo)
        .expect(403);
    });
  });

  describe('sancionar', () => {
    it('el socio queda sin poder reservar, y el mensaje dice hasta cuándo', async () => {
      const id = await unaReserva();
      await reportar(id).expect(201);

      await resolver(id, 'SANCIONAR').expect(201);

      const socio = await prisma.socio.findUniqueOrThrow({
        where: { id: acusadoSocioId },
      });
      expect(socio.sancionadoHasta).not.toBeNull();
    });

    it('la sanción queda en el historial del socio, con quién y por qué hora (T37)', async () => {
      // Es el otro camino que escribe un campo de derechos. Sin pasar por el mismo
      // punto que la edición del panel, sería el único cambio del padrón sin autor —y
      // es de los que el socio más pregunta.
      const id = await unaReserva();
      const folio = (
        await prisma.reserva.findUniqueOrThrow({
          where: { id },
          select: { folio: true },
        })
      ).folio;
      await reportar(id).expect(201);

      await resolver(id, 'SANCIONAR').expect(201);

      // Por el folio y no contando el total: el socio acusado es el mismo en todo el
      // archivo y arrastra los renglones de los tests anteriores.
      const renglones = await prisma.cambioSocio.findMany({
        where: { socioId: acusadoSocioId, motivo: { contains: folio } },
      });

      expect(renglones).toHaveLength(1);
      expect(renglones[0].campo).toBe('sancionadoHasta');
      expect(renglones[0].hechoPorNombre).not.toBe('');
    });

    it('descartar el reporte no deja renglón: no cambió ningún derecho', async () => {
      const antes = await prisma.cambioSocio.count({
        where: { socioId: acusadoSocioId },
      });
      const id = await unaReserva();
      await reportar(id).expect(201);

      await resolver(id, 'DESCARTAR').expect(201);

      expect(
        await prisma.cambioSocio.count({ where: { socioId: acusadoSocioId } }),
      ).toBe(antes);
    });

    it('resuelve juntos todos los reportes de esa hora', async () => {
      const id = await unaReserva();
      await reportar(id).expect(201);
      // Un segundo testigo sobre la misma hora.
      await prisma.reporteNoUso.create({
        data: { reservaId: id, reportanteSocioId: acusadoSocioId },
      });

      await resolver(id, 'SANCIONAR').expect(201);

      expect(
        await prisma.reporteNoUso.count({
          where: { reservaId: id, estado: 'PENDIENTE' },
        }),
      ).toBe(0);
    });

    it('sancionar a alguien ya sancionado extiende desde la fecha mayor', async () => {
      // Sin esto, la segunda sanción pisa la primera con una fecha más cercana y
      // el castigo se **acorta** por reincidir.
      const dentroDeUnMes = new Date(Date.now() + 30 * 24 * 3600_000);
      await prisma.socio.update({
        where: { id: acusadoSocioId },
        data: { sancionadoHasta: dentroDeUnMes },
      });

      const id = await unaReserva();
      await reportar(id).expect(201);
      await resolver(id, 'SANCIONAR').expect(201);

      const socio = await prisma.socio.findUniqueOrThrow({
        where: { id: acusadoSocioId },
      });
      expect(socio.sancionadoHasta!.getTime()).toBeGreaterThan(
        dentroDeUnMes.getTime(),
      );
    });

    it('descartar deja al socio como estaba', async () => {
      const id = await unaReserva();
      await reportar(id).expect(201);

      await resolver(id, 'DESCARTAR').expect(201);

      const socio = await prisma.socio.findUniqueOrThrow({
        where: { id: acusadoSocioId },
      });
      expect(socio.sancionadoHasta).toBeNull();
    });

    it('una decisión que no existe, 400', async () => {
      const id = await unaReserva();
      await reportar(id).expect(201);

      await resolver(id, 'PERDONAR').expect(400);
    });

    it('una hora de visitante no se puede sancionar: no hay socio', async () => {
      const id = await unaReserva({ socioId: null });
      await reportar(id).expect(201);

      await resolver(id, 'SANCIONAR').expect(409);
    });
  });

  describe('lo que la sanción impide, y lo que no', () => {
    it('el socio sancionado no puede reservar', async () => {
      await prisma.socio.update({
        where: { id: testigoSocioId },
        data: { sancionadoHasta: new Date(Date.now() + 5 * 24 * 3600_000) },
      });

      const manana = new Date(Date.now() + 24 * 3600_000)
        .toISOString()
        .slice(0, 10);
      const respuesta = await request(servidor())
        .post('/api/reservas')
        .set('Cookie', testigo)
        .send({
          canchaId,
          inicio: `${manana}T14:00:00.000Z`,
          acompanantes: [{ nombre: 'Ana Invitada' }],
        });

      // 409 y no 403: no es un problema de permisos sino del estado de las cosas.
      expect(respuesta.status).toBe(409);
      expect((respuesta.body as { motivo?: string }).motivo).toBe('SANCIONADO');
    });

    it('**conserva las reservas que ya tenía**', async () => {
      // **Test obligatorio.** La sanción impide reservar de nuevo; no borra lo
      // hecho, igual que la morosidad.
      //
      // La reserva va al futuro a propósito: `mias()` lista lo que todavía se
      // puede jugar, que es donde se notaría que una sanción se llevó algo.
      const enTresDias = new Date(Date.now() + 3 * 24 * 3600_000);
      const id = await unaReserva({
        socioId: testigoSocioId,
        inicio: enTresDias,
        fin: new Date(enTresDias.getTime() + 3600_000),
      });

      await prisma.socio.update({
        where: { id: testigoSocioId },
        data: { sancionadoHasta: new Date(Date.now() + 5 * 24 * 3600_000) },
      });

      const reserva = await prisma.reserva.findUnique({ where: { id } });
      expect(reserva?.estado).toBe(EstadoReserva.CONFIRMADA);

      const mias = await request(servidor())
        .get('/api/reservas/mias')
        .set('Cookie', testigo)
        .expect(200);
      expect(JSON.stringify(mias.body)).toContain(String(id));
    });
  });
});
