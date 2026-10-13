import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T196: para qué tours suma un torneo (`SPEC-torneos.md` § Tours del torneo, U1–U5).
 *
 * Cada asociación dice **con qué nivel**, y el nivel trae su temporada. Las reglas que
 * cuida este archivo: al menos un tour desde que se crea, una vez por tour, y el nivel
 * tiene que ser de ese tour.
 */
describe('Torneos: los tours para los que suman', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;

  const DOMINIO = '@torneos-tours.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Tour del torneo de prueba';
  const TORNEO = 'Copa con tours de prueba';

  interface TourDelTorneo {
    tourId: number;
    tour: string;
    temporadaId: number;
    temporada: string;
    nivelId: number;
    nivel: string;
  }

  interface ConTours {
    id: number;
    nombre: string;
    tours: TourDelTorneo[];
  }

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];
  const comoAdmin = (
    metodo: 'get' | 'post' | 'patch' | 'delete',
    ruta: string,
  ) =>
    request(servidor())[metodo](`/api/admin${ruta}`).set('Cookie', cookieAdmin);

  const puntos = (campeon: number) => ({
    puntosCampeon: campeon,
    puntosFinalista: campeon * 0.6,
    puntosSemifinal: campeon * 0.36,
    puntosCuartos: campeon * 0.18,
    puntosOctavos: 0,
    puntosDieciseisavos: 0,
    puntosTreintaidosavos: 0,
  });

  /** Un tour con la temporada 2027 y sus niveles 500 y 250. */
  const unTour = async (sufijo: string) => {
    const tour = await prisma.tour.create({
      data: { nombre: `${MARCA} ${sufijo}`, descripcion: '' },
    });
    const temporada = await prisma.temporadaTour.create({
      data: {
        tourId: tour.id,
        nombre: '2027',
        fechaInicio: new Date('2027-03-01T00:00:00.000Z'),
        fechaFin: new Date('2027-12-15T00:00:00.000Z'),
        niveles: {
          create: [
            { nombre: '500', ...puntos(500) },
            { nombre: '250', ...puntos(250) },
          ],
        },
      },
      include: { niveles: { orderBy: { puntosCampeon: 'desc' } } },
    });

    return {
      tourId: tour.id,
      temporadaId: temporada.id,
      nivel500: temporada.niveles[0].id,
      nivel250: temporada.niveles[1].id,
    };
  };

  const elTorneo = (tours: unknown, nombre = `${TORNEO} ${Date.now()}`) => ({
    nombre,
    fechaInicio: '2027-04-10',
    fechaFin: '2027-04-11',
    cierreInscripcion: '2027-04-01',
    tours,
  });

  const crear = (tours: unknown, nombre?: string) =>
    comoAdmin('post', '/torneos').send(elTorneo(tours, nombre));

  const asociacionesDe = (torneoId: number) =>
    prisma.torneoTour.findMany({
      where: { torneoId },
      orderBy: { tourId: 'asc' },
      select: { tourId: true, nivelId: true },
    });

  const limpiar = async () => {
    // Primero los torneos: sus asociaciones caen con ellos y liberan los Restrict.
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: TORNEO } },
    });
    await prisma.tour.deleteMany({ where: { nombre: { startsWith: MARCA } } });
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);

    for (const [sufijo, esAdmin] of [
      ['admin', true],
      ['socio', false],
    ] as const) {
      await prisma.usuario.deleteMany({
        where: { email: `${sufijo}${DOMINIO}` },
      });
      await prisma.usuario.create({
        data: {
          email: `${sufijo}${DOMINIO}`,
          passwordHash: await hashear(CONTRASENA),
          nombre: sufijo,
          apellido: 'Torneos con tours',
          esAdmin,
        },
      });
    }

    const entrar = async (sufijo: string) => {
      const respuesta = await request(servidor())
        .post('/api/auth/login')
        .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA })
        .expect(204);

      return (respuesta.headers['set-cookie'] as unknown as string[])[0].split(
        ';',
      )[0];
    };

    cookieAdmin = await entrar('admin');
    cookieSocio = await entrar('socio');
  });

  beforeEach(limpiar);

  afterAll(async () => {
    await limpiar();
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  describe('al crear el torneo', () => {
    it('**sin tours responde 400 y no deja fila** (U1)', async () => {
      const nombre = `${TORNEO} sin tours`;

      await comoAdmin('post', '/torneos')
        .send({ ...elTorneo(undefined, nombre), tours: undefined })
        .expect(400);
      await crear([], nombre).expect(400);

      expect(await prisma.torneo.count({ where: { nombre } })).toBe(0);
    });

    it('**con dos tours nace con las dos asociaciones** (U2)', async () => {
      const fedal = await unTour('FEDAL');
      const senior = await unTour('Senior');

      const torneo = (
        await crear([
          { tourId: fedal.tourId, nivelId: fedal.nivel500 },
          { tourId: senior.tourId, nivelId: senior.nivel250 },
        ]).expect(201)
      ).body as { id: number };

      expect(await asociacionesDe(torneo.id)).toEqual([
        { tourId: fedal.tourId, nivelId: fedal.nivel500 },
        { tourId: senior.tourId, nivelId: senior.nivel250 },
      ]);
    });

    it('**el mismo tour dos veces lo rechaza la base**, sin dejar el torneo a medias (U2)', async () => {
      const fedal = await unTour('FEDAL');
      const nombre = `${TORNEO} repetido`;

      await crear(
        [
          { tourId: fedal.tourId, nivelId: fedal.nivel500 },
          { tourId: fedal.tourId, nivelId: fedal.nivel250 },
        ],
        nombre,
      ).expect(409);

      expect(await prisma.torneo.count({ where: { nombre } })).toBe(0);
    });

    it('**un nivel de otro tour se rechaza** antes de escribir (U3)', async () => {
      const fedal = await unTour('FEDAL');
      const senior = await unTour('Senior');
      const nombre = `${TORNEO} cruzado`;

      const respuesta = await crear(
        [{ tourId: fedal.tourId, nivelId: senior.nivel500 }],
        nombre,
      ).expect(400);

      expect((respuesta.body as { message: string }).message).toContain(
        'nivel',
      );
      expect(await prisma.torneo.count({ where: { nombre } })).toBe(0);
    });

    it('una asociación mal escrita se rechaza con 400', async () => {
      await crear([{ tourId: 'uno', nivelId: 1 }]).expect(400);
      await crear([{ tourId: 1 }]).expect(400);
      await crear({ tourId: 1, nivelId: 1 }).expect(400);
    });
  });

  describe('en un torneo que ya existe', () => {
    const unTorneoCon = async (tourId: number, nivelId: number) =>
      (
        (await crear([{ tourId, nivelId }]).expect(201)).body as {
          id: number;
        }
      ).id;

    it('se agrega un segundo tour', async () => {
      const fedal = await unTour('FEDAL');
      const senior = await unTour('Senior');
      const id = await unTorneoCon(fedal.tourId, fedal.nivel500);

      await comoAdmin('post', `/torneos/${id}/tours`)
        .send({ tourId: senior.tourId, nivelId: senior.nivel250 })
        .expect(201);

      expect(await asociacionesDe(id)).toHaveLength(2);
    });

    it('**el mismo tour otra vez se rechaza**: sumaría dos veces en la misma tabla (U2)', async () => {
      const fedal = await unTour('FEDAL');
      const id = await unTorneoCon(fedal.tourId, fedal.nivel500);

      await comoAdmin('post', `/torneos/${id}/tours`)
        .send({ tourId: fedal.tourId, nivelId: fedal.nivel250 })
        .expect(409);
    });

    it('**un nivel de otro tour se rechaza** al agregar y al cambiar (U3)', async () => {
      const fedal = await unTour('FEDAL');
      const senior = await unTour('Senior');
      const id = await unTorneoCon(fedal.tourId, fedal.nivel500);

      await comoAdmin('post', `/torneos/${id}/tours`)
        .send({ tourId: senior.tourId, nivelId: fedal.nivel250 })
        .expect(400);
      await comoAdmin('patch', `/torneos/${id}/tours/${fedal.tourId}`)
        .send({ nivelId: senior.nivel500 })
        .expect(400);

      expect(await asociacionesDe(id)).toEqual([
        { tourId: fedal.tourId, nivelId: fedal.nivel500 },
      ]);
    });

    it('**se cambia el nivel**, también el del único tour', async () => {
      const fedal = await unTour('FEDAL');
      const id = await unTorneoCon(fedal.tourId, fedal.nivel500);

      await comoAdmin('patch', `/torneos/${id}/tours/${fedal.tourId}`)
        .send({ nivelId: fedal.nivel250 })
        .expect(200);

      expect(await asociacionesDe(id)).toEqual([
        { tourId: fedal.tourId, nivelId: fedal.nivel250 },
      ]);
    });

    it('**quitar una de dos se puede; quitar la última, no** (U4)', async () => {
      const fedal = await unTour('FEDAL');
      const senior = await unTour('Senior');
      const id = await unTorneoCon(fedal.tourId, fedal.nivel500);
      await comoAdmin('post', `/torneos/${id}/tours`)
        .send({ tourId: senior.tourId, nivelId: senior.nivel250 })
        .expect(201);

      await comoAdmin('delete', `/torneos/${id}/tours/${fedal.tourId}`).expect(
        204,
      );
      const rechazo = await comoAdmin(
        'delete',
        `/torneos/${id}/tours/${senior.tourId}`,
      ).expect(409);

      expect((rechazo.body as { message: string }).message).toContain('único');
      expect(await asociacionesDe(id)).toEqual([
        { tourId: senior.tourId, nivelId: senior.nivel250 },
      ]);
    });

    it('lo que no existe responde 404', async () => {
      const fedal = await unTour('FEDAL');
      const senior = await unTour('Senior');
      const id = await unTorneoCon(fedal.tourId, fedal.nivel500);

      await comoAdmin('post', '/torneos/999999/tours')
        .send({ tourId: fedal.tourId, nivelId: fedal.nivel250 })
        .expect(404);
      await comoAdmin('patch', `/torneos/${id}/tours/${senior.tourId}`)
        .send({ nivelId: senior.nivel250 })
        .expect(404);
      await comoAdmin('delete', `/torneos/${id}/tours/${senior.tourId}`).expect(
        404,
      );
    });

    it('**solo el admin** asocia', async () => {
      const fedal = await unTour('FEDAL');
      const id = await unTorneoCon(fedal.tourId, fedal.nivel500);

      await request(servidor())
        .delete(`/api/admin/torneos/${id}/tours/${fedal.tourId}`)
        .set('Cookie', cookieSocio)
        .expect(403);
    });
  });

  describe('al leer', () => {
    const esperado = (
      datos: Awaited<ReturnType<typeof unTour>>,
      tour: string,
    ): TourDelTorneo => ({
      tourId: datos.tourId,
      tour: `${MARCA} ${tour}`,
      temporadaId: datos.temporadaId,
      temporada: '2027',
      nivelId: datos.nivel500,
      nivel: '500',
    });

    it('**el panel y el calendario público dicen para qué tours suma**, con temporada y nivel', async () => {
      const fedal = await unTour('FEDAL');
      const torneo = (
        await crear([{ tourId: fedal.tourId, nivelId: fedal.nivel500 }]).expect(
          201,
        )
      ).body as { id: number };

      const panel = (await comoAdmin('get', '/torneos').expect(200))
        .body as ConTours[];
      const publico = (
        await request(servidor())
          .get('/api/torneos/publicos?anio=2027')
          .expect(200)
      ).body as ConTours[];

      for (const lista of [panel, publico]) {
        expect(lista.find((t) => t.id === torneo.id)?.tours).toEqual([
          esperado(fedal, 'FEDAL'),
        ]);
      }
    });

    it('**un torneo sin tour, de antes de la migración, sigue respondiendo** (U5)', async () => {
      const viejo = await prisma.torneo.create({
        data: {
          nombre: `${TORNEO} de antes`,
          fechaInicio: new Date('2027-05-10T00:00:00.000Z'),
          fechaFin: new Date('2027-05-11T00:00:00.000Z'),
          cierreInscripcion: new Date('2027-05-01T00:00:00.000Z'),
        },
      });

      const panel = (await comoAdmin('get', '/torneos').expect(200))
        .body as ConTours[];
      const publico = (
        await request(servidor())
          .get('/api/torneos/publicos?anio=2027')
          .expect(200)
      ).body as ConTours[];

      for (const lista of [panel, publico]) {
        expect(lista.find((t) => t.id === viejo.id)?.tours).toEqual([]);
      }
    });

    it('**`?temporada=` trae los torneos de esa temporada, de cualquier año** (T201)', async () => {
      // D13: un torneo de diciembre puede sumar a la temporada del año siguiente, así
      // que la página del tour no puede pedir el calendario de un año y filtrar. Los
      // casos están armados para que ningún año los separe solo.
      const fedal = await unTour('FEDAL');
      const senior = await unTour('Senior');
      const enDiciembre = {
        fechaInicio: '2026-12-05',
        fechaFin: '2026-12-06',
        cierreInscripcion: '2026-12-01',
      };
      const idDe = async (cuerpo: Record<string, unknown>) =>
        (
          (await comoAdmin('post', '/torneos').send(cuerpo).expect(201))
            .body as { id: number }
        ).id;

      const de2026 = await idDe({
        ...elTorneo([{ tourId: fedal.tourId, nivelId: fedal.nivel500 }]),
        ...enDiciembre,
      });
      const de2027 = await idDe(
        elTorneo([{ tourId: fedal.tourId, nivelId: fedal.nivel250 }]),
      );
      const deOtroTour = await idDe({
        ...elTorneo([{ tourId: senior.tourId, nivelId: senior.nivel500 }]),
        ...enDiciembre,
      });
      const cancelado = await idDe(
        elTorneo([{ tourId: fedal.tourId, nivelId: fedal.nivel500 }]),
      );
      await prisma.torneo.update({
        where: { id: cancelado },
        data: { estado: 'CANCELADO' },
      });

      const deLaTemporada = (
        await request(servidor())
          .get(`/api/torneos/publicos?temporada=${fedal.temporadaId}`)
          .expect(200)
      ).body as ConTours[];
      const ids = deLaTemporada.map((t) => t.id);

      expect(ids).toEqual(expect.arrayContaining([de2026, de2027]));
      expect(ids).not.toContain(deOtroTour);
      // Como en el calendario: un torneo que no se va a jugar no se muestra.
      expect(ids).not.toContain(cancelado);
    });
  });
});
