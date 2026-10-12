import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { sembrarCategoriasDeJuego } from '../src/arranque';
import { EstadoTorneo } from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * El ranking de torneos: una tabla por tour, temporada y categoría de juego (T54, rehecho
 * en T198; `SPEC-ranking.md` § Ranking de torneos).
 *
 * Se calcula al consultar y no se guarda, así que lo que hay que probar no es que un
 * proceso corra: es que **la tabla dice la verdad en el momento en que alguien la mira**.
 * Corregir un resultado o editar la tabla de un nivel se ve en la consulta siguiente sin
 * que nadie recalcule nada.
 */
describe('GET /api/ranking/torneos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let jugadores: number[];

  const DOMINIO = '@ranking.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Copa del ranking';
  const TOUR = 'Tour del ranking';
  const APELLIDO = 'DeLaTabla';
  /**
   * Uno por jugador: el teléfono es único. Se siembran ya normalizados porque este
   * archivo escribe con Prisma, y la comprobación de fuga busca **esa misma forma**.
   */
  const GUARDADOS = [
    '56977770001',
    '56977770002',
    '56977770003',
    '56977770004',
    '56977770005',
    '56977770006',
    '56977770007',
    '56977770008',
  ];

  interface Posicion {
    puesto: number;
    jugadorId: number;
    nombre: string;
    puntos: number;
    torneos: number;
  }

  interface Tabla {
    temporada: {
      id: number;
      nombre: string;
      fechaInicio: string;
      fechaFin: string;
    };
    categorias: { id: number; nombre: string }[];
    categoriaId: number | null;
    torneos: {
      /** El del **cuadro**; el del torneo va aparte. */
      id: number;
      torneoId: number;
      nombre: string;
      categoria: string;
      nivel: string;
      fechaFin: string;
    }[];
    posiciones: Posicion[];
  }

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const tabla = async (
    temporadaId: number,
    categoriaId?: number,
  ): Promise<Tabla> => {
    const consulta = new URLSearchParams({ temporada: String(temporadaId) });
    if (categoriaId !== undefined) {
      consulta.set('categoria', String(categoriaId));
    }

    return (
      await request(servidor())
        .get(`/api/ranking/torneos?${consulta.toString()}`)
        .expect(200)
    ).body as Tabla;
  };

  const puntosDe = (respuesta: Tabla, jugadorId: number) =>
    respuesta.posiciones.find((fila) => fila.jugadorId === jugadorId)?.puntos;

  const categoria = async (nombre: string) =>
    (
      await prisma.categoriaJuego.findUniqueOrThrow({
        where: { nombre },
        select: { id: true },
      })
    ).id;

  /** Una escala con todas sus filas: la primera ronda también suma (D7). */
  const escala = (campeon: number) => ({
    puntosCampeon: campeon,
    puntosFinalista: campeon * 0.6,
    puntosSemifinal: campeon * 0.36,
    puntosCuartos: campeon * 0.18,
    puntosOctavos: 0,
    puntosDieciseisavos: 0,
    puntosTreintaidosavos: 0,
  });

  /**
   * Un tour con sus temporadas, y en cada una los niveles 500 y 250. Devuelve los ids
   * por temporada: `temporadas['2027'].nivel250`.
   */
  const unTour = async (sufijo: string, nombres = ['2027']) => {
    const tour = await prisma.tour.create({
      data: { nombre: `${TOUR} ${sufijo}`, descripcion: '' },
    });
    const temporadas: Record<
      string,
      { id: number; nivel500: number; nivel250: number }
    > = {};

    for (const nombre of nombres) {
      const temporada = await prisma.temporadaTour.create({
        data: {
          tourId: tour.id,
          nombre,
          fechaInicio: new Date(`${nombre}-03-01T00:00:00.000Z`),
          fechaFin: new Date(`${nombre}-12-15T00:00:00.000Z`),
          niveles: {
            create: [
              { nombre: '500', ...escala(500) },
              { nombre: '250', ...escala(250) },
            ],
          },
        },
        include: { niveles: { orderBy: { puntosCampeon: 'desc' } } },
      });

      temporadas[nombre] = {
        id: temporada.id,
        nivel500: temporada.niveles[0].id,
        nivel250: temporada.niveles[1].id,
      };
    }

    return { tourId: tour.id, temporadas };
  };

  /** El cuadro de cuatro de siempre: dos semifinales y la final. */
  const cuatro = (
    campeon: number,
    finalista: number,
    otros: [number, number],
  ) => [
    {
      ronda: 1,
      posicion: 1,
      jugadorAId: campeon,
      jugadorBId: otros[0],
      ganadorId: campeon,
    },
    {
      ronda: 1,
      posicion: 2,
      jugadorAId: finalista,
      jugadorBId: otros[1],
      ganadorId: finalista,
    },
    {
      ronda: 2,
      posicion: 1,
      jugadorAId: campeon,
      jugadorBId: finalista,
      ganadorId: campeon,
    },
  ];

  /**
   * Un torneo escrito directo en la base, con sus asociaciones a tours. Sus cuadros los
   * pone `unCuadro`. El camino largo —armar y cargar por el panel— tiene su propio test.
   */
  const unTorneo = async (
    tours: { tourId: number; nivelId: number }[],
    estado: EstadoTorneo = EstadoTorneo.FINALIZADO,
  ) =>
    (
      await prisma.torneo.create({
        data: {
          nombre: `${MARCA} ${Date.now()}-${Math.random()}`,
          fechaInicio: new Date('2027-05-01T00:00:00.000Z'),
          fechaFin: new Date('2027-05-03T00:00:00.000Z'),
          cierreInscripcion: new Date('2027-04-25T00:00:00.000Z'),
          estado,
          tours: { create: tours },
        },
        select: { id: true },
      })
    ).id;

  /**
   * Un cuadro de cuatro ya jugado. **Hasta T199 el cuadro todavía pide la categoría de
   * torneo** (A4), aunque el ranking ya no la lee: se le pone una cualquiera.
   */
  const unCuadro = async (
    torneoId: number,
    categoriaJuego: string,
    campeon: number,
    finalista: number,
    otros: [number, number],
  ) => {
    const valor = await prisma.categoriaTorneo.create({
      data: {
        nombre: `CatRank ${Date.now()}-${Math.random()}`,
        puntosCampeon: 1,
      },
    });
    const cuadro = await prisma.torneoCategoria.create({
      data: {
        torneoId,
        categoriaId: valor.id,
        categoriaJuegoId: await categoria(categoriaJuego),
        cupo: 4,
        semillaSorteo: 1,
      },
      select: { id: true },
    });

    // Los partidos aparte y no anidados: `Partido` tiene dos claves obligatorias,
    // `torneoId` y `torneoCategoriaId`, y un `create` anidado solo llena una.
    await prisma.partido.createMany({
      data: cuatro(campeon, finalista, otros).map((partido) => ({
        ...partido,
        torneoId,
        torneoCategoriaId: cuadro.id,
      })),
    });

    return cuadro.id;
  };

  const limpiar = async () => {
    // Acotado a lo de este archivo: Jest corre los archivos en paralelo. Los torneos
    // primero, porque sus asociaciones frenan el borrado de los tours.
    const mios = { torneo: { nombre: { startsWith: MARCA } } };
    await prisma.partido.deleteMany({ where: mios });
    await prisma.inscripcionTorneo.deleteMany({ where: mios });
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.tour.deleteMany({ where: { nombre: { startsWith: TOUR } } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatRank' } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
    await sembrarCategoriasDeJuego(prisma);

    await prisma.usuario.deleteMany({ where: { email: `jefe${DOMINIO}` } });
    await prisma.usuario.create({
      data: {
        email: `jefe${DOMINIO}`,
        passwordHash: await hashear(CONTRASENA),
        nombre: 'Jefe',
        apellido: APELLIDO,
        esAdmin: true,
      },
    });
    const login = await request(servidor())
      .post('/api/auth/login')
      .send({ email: `jefe${DOMINIO}`, contrasena: CONTRASENA })
      .expect(204);
    cookieAdmin = (login.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  });

  afterAll(async () => {
    await limpiar();
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();

    // Todos llevan teléfono: es lo que la tabla no puede publicar.
    jugadores = [];
    for (const [i, nombre] of [
      'Ana',
      'Beto',
      'Cata',
      'Dani',
      'Elena',
      'Fabio',
      'Gina',
      'Hugo',
    ].entries()) {
      const jugador = await prisma.jugador.create({
        data: { nombre, apellido: APELLIDO, telefono: GUARDADOS[i] },
        select: { id: true },
      });
      jugadores.push(jugador.id);
    }
  });

  /** Un torneo de 4ª en el nivel 250 de la temporada 2027 de un tour. */
  const elDeSiempre = async () => {
    const tour = await unTour('A');
    const temporada = tour.temporadas['2027'];
    const torneoId = await unTorneo([
      { tourId: tour.tourId, nivelId: temporada.nivel250 },
    ]);
    const cuadroId = await unCuadro(
      torneoId,
      '4ª',
      jugadores[0],
      jugadores[1],
      [jugadores[2], jugadores[3]],
    );

    return { tour, temporada, torneoId, cuadroId };
  };

  it('**la tabla se ve sin cuenta**, con la escala del nivel y la primera ronda según la tabla (D7)', async () => {
    const { temporada } = await elDeSiempre();

    const { posiciones } = await tabla(temporada.id, await categoria('4ª'));

    expect(
      posiciones.map((fila) => [fila.puesto, fila.nombre, fila.puntos]),
    ).toEqual([
      [1, `Ana ${APELLIDO}`, 250],
      [2, `Beto ${APELLIDO}`, 150],
      // Perdieron entrando, en un cuadro de 4: la fila de semifinal.
      [3, `Cata ${APELLIDO}`, 90],
      [3, `Dani ${APELLIDO}`, 90],
    ]);
  });

  it('**con la fila en cero, quien perdió entrando no aparece**', async () => {
    const { temporada } = await elDeSiempre();
    await prisma.nivelTemporada.update({
      where: { id: temporada.nivel250 },
      data: { puntosSemifinal: 0 },
    });

    const { posiciones } = await tabla(temporada.id, await categoria('4ª'));

    expect(posiciones.map((fila) => fila.jugadorId)).toEqual([
      jugadores[0],
      jugadores[1],
    ]);
  });

  it('**el campeón queda arriba en cuanto se carga la final, sin recalcular nada**', async () => {
    // Por el camino largo: el admin arma el cuadro y carga los resultados por el
    // panel. Es el único lugar donde se comprueba que el ranking lee lo que el panel
    // escribió.
    const tour = await unTour('A');
    const temporada = tour.temporadas['2027'];
    const torneoId = await unTorneo(
      [{ tourId: tour.tourId, nivelId: temporada.nivel250 }],
      EstadoTorneo.INSCRIPCION,
    );
    const valor = await prisma.categoriaTorneo.create({
      data: { nombre: `CatRank ${Date.now()}`, puntosCampeon: 1 },
    });
    const cuadroId = (
      await prisma.torneoCategoria.create({
        data: {
          torneoId,
          categoriaId: valor.id,
          categoriaJuegoId: await categoria('4ª'),
          cupo: 4,
        },
      })
    ).id;

    for (const jugadorId of jugadores.slice(0, 4)) {
      await request(servidor())
        .post(`/api/admin/cuadros/${cuadroId}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .send({ jugadorId })
        .expect(201);
    }
    await request(servidor())
      .post(`/api/admin/cuadros/${cuadroId}/armar`)
      .set('Cookie', cookieAdmin)
      .expect(201);

    // Todavía no hay resultados: el torneo no terminó y nadie suma.
    expect((await tabla(temporada.id)).posiciones).toHaveLength(0);

    const partidos = async () =>
      (
        (
          await request(servidor())
            .get(`/api/admin/cuadros/${cuadroId}`)
            .set('Cookie', cookieAdmin)
            .expect(200)
        ).body as {
          partidos: { id: number; ronda: number; jugadorAId: number }[];
        }
      ).partidos;
    const cargar = (partido: { id: number; jugadorAId: number }) =>
      request(servidor())
        .post(`/api/admin/torneos/${torneoId}/partidos/${partido.id}/resultado`)
        .set('Cookie', cookieAdmin)
        .send({ ganadorId: partido.jugadorAId, marcador: '6-4 6-2' })
        .expect(200);

    for (const semi of (await partidos()).filter((p) => p.ronda === 1)) {
      await cargar(semi);
    }
    const final = (await partidos()).find((p) => p.ronda === 2)!;
    await cargar(final);

    const { posiciones } = await tabla(temporada.id);

    expect(posiciones[0]).toMatchObject({
      jugadorId: final.jugadorAId,
      puntos: 250,
      puesto: 1,
    });
    expect(posiciones.map((fila) => fila.puntos)).toEqual([250, 150, 90, 90]);
  });

  it('**un torneo que es 500 en un tour y 250 en otro da 500 y 250 al mismo campeón**', async () => {
    const fedal = await unTour('FEDAL');
    const senior = await unTour('Senior');
    const torneoId = await unTorneo([
      { tourId: fedal.tourId, nivelId: fedal.temporadas['2027'].nivel500 },
      { tourId: senior.tourId, nivelId: senior.temporadas['2027'].nivel250 },
    ]);
    await unCuadro(torneoId, '4ª', jugadores[0], jugadores[1], [
      jugadores[2],
      jugadores[3],
    ]);
    const cuarta = await categoria('4ª');

    const enFedal = await tabla(fedal.temporadas['2027'].id, cuarta);
    const enSenior = await tabla(senior.temporadas['2027'].id, cuarta);

    expect(puntosDe(enFedal, jugadores[0])).toBe(500);
    expect(puntosDe(enSenior, jugadores[0])).toBe(250);
  });

  it('**4ª y Honor van a tablas distintas**, y sin categoría se sirve la más alta', async () => {
    const tour = await unTour('A');
    const temporada = tour.temporadas['2027'];
    const torneoId = await unTorneo([
      { tourId: tour.tourId, nivelId: temporada.nivel250 },
    ]);
    await unCuadro(torneoId, 'Honor', jugadores[0], jugadores[1], [
      jugadores[2],
      jugadores[3],
    ]);
    await unCuadro(torneoId, '4ª', jugadores[4], jugadores[5], [
      jugadores[6],
      jugadores[7],
    ]);
    const honor = await categoria('Honor');
    const cuarta = await categoria('4ª');

    const deHonor = await tabla(temporada.id, honor);
    const deCuarta = await tabla(temporada.id, cuarta);
    const porOmision = await tabla(temporada.id);

    expect(deHonor.posiciones.map((fila) => fila.jugadorId)).not.toContain(
      jugadores[4],
    );
    expect(puntosDe(deCuarta, jugadores[4])).toBe(250);
    expect(puntosDe(deCuarta, jugadores[0])).toBeUndefined();
    // Las que tienen filas, de la más alta a la más baja: llenan el selector.
    expect(deHonor.categorias).toEqual([
      { id: honor, nombre: 'Honor' },
      { id: cuarta, nombre: '4ª' },
    ]);
    expect(porOmision.categoriaId).toBe(honor);
    expect(puntosDe(porOmision, jugadores[0])).toBe(250);
  });

  it('**un torneo de 2027 no suma en 2028**: cada temporada empieza de cero', async () => {
    const tour = await unTour('A', ['2027', '2028']);
    const torneoId = await unTorneo([
      { tourId: tour.tourId, nivelId: tour.temporadas['2027'].nivel250 },
    ]);
    await unCuadro(torneoId, '4ª', jugadores[0], jugadores[1], [
      jugadores[2],
      jugadores[3],
    ]);

    const de2028 = await tabla(tour.temporadas['2028'].id);

    expect(de2028.posiciones).toEqual([]);
    expect(de2028.categorias).toEqual([]);
    expect((await tabla(tour.temporadas['2027'].id)).posiciones).toHaveLength(
      4,
    );
  });

  it('un torneo que no terminó, o que se canceló, no reparte puntos', async () => {
    const tour = await unTour('A');
    const temporada = tour.temporadas['2027'];

    for (const estado of [EstadoTorneo.EN_CURSO, EstadoTorneo.CANCELADO]) {
      const torneoId = await unTorneo(
        [{ tourId: tour.tourId, nivelId: temporada.nivel250 }],
        estado,
      );
      await unCuadro(torneoId, '4ª', jugadores[0], jugadores[1], [
        jugadores[2],
        jugadores[3],
      ]);
    }

    expect((await tabla(temporada.id)).posiciones).toEqual([]);
  });

  it('**corregir una semifinal cambia la tabla en la consulta siguiente**', async () => {
    const { temporada, torneoId } = await elDeSiempre();
    const cuarta = await categoria('4ª');
    expect(puntosDe(await tabla(temporada.id, cuarta), jugadores[1])).toBe(150);

    // La semifinal la había ganado Beto; en realidad la ganó Dani. Corregirla deshace
    // la final, y el torneo deja de estar terminado: sale de la tabla.
    const semi = await prisma.partido.findFirstOrThrow({
      where: { torneoId, ronda: 1, posicion: 2 },
      select: { id: true },
    });
    await request(servidor())
      .post(`/api/admin/torneos/${torneoId}/partidos/${semi.id}/resultado`)
      .set('Cookie', cookieAdmin)
      .send({ ganadorId: jugadores[3] })
      .expect(200);

    expect((await tabla(temporada.id, cuarta)).posiciones).toEqual([]);

    // Se vuelve a jugar la final, y Dani es el finalista.
    const final = await prisma.partido.findFirstOrThrow({
      where: { torneoId, ronda: 2 },
      select: { id: true },
    });
    await request(servidor())
      .post(`/api/admin/torneos/${torneoId}/partidos/${final.id}/resultado`)
      .set('Cookie', cookieAdmin)
      .send({ ganadorId: jugadores[0] })
      .expect(200);

    const corregida = await tabla(temporada.id, cuarta);
    expect(puntosDe(corregida, jugadores[3])).toBe(150);
    expect(puntosDe(corregida, jugadores[1])).toBe(90);
  });

  it('**editar la tabla del nivel cambia la consulta siguiente**', async () => {
    const { temporada } = await elDeSiempre();

    await request(servidor())
      .patch(`/api/admin/niveles/${temporada.nivel250}`)
      .set('Cookie', cookieAdmin)
      .send({
        tabla: {
          campeon: 300,
          finalista: 180,
          semifinal: 0,
          cuartos: 0,
          octavos: 0,
          dieciseisavos: 0,
          treintaidosavos: 0,
        },
      })
      .expect(200);

    const { posiciones } = await tabla(temporada.id);

    expect(posiciones.map((fila) => fila.puntos)).toEqual([300, 180]);
  });

  it('**dice qué temporada es y qué cuadros cuenta**, cada uno con su nivel', async () => {
    const { temporada, torneoId, cuadroId } = await elDeSiempre();

    const respuesta = await tabla(temporada.id);

    expect(respuesta.temporada).toEqual({
      id: temporada.id,
      nombre: '2027',
      fechaInicio: '2027-03-01',
      fechaFin: '2027-12-15',
    });
    expect(respuesta.torneos).toEqual([
      {
        id: cuadroId,
        torneoId,
        nombre: expect.stringContaining(MARCA) as string,
        categoria: '4ª',
        nivel: '250',
        fechaFin: '2027-05-03',
      },
    ]);
  });

  it('**la tabla no publica el teléfono de nadie**', async () => {
    // Sobre el JSON entero: un campo nuevo que lo filtre entra sin que nadie se
    // acuerde de actualizar este test.
    const { temporada } = await elDeSiempre();

    const crudo = JSON.stringify(await tabla(temporada.id));

    for (const guardado of GUARDADOS) expect(crudo).not.toContain(guardado);
    expect(crudo).not.toContain('telefono');
  });

  it('sin torneos terminados la tabla viene vacía, no rota', async () => {
    const tour = await unTour('A');

    const respuesta = await tabla(tour.temporadas['2027'].id);

    expect(respuesta).toMatchObject({
      categorias: [],
      categoriaId: null,
      torneos: [],
      posiciones: [],
    });
  });

  it('sin temporada responde 400; una que no existe, 404', async () => {
    await request(servidor()).get('/api/ranking/torneos').expect(400);
    await request(servidor())
      .get('/api/ranking/torneos?temporada=uno')
      .expect(400);
    await request(servidor())
      .get('/api/ranking/torneos?temporada=999999')
      .expect(404);
  });
});
