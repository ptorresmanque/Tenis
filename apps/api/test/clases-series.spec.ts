import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  ConceptoPago,
  EstadoInscripcion,
  EstadoReserva,
  EstadoSocio,
  EstadoTransaccion,
  MotivoBloqueo,
  NivelClase,
  Superficie,
} from '../src/generated/prisma/client';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { Inscripciones } from '../src/clases/inscripciones.service';
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

    it('**unas notas de 500 caracteres, el tope, se guardan enteras en la serie y en sus clases**', async () => {
      const notas = 'ñ'.repeat(500);

      const respuesta = await agendar(serie({ notas })).expect(201);
      const agendada = respuesta.body as SerieAgendada;

      const guardada = await prisma.serieDeClases.findUniqueOrThrow({
        where: { id: agendada.id },
      });
      expect(guardada.notas).toBe(notas);
      const clase = await prisma.clase.findUniqueOrThrow({
        where: { id: agendada.clases[0].id },
      });
      expect(clase.notas).toBe(notas);
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

  /**
   * T116. Inscribir en la serie completa (decisión 8): una inscripción en cada clase que
   * viene, en una transacción. Salirse cancela solo las que vienen (A10).
   */
  describe('inscribir en la serie (T116)', () => {
    let serieId: number;
    let clases: { id: number; fecha: string }[];

    const socio = async (quien: string) => {
      const usuario = await prisma.usuario.create({
        data: {
          email: `${quien}${DOMINIO}`,
          nombre: quien,
          apellido: 'De la serie',
          socio: {
            create: {
              numeroSocio: `SER-${quien}-${Date.now()}`,
              estado: EstadoSocio.ACTIVO,
              fechaIngreso: new Date('2026-01-01'),
              alDiaHasta: new Date('2040-01-01'),
            },
          },
        },
        select: { socio: { select: { id: true } } },
      });

      return usuario.socio!.id;
    };

    const enLaSerie = (
      cuerpo: Record<string, unknown>,
      ruta = 'inscripciones',
    ) =>
      request(servidor())
        .post(`/api/admin/clases/series/${serieId}/${ruta}`)
        .set('Cookie', cookieAdmin)
        .send(cuerpo);

    const inscripcionesDe = (socioId: number) =>
      prisma.inscripcionClase.findMany({
        where: { socioId, clase: { serieId } },
        orderBy: { clase: { inicio: 'asc' } },
        select: { claseId: true, estado: true },
      });

    beforeEach(async () => {
      await prisma.usuario.deleteMany({
        where: {
          email: { endsWith: DOMINIO },
          NOT: { email: { in: [`jefa${DOMINIO}`, `curioso${DOMINIO}`] } },
        },
      });
      // Cupo 2: alcanza para ver una clase llena con dos inscritos.
      const respuesta = await request(servidor())
        .post('/api/admin/clases/series')
        .set('Cookie', cookieAdmin)
        .send(serie({ cupoMaximo: 2 }))
        .expect(201);
      ({ id: serieId, clases } = respuesta.body as {
        id: number;
        clases: { id: number; fecha: string }[];
      });
    });

    it('**inscribir en una serie de 18 clases deja 18 inscripciones**', async () => {
      const ana = await socio('ana');

      const respuesta = await enLaSerie({ socioId: ana }).expect(201);

      expect(respuesta.body).toEqual({ inscritas: 18, yaEstaba: 0 });
      expect(await inscripcionesDe(ana)).toHaveLength(18);
    });

    it('un alumno de afuera también, con su nombre y su teléfono', async () => {
      await enLaSerie({
        nombre: 'Pedro Afuera',
        telefono: '+56911112222',
      }).expect(201);

      expect(
        await prisma.inscripcionClase.count({
          where: { nombre: 'Pedro Afuera', clase: { serieId } },
        }),
      ).toBe(18);
    });

    it('**si una clase está llena, no inscribe en ninguna y dice cuál**', async () => {
      // El 22 de octubre se llenó con dos inscritos sueltos.
      const llena = clases.find((clase) => clase.fecha === '2037-10-22')!;
      for (const quien of ['bea', 'carla']) {
        await request(servidor())
          .post(`/api/admin/clases/${llena.id}/inscripciones`)
          .set('Cookie', cookieAdmin)
          .send({ socioId: await socio(quien) })
          .expect(201);
      }
      const ana = await socio('ana');

      const respuesta = await enLaSerie({ socioId: ana }).expect(409);

      expect((respuesta.body as { message: string }).message).toContain(
        'jueves 22 de octubre',
      );
      expect(await inscripcionesDe(ana)).toHaveLength(0);
    });

    it('**un socio ya inscrito en una clase suelta de la serie no queda duplicado**', async () => {
      const ana = await socio('ana');
      await request(servidor())
        .post(`/api/admin/clases/${clases[3].id}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .send({ socioId: ana })
        .expect(201);

      const respuesta = await enLaSerie({ socioId: ana }).expect(201);

      expect(respuesta.body).toEqual({ inscritas: 17, yaEstaba: 1 });
      expect(await inscripcionesDe(ana)).toHaveLength(18);
    });

    it('**salirse el 1 de diciembre conserva las inscripciones y asistencias anteriores**', async () => {
      const ana = await socio('ana');
      await enLaSerie({ socioId: ana }).expect(201);
      // La primera clase ya se dio y vino.
      await prisma.inscripcionClase.updateMany({
        where: { socioId: ana, claseId: clases[0].id },
        data: { estado: EstadoInscripcion.ASISTIO },
      });

      const { canceladas } = await app
        .get(Inscripciones)
        .salirDeLaSerie(
          serieId,
          { socioId: ana, nombre: null, telefono: null },
          instanteEnElClub('2037-12-01', '00:00'),
        );

      const despues = await inscripcionesDe(ana);
      const fechaDe = (claseId: number) =>
        clases.find((clase) => clase.id === claseId)!.fecha;
      expect(
        despues
          .filter((i) => fechaDe(i.claseId) < '2037-12-01')
          .map((i) => i.estado),
      ).toEqual([
        EstadoInscripcion.ASISTIO,
        ...Array<EstadoInscripcion>(12).fill(EstadoInscripcion.INSCRITA),
      ]);
      expect(
        despues
          .filter((i) => fechaDe(i.claseId) >= '2037-12-01')
          .every((i) => i.estado === EstadoInscripcion.CANCELADA),
      ).toBe(true);
      expect(canceladas).toBe(5);
    });

    it('salirse por la ruta del panel cancela las que vienen', async () => {
      const ana = await socio('ana');
      await enLaSerie({ socioId: ana }).expect(201);

      const respuesta = await enLaSerie(
        { socioId: ana },
        'inscripciones/cancelacion',
      ).expect(201);

      expect(respuesta.body).toEqual({ canceladas: 18 });
    });

    it('la ficha de una clase dice de qué serie es, y el socio de cada inscrito', async () => {
      const ana = await socio('ana');
      await enLaSerie({ socioId: ana }).expect(201);

      const ficha = await request(servidor())
        .get(`/api/admin/clases/${clases[0].id}`)
        .set('Cookie', cookieAdmin)
        .expect(200);

      expect(ficha.body).toMatchObject({
        serieId,
        inscritos: [expect.objectContaining({ socioId: ana })],
      });
    });

    it('una serie que no existe responde 404', async () => {
      serieId = 999_999;
      await enLaSerie({ socioId: 1 }).expect(404);
    });
  });

  /**
   * T117. Cancelar la serie desde una fecha, y la serie en la página pública como una sola
   * tarjeta en vez de una clase por fecha.
   */
  describe('cancelar desde una fecha y la serie pública (T117)', () => {
    let serieId: number;

    const bloqueadoA = async (fecha: string) => {
      const respuesta = await request(servidor())
        .get(`/api/disponibilidad?cancha=${canchaId}&fecha=${fecha}`)
        .expect(200);

      return (respuesta.body as { inicio: string; bloqueado: boolean }[]).find(
        (b) => b.inicio === instanteEnElClub(fecha, '19:00').toISOString(),
      )!.bloqueado;
    };

    const cancelarDesde = (cuerpo: Record<string, unknown>) =>
      request(servidor())
        .post(`/api/admin/clases/series/${serieId}/cancelacion`)
        .set('Cookie', cookieAdmin)
        .send(cuerpo);

    interface SeriePublica {
      id: number;
      diasSemana: number[];
      horaDesde: string;
      horaHasta: string;
      hasta: string;
      cuposLibres: number;
      profesor: string;
      cancha: string;
      nivel: string;
    }

    const publicas = async (desde = '2037-10-13') =>
      (
        await request(servidor())
          .get(`/api/clases/publicas?desde=${desde}`)
          .expect(200)
      ).body as { clases: { id: number }[]; series: SeriePublica[] };

    beforeEach(async () => {
      const respuesta = await request(servidor())
        .post('/api/admin/clases/series')
        .set('Cookie', cookieAdmin)
        .send(serie())
        .expect(201);
      serieId = (respuesta.body as { id: number }).id;
    });

    it('**cancelar desde el 1 de diciembre libera esas horas, y las de noviembre siguen tomadas**', async () => {
      expect(await bloqueadoA('2037-12-01')).toBe(true);

      const respuesta = await cancelarDesde({
        desde: '2037-12-01',
        motivo: 'El profesor termina la temporada',
      }).expect(201);

      // El 1, el 3, el 8, el 10 y el 15 de diciembre.
      expect(respuesta.body).toEqual({ canceladas: 5 });
      expect(await bloqueadoA('2037-12-01')).toBe(false);
      expect(await bloqueadoA('2037-11-26')).toBe(true);
      const canceladas = await prisma.clase.findMany({
        where: { serieId, estado: 'CANCELADA' },
        select: { motivoCancelacion: true, bloqueoId: true },
      });
      expect(canceladas).toHaveLength(5);
      expect(canceladas.every((c) => c.bloqueoId === null)).toBe(true);
      expect(canceladas[0].motivoCancelacion).toBe(
        'El profesor termina la temporada',
      );
    });

    it('sin motivo responde 400: los inscritos van a preguntar', async () => {
      await cancelarDesde({ desde: '2037-12-01' }).expect(400);
    });

    it('desde una fecha posterior a la última clase no hay nada que cancelar, y lo dice', async () => {
      const respuesta = await cancelarDesde({
        desde: '2037-12-20',
        motivo: 'Fin',
      }).expect(409);

      expect((respuesta.body as { message: string }).message).toContain(
        'no tiene clases',
      );
    });

    it('la agenda del día dice de qué serie es cada clase', async () => {
      const respuesta = await request(servidor())
        .get('/api/admin/clases?fecha=2037-10-15')
        .set('Cookie', cookieAdmin)
        .expect(200);

      expect(respuesta.body).toEqual([expect.objectContaining({ serieId })]);
    });

    it('**la página pública muestra la serie una vez, y sus clases no se repiten en la semana**', async () => {
      const { clases, series } = await publicas();

      expect(series.filter((s) => s.id === serieId)).toEqual([
        {
          id: serieId,
          diasSemana: [2, 4],
          horaDesde: '19:00',
          horaHasta: '20:00',
          hasta: '2037-12-15',
          cuposLibres: 6,
          profesor: 'Profe Series',
          cancha: NOMBRE_CANCHA,
          nivel: NivelClase.INICIACION,
        },
      ]);
      const deLaSerie = await prisma.clase.findMany({
        where: { serieId },
        select: { id: true },
      });
      const ids = new Set(deLaSerie.map((c) => c.id));
      expect(clases.filter((c) => ids.has(c.id))).toEqual([]);
    });

    it('cancelada desde el 1 de diciembre, la tarjeta dice hasta la última clase que queda', async () => {
      await cancelarDesde({
        desde: '2037-12-01',
        motivo: 'Fin de temporada',
      }).expect(201);

      const { series } = await publicas();

      expect(series.find((s) => s.id === serieId)!.hasta).toBe('2037-11-26');
    });
  });
});
