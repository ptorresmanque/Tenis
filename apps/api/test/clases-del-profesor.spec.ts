import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  EstadoClase,
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
});
