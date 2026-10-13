import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  EstadoClase,
  EstadoReserva,
  EstadoSocio,
  NivelClase,
  Superficie,
} from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { EnviadorCorreo } from '../src/identidad/correo';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T218. El profesor en Clases: ve y administra **solo las suyas**
 * (`SPEC-clases.md` § El profesor en el panel, criterios 11, 12, 15–17).
 *
 * El riesgo de esta parte es un endpoint que se quede sin la comprobación: por eso la
 * tabla de abajo pasa por cada endpoint de `admin/clases` que recibe una clase, una
 * serie o un profesor, con los de otro profesor.
 *
 * En 2041, que nadie más usa. El 14 de octubre de 2041 es lunes.
 */
describe('El profesor en Clases', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@clases-t218.test';
  const CANCHA = 'Cancha T218';
  const CONTRASENA = 'raqueta lluviosa 44';
  const DIA = '2041-10-14';

  let canchaId: number;
  let fichaA: number;
  let fichaB: number;
  let socioId: number;
  let claseDeB: number;
  let inscripcionEnB: number;
  let serieDeB: number;

  const cookies: Record<string, string> = {};

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const crearCuenta = async (
    quien: string,
    datos: { esAdmin?: boolean; esGestor?: boolean } = {},
  ) => {
    const usuario = await prisma.usuario.create({
      data: {
        email: `${quien}${DOMINIO}`,
        nombre: quien,
        apellido: 'T218',
        telefono: '56911112222',
        passwordHash: await hashear(CONTRASENA),
        ...datos,
      },
      select: { id: true },
    });

    const respuesta = await request(servidor())
      .post('/api/auth/login')
      .send({ email: `${quien}${DOMINIO}`, contrasena: CONTRASENA })
      .expect(204);
    cookies[quien] = (
      respuesta.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];

    return usuario.id;
  };

  const ficha = async (nombreVisible: string, usuarioId: number) =>
    (
      await prisma.profesor.create({
        data: {
          nombreVisible,
          telefono: '56933334444',
          especialidad: 'Iniciación',
          usuarioId,
        },
        select: { id: true },
      })
    ).id;

  const clase = (profesorId: number, horaDesde: string, horaHasta: string) => ({
    canchaId,
    profesorId,
    fecha: DIA,
    horaDesde,
    horaHasta,
    cupoMaximo: 6,
    nivel: NivelClase.INICIACION,
  });

  const serie = (profesorId: number, horaDesde: string, horaHasta: string) => ({
    canchaId,
    profesorId,
    diasSemana: [3],
    horaDesde,
    horaHasta,
    desde: '2041-10-15',
    hasta: '2041-11-05',
    cupoMaximo: 6,
    nivel: NivelClase.INICIACION,
  });

  const como = (quien: string) => ({
    get: (ruta: string) =>
      request(servidor())
        .get(`/api/admin/${ruta}`)
        .set('Cookie', cookies[quien]),
    post: (ruta: string, cuerpo: object = {}) =>
      request(servidor())
        .post(`/api/admin/${ruta}`)
        .set('Cookie', cookies[quien])
        .send(cuerpo),
    patch: (ruta: string, cuerpo: object = {}) =>
      request(servidor())
        .patch(`/api/admin/${ruta}`)
        .set('Cookie', cookies[quien])
        .send(cuerpo),
  });

  const limpiar = async () => {
    await prisma.cancha.deleteMany({ where: { nombre: CANCHA } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .overrideProvider(EnviadorCorreo)
      .useValue({ enviar: () => Promise.resolve() })
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);

    await limpiar();

    canchaId = (
      await prisma.cancha.create({
        data: {
          nombre: CANCHA,
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
      })
    ).id;

    await crearCuenta('jefe', { esAdmin: true });
    await crearCuenta('gestora', { esGestor: true });
    fichaA = await ficha('Profe A T218', await crearCuenta('profe-a'));
    fichaB = await ficha('Profe B T218', await crearCuenta('profe-b'));
    const usuarioSocio = await crearCuenta('socia');
    socioId = (
      await prisma.socio.create({
        data: {
          usuarioId: usuarioSocio,
          numeroSocio: 'T218-1',
          estado: EstadoSocio.ACTIVO,
          fechaIngreso: new Date('2026-01-01'),
          alDiaHasta: new Date('2099-12-31'),
        },
        select: { id: true },
      })
    ).id;

    // Lo de B lo agenda el admin, como hoy.
    claseDeB = (
      (await como('jefe').post('clases', clase(fichaB, '10:00', '11:00')))
        .body as { id: number }
    ).id;
    inscripcionEnB = (
      (
        await como('jefe').post(`clases/${claseDeB}/inscripciones`, {
          socioId,
        })
      ).body as { id: number }
    ).id;
    serieDeB = (
      (
        await como('jefe').post('clases/series', {
          ...serie(fichaB, '10:00', '11:00'),
          decisiones: {},
        })
      ).body as { id: number }
    ).id;
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  describe('lo de otro profesor (11 y 12)', () => {
    const OTRO: [string, (yo: string) => request.Test][] = [
      [
        'simular una clase de otro',
        (yo) =>
          como(yo).post('clases/simulacion', clase(fichaB, '13:00', '14:00')),
      ],
      [
        'agendarle una clase a otro',
        (yo) => como(yo).post('clases', clase(fichaB, '13:00', '14:00')),
      ],
      [
        'simular una serie de otro',
        (yo) =>
          como(yo).post(
            'clases/series/simulacion',
            serie(fichaB, '13:00', '14:00'),
          ),
      ],
      [
        'agendarle una serie a otro',
        (yo) =>
          como(yo).post('clases/series', {
            ...serie(fichaB, '13:00', '14:00'),
            decisiones: {},
          }),
      ],
      [
        'inscribir en su serie',
        (yo) =>
          como(yo).post(`clases/series/${serieDeB}/inscripciones`, { socioId }),
      ],
      [
        'cancelar su serie',
        (yo) =>
          como(yo).post(`clases/series/${serieDeB}/cancelacion`, {
            desde: '2041-10-15',
            motivo: 'No',
          }),
      ],
      [
        'sacar a alguien de su serie',
        (yo) =>
          como(yo).post(`clases/series/${serieDeB}/inscripciones/cancelacion`, {
            socioId,
          }),
      ],
      ['ver su clase', (yo) => como(yo).get(`clases/${claseDeB}`)],
      [
        'inscribir en su clase',
        (yo) =>
          como(yo).post(`clases/${claseDeB}/inscripciones`, {
            nombre: 'Ana',
            telefono: '56955556666',
          }),
      ],
      [
        'sacar a alguien de su clase',
        (yo) =>
          como(yo).post(
            `clases/${claseDeB}/inscripciones/${inscripcionEnB}/cancelacion`,
          ),
      ],
      [
        'cerrar su clase',
        (yo) =>
          como(yo).post(`clases/${claseDeB}/realizacion`, { asistieron: [] }),
      ],
      [
        'mover su clase',
        (yo) =>
          como(yo).patch(`clases/${claseDeB}`, {
            fecha: DIA,
            horaDesde: '15:00',
            horaHasta: '16:00',
          }),
      ],
      [
        'cancelar su clase',
        (yo) =>
          como(yo).post(`clases/${claseDeB}/cancelacion`, { motivo: 'No' }),
      ],
    ];

    it.each(OTRO)('%s responde 403 al profesor', async (_, pedir) => {
      await pedir('profe-a').expect(403);
    });

    it.each(OTRO)('%s responde 403 al gestor', async (_, pedir) => {
      await pedir('gestora').expect(403);
    });

    it('después de todo eso, lo de B sigue como estaba', async () => {
      expect(
        await prisma.clase.findUniqueOrThrow({
          where: { id: claseDeB },
          select: { estado: true, inicio: true },
        }),
      ).toMatchObject({ estado: EstadoClase.PROGRAMADA });
      expect(
        await prisma.inscripcionClase.findUniqueOrThrow({
          where: { id: inscripcionEnB },
          select: { estado: true },
        }),
      ).toEqual({ estado: 'INSCRITA' });
      expect(
        await prisma.clase.count({
          where: { serieId: serieDeB, estado: EstadoClase.PROGRAMADA },
        }),
      ).toBeGreaterThan(0);
    });

    it('una clase que no existe le responde 404, no 403', async () => {
      await como('profe-a').get('clases/999999999').expect(404);
    });
  });

  describe('lo suyo', () => {
    it('agenda una clase a su nombre en una hora libre (12)', async () => {
      const respuesta = await como('profe-a')
        .post('clases', clase(fichaA, '12:00', '13:00'))
        .expect(201);

      expect(
        await prisma.clase.findUniqueOrThrow({
          where: { id: (respuesta.body as { id: number }).id },
          select: { profesorId: true },
        }),
      ).toEqual({ profesorId: fichaA });
    });

    it('la agenda del día le muestra solo las suyas; al admin y al gestor, todas (11)', async () => {
      const profesores = async (quien: string) =>
        (
          (await como(quien).get(`clases?fecha=${DIA}`).expect(200)).body as {
            profesor: string;
          }[]
        ).map((fila) => fila.profesor);

      expect(await profesores('profe-a')).toEqual(['Profe A T218']);
      expect(await profesores('jefe')).toEqual(
        expect.arrayContaining(['Profe A T218', 'Profe B T218']),
      );
      expect(await profesores('gestora')).toEqual(
        expect.arrayContaining(['Profe A T218', 'Profe B T218']),
      );
    });

    it('inscribe a un socio y a un alumno de afuera, y cierra la clase con la lista (15)', async () => {
      const suya = (
        (await como('profe-a').post('clases', clase(fichaA, '16:00', '17:00')))
          .body as { id: number }
      ).id;

      const alumno = (
        (
          await como('profe-a')
            .post(`clases/${suya}/inscripciones`, {
              nombre: 'Beto Afuera',
              telefono: '56955556666',
            })
            .expect(201)
        ).body as { id: number }
      ).id;
      await como('profe-a')
        .post(`clases/${suya}/inscripciones`, { socioId })
        .expect(201);
      await como('profe-a').get(`clases/${suya}`).expect(200);

      await como('profe-a')
        .post(`clases/${suya}/realizacion`, { asistieron: [alumno] })
        .expect(200);
    });

    it('agenda una serie a su nombre (12)', async () => {
      await como('profe-a')
        .post('clases/series', {
          ...serie(fichaA, '18:00', '19:00'),
          decisiones: {},
        })
        .expect(201);
    });
  });

  describe('los socios para inscribir (15)', () => {
    it('trae id, nombre y número de los socios activos, sin correo ni teléfono', async () => {
      const respuesta = await como('profe-a').get('clases/socios').expect(200);
      const socios = respuesta.body as Record<string, unknown>[];
      const suya = socios.find((fila) => fila.id === socioId);

      expect(suya).toEqual({
        id: socioId,
        nombre: 'socia T218',
        numeroSocio: 'T218-1',
      });
      expect(JSON.stringify(socios)).not.toContain('@');
    });

    it('el admin también la usa; al gestor y al socio les responde 403', async () => {
      await como('jefe').get('clases/socios').expect(200);
      await como('gestora').get('clases/socios').expect(403);
      await como('socia').get('clases/socios').expect(403);
    });
  });

  describe('lo que no es de Clases (16)', () => {
    it('el padrón de socios y las fichas de profesores le responden 403', async () => {
      await como('profe-a').get('socios').expect(403);
      await como('profe-a').get('profesores').expect(403);
    });

    it('a un socio sin tipos del panel, la agenda de clases le responde 403', async () => {
      await como('socia').get(`clases?fecha=${DIA}`).expect(403);
    });
  });

  describe('solo en horas libres (T219, criterios 13 y 14)', () => {
    let folio = 0;
    /** Una reserva confirmada de un visitante sobre la cancha de la prueba. */
    const reserva = async (fecha: string, desde: string, hasta: string) =>
      (
        await prisma.reserva.create({
          data: {
            folio: `T219${String((folio += 1)).padStart(3, '0')}`,
            canchaId,
            inicio: instanteEnElClub(fecha, desde),
            fin: instanteEnElClub(fecha, hasta),
            estado: EstadoReserva.CONFIRMADA,
            nombre: 'Visitante T219',
            email: `visitante${DOMINIO}`,
            telefono: '56900000000',
          },
          select: { id: true },
        })
      ).id;

    const estadoDe = async (id: number) =>
      (
        await prisma.reserva.findUniqueOrThrow({
          where: { id },
          select: { estado: true },
        })
      ).estado;

    it('agendar sobre una hora reservada responde 409 HORAS_TOMADAS y no cancela nada (13)', async () => {
      const tomada = await reserva(DIA, '14:00', '15:00');
      const antes = await prisma.clase.count({ where: { canchaId } });

      const respuesta = await como('profe-a')
        .post('clases', clase(fichaA, '14:00', '15:00'))
        .expect(409);

      expect(respuesta.body).toMatchObject({
        motivo: 'HORAS_TOMADAS',
        message:
          'Esta hora tiene reservas. Para agendar encima, habla con administración.',
      });
      expect(await estadoDe(tomada)).toBe(EstadoReserva.CONFIRMADA);
      expect(await prisma.clase.count({ where: { canchaId } })).toBe(antes);
    });

    it('mover su clase sobre una hora reservada responde 409 y la clase queda donde estaba (13)', async () => {
      const tomada = await reserva(DIA, '20:00', '21:00');
      const suya = (
        (
          await como('profe-a')
            .post('clases', clase(fichaA, '09:00', '10:00'))
            .expect(201)
        ).body as { id: number }
      ).id;

      await como('profe-a')
        .patch(`clases/${suya}`, {
          fecha: DIA,
          horaDesde: '20:00',
          horaHasta: '21:00',
        })
        .expect(409);

      expect(await estadoDe(tomada)).toBe(EstadoReserva.CONFIRMADA);
      expect(
        await prisma.clase.findUniqueOrThrow({
          where: { id: suya },
          select: { inicio: true },
        }),
      ).toEqual({ inicio: instanteEnElClub(DIA, '09:00') });
    });

    it('la simulación le dice que hay reservas, pero no de quién: ni nombre ni correo', async () => {
      await reserva(DIA, '17:00', '18:00');

      const body: unknown = (
        await como('profe-a')
          .post('clases/simulacion', clase(fichaA, '17:00', '18:00'))
          .expect(200)
      ).body;
      const afectadas = (body as { afectadas: Record<string, unknown>[] })
        .afectadas;

      expect(afectadas).toHaveLength(1);
      expect(Object.keys(afectadas[0]).sort()).toEqual(['fin', 'id', 'inicio']);
    });

    describe('en una serie (14)', () => {
      const SERIE = () => serie(fichaA, '20:00', '21:00');
      let tomada: number;

      beforeAll(async () => {
        tomada = await reserva('2041-10-23', '20:00', '21:00');
      });

      it('la simulación le dice qué fecha tiene reservas', async () => {
        const body: unknown = (
          await como('profe-a')
            .post('clases/series/simulacion', SERIE())
            .expect(200)
        ).body;
        const fechas = (
          body as { fechas: { fecha: string; afectadas: unknown[] }[] }
        ).fechas;

        const afectadas = fechas.find((f) => f.fecha === '2041-10-23')
          ?.afectadas as Record<string, unknown>[];
        expect(afectadas).toHaveLength(1);
        // Que hay una reserva, sí; de quién, no: el profesor no ve el padrón.
        expect(Object.keys(afectadas[0]).sort()).toEqual([
          'fin',
          'id',
          'inicio',
        ]);
      });

      it('"cancelar" desde un profesor responde 403 y no agenda ninguna fecha', async () => {
        const antes = await prisma.serieDeClases.count();

        await como('profe-a')
          .post('clases/series', {
            ...SERIE(),
            decisiones: { '2041-10-23': 'cancelar' },
          })
          .expect(403);

        expect(await prisma.serieDeClases.count()).toBe(antes);
        expect(await estadoDe(tomada)).toBe(EstadoReserva.CONFIRMADA);
      });

      it('saltándola, se agendan las demás y la reserva sigue en pie', async () => {
        const body: unknown = (
          await como('profe-a')
            .post('clases/series', {
              ...SERIE(),
              decisiones: { '2041-10-23': 'saltar' },
            })
            .expect(201)
        ).body;

        expect(body).toMatchObject({
          saltadas: ['2041-10-23'],
          canceladas: [],
        });
        expect(
          (body as { clases: { fecha: string }[] }).clases.map((c) => c.fecha),
        ).toEqual(['2041-10-16', '2041-10-30']);
        expect(await estadoDe(tomada)).toBe(EstadoReserva.CONFIRMADA);
      });
    });

    it('el admin sobre una hora reservada la sigue cancelando (criterio 2)', async () => {
      const tomada = await reserva(DIA, '08:00', '09:00');

      const body: unknown = (
        await como('jefe')
          .post('clases', clase(fichaA, '08:00', '09:00'))
          .expect(201)
      ).body;

      expect((body as { canceladas: unknown[] }).canceladas).toHaveLength(1);
      expect(await estadoDe(tomada)).toBe(EstadoReserva.CANCELADA);
    });
  });
});
