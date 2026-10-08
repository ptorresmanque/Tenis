import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  ConceptoPago,
  EstadoReserva,
  EstadoTransaccion,
  MotivoBloqueo,
  NivelClase,
  Superficie,
} from '../src/generated/prisma/client';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T113. POST /api/admin/clases/series/simulacion: lo que una serie generaría, fecha por
 * fecha, sin escribir nada. Es la lista que el admin mira antes de agendar (T114), y por
 * eso cada fecha trae a quién le quitaría la hora y qué otra cosa ya ocupa la cancha.
 *
 * En 2037, que repite el calendario de 2026: el 14 de octubre también es miércoles.
 */
describe('POST /api/admin/clases/series/simulacion', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let canchaId: number;
  let profesorId: number;
  let cookieAdmin: string;
  let cookieUsuario: string;

  const NOMBRE_CANCHA = 'Cancha de las series';
  const DOMINIO = '@series.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const enviados: CorreoSaliente[] = [];

  const serie = (parche: Record<string, unknown> = {}) => ({
    canchaId,
    profesorId,
    diasSemana: [2, 4],
    horaDesde: '19:00',
    horaHasta: '20:00',
    desde: '2037-10-14',
    hasta: '2037-12-15',
    cupoMaximo: 6,
    nivel: NivelClase.INICIACION,
    ...parche,
  });

  interface FechaSimulada {
    fecha: string;
    inicio: string;
    fin: string;
    choque: string | null;
    afectadas: { folio: string; nombre: string; pagada: boolean }[];
  }

  const simular = (cuerpo: Record<string, unknown>, cookie = cookieAdmin) =>
    request(servidor())
      .post('/api/admin/clases/series/simulacion')
      .set('Cookie', cookie)
      .send(cuerpo);

  const crearCuenta = async (sufijo: string, esAdmin: boolean) => {
    await request(servidor())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'De las series',
      });
    await prisma.usuario.update({
      where: { email: `${sufijo}${DOMINIO}` },
      data: { esAdmin },
    });

    const respuesta = await request(servidor())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA });

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  beforeAll(async () => {
    // El doble de la pasarela, para devolver lo pagado de una reserva cancelada (T114).
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .overrideProvider(EnviadorCorreo)
      .useValue({
        enviar: (correo: CorreoSaliente) => {
          enviados.push(correo);
          return Promise.resolve();
        },
      })
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);

    await prisma.cancha.deleteMany({ where: { nombre: NOMBRE_CANCHA } });
    await prisma.profesor.deleteMany({
      where: { nombreVisible: 'Profe Series' },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    const cancha = await prisma.cancha.create({
      data: {
        nombre: NOMBRE_CANCHA,
        superficie: Superficie.CEMENTO,
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

    const profesor = await prisma.profesor.create({
      data: {
        nombreVisible: 'Profe Series',
        telefono: '+56944444444',
        especialidad: 'Iniciación',
      },
      select: { id: true },
    });
    profesorId = profesor.id;

    cookieAdmin = await crearCuenta('jefa', true);
    cookieUsuario = await crearCuenta('curioso', false);
  });

  // Cada caso parte con la cancha vacía: las series dejan clases y bloqueos.
  beforeEach(async () => {
    await prisma.clase.deleteMany({ where: { canchaId } });
    await prisma.serieDeClases.deleteMany({ where: { canchaId } });
    await prisma.bloqueo.deleteMany({ where: { canchaId } });
    await prisma.reserva.deleteMany({ where: { canchaId } });
    enviados.length = 0;
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({ where: { nombre: NOMBRE_CANCHA } });
    await prisma.profesor.deleteMany({
      where: { nombreVisible: 'Profe Series' },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  it('**martes y jueves del 14 de octubre al 15 de diciembre devuelve 18 fechas**', async () => {
    const respuesta = await simular(serie()).expect(200);
    const fechas = (respuesta.body as { fechas: FechaSimulada[] }).fechas;

    expect(fechas).toHaveLength(18);
    expect(fechas[0]).toMatchObject({
      fecha: '2037-10-15',
      inicio: instanteEnElClub('2037-10-15', '19:00').toISOString(),
      choque: null,
      afectadas: [],
    });
  });

  it('**cada fecha trae sus reservas afectadas, con folio, nombre y si estaban pagadas**', async () => {
    const reserva = await prisma.reserva.create({
      data: {
        folio: 'SERIE01',
        canchaId,
        inicio: instanteEnElClub('2037-10-20', '19:00'),
        fin: instanteEnElClub('2037-10-20', '20:00'),
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'Visitante Pagado',
        email: `pagado${DOMINIO}`,
        telefono: '+56900000000',
      },
    });
    await prisma.transaccion.create({
      data: {
        referencia: `SERIE01-${Date.now()}`,
        concepto: ConceptoPago.RESERVA,
        conceptoId: reserva.id,
        montoClp: 12000,
        estado: EstadoTransaccion.AUTORIZADA,
        pasarela: 'doble',
      },
    });

    const respuesta = await simular(serie()).expect(200);
    const fechas = (respuesta.body as { fechas: FechaSimulada[] }).fechas;

    expect(fechas.find((f) => f.fecha === '2037-10-20')!.afectadas).toEqual([
      expect.objectContaining({
        folio: 'SERIE01',
        nombre: 'Visitante Pagado',
        pagada: true,
      }),
    ]);
    // Las demás fechas, sin nadie debajo.
    expect(fechas.filter((f) => f.afectadas.length > 0)).toHaveLength(1);

    await prisma.reserva.delete({ where: { id: reserva.id } });
  });

  it('una fecha con la cancha ya cerrada lo dice, y la serie se simula igual', async () => {
    // Otra clase, un torneo o una mantención: en la simulación es un dato de esa fecha, no
    // un error de toda la serie. El admin decide fecha por fecha en T114.
    const bloqueo = await prisma.bloqueo.create({
      data: {
        canchaId,
        inicio: instanteEnElClub('2037-10-22', '18:30'),
        fin: instanteEnElClub('2037-10-22', '19:30'),
        motivo: MotivoBloqueo.MANTENCION,
        descripcion: 'Cambio de red',
      },
    });

    const respuesta = await simular(serie()).expect(200);
    const fechas = (respuesta.body as { fechas: FechaSimulada[] }).fechas;

    expect(fechas).toHaveLength(18);
    expect(fechas.find((f) => f.fecha === '2037-10-22')!.choque).toContain(
      'Cambio de red',
    );

    await prisma.bloqueo.delete({ where: { id: bloqueo.id } });
  });

  it('una hora fuera del horario de la cancha lo dice en cada fecha', async () => {
    const respuesta = await simular(
      serie({ horaDesde: '22:00', horaHasta: '23:00' }),
    ).expect(200);
    const fechas = (respuesta.body as { fechas: FechaSimulada[] }).fechas;

    expect(
      fechas.every(
        (f) => f.choque === 'Esa hora no está en el horario de la cancha.',
      ),
    ).toBe(true);
  });

  it('**más de 6 meses, o ningún día de la semana, responde 400**', async () => {
    await simular(serie({ hasta: '2038-04-15' })).expect(400);
    await simular(serie({ diasSemana: [] })).expect(400);
  });

  it('un profesor que no existe responde 404, antes de simular nada', async () => {
    await simular(serie({ profesorId: 999_999 })).expect(404);
  });

  it('solo el admin simula series', async () => {
    await simular(serie(), cookieUsuario).expect(403);
  });

  it('simular no escribe nada', async () => {
    const antes = await prisma.clase.count({ where: { canchaId } });

    await simular(serie()).expect(200);

    expect(await prisma.clase.count({ where: { canchaId } })).toBe(antes);
    expect(await prisma.bloqueo.count({ where: { canchaId } })).toBe(0);
  });

  /**
   * T114. POST /api/admin/clases/series: agendar la serie, con la decisión de cada fecha que
   * tiene algo encima (decisión 9). Cada fecha pasa por la cascada de una clase suelta.
   */
  describe('agendar la serie (T114)', () => {
    interface SerieAgendada {
      id: number;
      clases: { id: number; fecha: string }[];
      saltadas: string[];
      canceladas: { folio: string }[];
    }

    const agendar = (cuerpo: Record<string, unknown>) =>
      request(servidor())
        .post('/api/admin/clases/series')
        .set('Cookie', cookieAdmin)
        .send(cuerpo);

    /** Una reserva de visitante pagada de verdad, por el doble de la pasarela. */
    const reservaPagada = async (fecha: string) => {
      const inicio = await request(servidor())
        .post('/api/reservas/no-socio')
        .send({
          canchaId,
          inicio: instanteEnElClub(fecha, '19:00').toISOString(),
          nombre: 'Visitante Desplazado',
          email: `desplazado${DOMINIO}`,
          telefono: '+56900000000',
          acompanantes: [{ nombre: 'Rival' }],
        })
        .expect(201);
      const reservaId = (inicio.body as { reservaId: number }).reservaId;
      const transaccion = await prisma.transaccion.findFirstOrThrow({
        where: { concepto: ConceptoPago.RESERVA, conceptoId: reservaId },
      });
      await request(servidor())
        .get(`/api/reservas/retorno?token_ws=${transaccion.tokenPasarela}`)
        .expect(302);

      return prisma.reserva.findUniqueOrThrow({
        where: { id: reservaId },
        select: { id: true, folio: true },
      });
    };

    it('**sin choques crea una clase por fecha, cada una con su bloqueo y atada a la serie**', async () => {
      const respuesta = await agendar(serie()).expect(201);
      const agendada = respuesta.body as SerieAgendada;

      expect(agendada.clases).toHaveLength(18);
      expect(agendada.saltadas).toEqual([]);
      const clases = await prisma.clase.findMany({ where: { canchaId } });
      expect(clases).toHaveLength(18);
      expect(new Set(clases.map((c) => c.serieId))).toEqual(
        new Set([agendada.id]),
      );
      expect(clases.every((c) => c.bloqueoId !== null)).toBe(true);

      const guardada = await prisma.serieDeClases.findUniqueOrThrow({
        where: { id: agendada.id },
      });
      expect(guardada).toMatchObject({
        diasSemana: '2,4',
        horaDesde: '19:00',
        horaHasta: '20:00',
      });
    });

    it('**"saltar" no crea clase ni toca la reserva; "cancelar" la cancela con devolución y correo**', async () => {
      const cancelada = await reservaPagada('2037-10-20');
      const respetada = await reservaPagada('2037-10-22');
      enviados.length = 0;

      const respuesta = await agendar(
        serie({
          decisiones: { '2037-10-20': 'cancelar', '2037-10-22': 'saltar' },
        }),
      ).expect(201);
      const agendada = respuesta.body as SerieAgendada;

      expect(agendada.clases).toHaveLength(17);
      expect(agendada.saltadas).toEqual(['2037-10-22']);
      expect(agendada.canceladas.map((r) => r.folio)).toEqual([
        cancelada.folio,
      ]);

      const [despuesCancelada, despuesRespetada] = await Promise.all([
        prisma.reserva.findUniqueOrThrow({ where: { id: cancelada.id } }),
        prisma.reserva.findUniqueOrThrow({ where: { id: respetada.id } }),
      ]);
      expect(despuesCancelada.estado).toBe(EstadoReserva.CANCELADA);
      expect(despuesRespetada.estado).toBe(EstadoReserva.CONFIRMADA);
      // Devuelta entera, como cuando el club cierra la cancha.
      const pago = await prisma.transaccion.findFirstOrThrow({
        where: { concepto: ConceptoPago.RESERVA, conceptoId: cancelada.id },
      });
      expect(pago.estado).toBe(EstadoTransaccion.ANULADA);
      expect(enviados.map((c) => c.asunto)).toEqual([
        expect.stringContaining('cancelada'),
      ]);
      expect(
        await prisma.clase.count({
          where: { canchaId, inicio: instanteEnElClub('2037-10-22', '19:00') },
        }),
      ).toBe(0);
    });

    it('**una reserva que aparece después de simular, en una fecha sin decisión, rechaza la serie diciendo cuál**', async () => {
      // El admin simuló con la cancha libre; mientras miraba, alguien reservó el 27.
      await simular(serie()).expect(200);
      const nueva = await reservaPagada('2037-10-27');

      const respuesta = await agendar(serie()).expect(409);

      const { message } = respuesta.body as { message: string };
      expect(message).toContain('martes 27 de octubre');
      expect(message).toContain(nueva.folio);
      // Antes de escribir nada: ni serie, ni clases, ni la reserva tocada.
      expect(await prisma.serieDeClases.count({ where: { canchaId } })).toBe(0);
      expect(await prisma.clase.count({ where: { canchaId } })).toBe(0);
      expect(
        (await prisma.reserva.findUniqueOrThrow({ where: { id: nueva.id } }))
          .estado,
      ).toBe(EstadoReserva.CONFIRMADA);
    });

    it('una fecha con la cancha cerrada se puede saltar, no cancelar', async () => {
      await prisma.bloqueo.create({
        data: {
          canchaId,
          inicio: instanteEnElClub('2037-10-22', '18:30'),
          fin: instanteEnElClub('2037-10-22', '19:30'),
          motivo: MotivoBloqueo.MANTENCION,
          descripcion: 'Cambio de red',
        },
      });

      await agendar(serie({ decisiones: { '2037-10-22': 'cancelar' } })).expect(
        409,
      );
      const respuesta = await agendar(
        serie({ decisiones: { '2037-10-22': 'saltar' } }),
      ).expect(201);

      expect((respuesta.body as SerieAgendada).saltadas).toEqual([
        '2037-10-22',
      ]);
    });

    it('una decisión para una fecha que no es de la serie responde 400', async () => {
      await agendar(serie({ decisiones: { '2037-10-21': 'saltar' } })).expect(
        400,
      );
    });

    it('solo el admin agenda series', async () => {
      await request(servidor())
        .post('/api/admin/clases/series')
        .set('Cookie', cookieUsuario)
        .send(serie())
        .expect(403);
    });
  });
});
