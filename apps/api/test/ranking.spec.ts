import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hoyEnElClub } from '../src/comun/tiempo';
import { EstadoTorneo } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T54: el ranking de torneos.
 *
 * Se calcula al consultar y no se guarda, así que lo que hay que probar acá no es que
 * un proceso corra: es que **la tabla dice la verdad en el momento en que alguien la
 * mira**. Un torneo que caducó deja de sumar solo, y corregir un resultado se ve en la
 * consulta siguiente sin que nadie recalcule nada.
 */
describe('GET /api/ranking/torneos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let jugadores: number[];

  const DOMINIO = '@ranking.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Copa del ranking';
  const APELLIDO = 'DeLaTabla';
  /**
   * Uno por jugador: desde T64 el teléfono es único, porque es la llave con que se
   * decide si dos inscripciones son la misma persona.
   *
   * Se siembran ya normalizados porque este archivo escribe con Prisma y no por la
   * API, que es la que normaliza. Y la comprobación de fuga busca **esa misma forma**:
   * buscar `+56 9 7777 0001` no encontraría nada ni aunque el número entero estuviera
   * saliendo publicado.
   */
  const GUARDADOS = [
    '56977770001',
    '56977770002',
    '56977770003',
    '56977770004',
    // Del quinto al octavo son para T70: un torneo con dos cuadros necesita ocho
    // personas, cuatro por cada uno.
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
    desde: string;
    torneos: {
      /** El del **cuadro** desde T70; el del torneo va aparte. */
      id: number;
      torneoId: number;
      nombre: string;
      categoria: string;
      valor: string;
      fechaFin: string;
    }[];
    posiciones: Posicion[];
  }

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: APELLIDO,
      })
      .expect(201);

    await prisma.usuario.update({
      where: { email: `${sufijo}${DOMINIO}` },
      data: { esAdmin },
    });
  };

  const entrar = async (sufijo: string) => {
    // El login responde 204: no devuelve cuerpo, deja la cookie.
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA })
      .expect(204);

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  const tabla = async (): Promise<Tabla> => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/ranking/torneos')
      .expect(200);

    return respuesta.body as Tabla;
  };

  /**
   * Una fecha civil a tantos días de hoy, hacia atrás. Negativo es hacia adelante.
   *
   * Aritmética en milisegundos sobre medianoches UTC: las fechas civiles del club
   * viven en UTC, así que acá no hay horario de verano que corra un día.
   */
  const haceDias = (dias: number) =>
    new Date(hoyEnElClub().getTime() - dias * 24 * 60 * 60 * 1000);

  const hace = (semanas: number) => haceDias(semanas * 7);

  /**
   * Un torneo ya terminado, escrito directo en la base.
   *
   * El camino largo —armar el cuadro y cargar los resultados por el panel— se prueba
   * en su propio archivo y en el primer test de acá. Para las preguntas de ventana y
   * de estado alcanza con el torneo puesto, y así el test dice qué está probando.
   */
  const torneoTerminado = async (opciones: {
    puntosCampeon: number;
    fechaFin: Date;
    campeon: number;
    finalista: number;
    otros: [number, number];
    estado?: EstadoTorneo;
  }) => {
    const categoria = await prisma.categoriaTorneo.create({
      data: {
        nombre: `CatRank ${Date.now()}-${Math.random()}`,
        puntosCampeon: opciones.puntosCampeon,
      },
      select: { id: true },
    });

    // T62: los partidos cuelgan de un cuadro, no del torneo. **No se crean anidados**
    // dentro del cuadro: `Partido` tiene dos claves foráneas obligatorias —`torneoId` y
    // `torneoCategoriaId`— y un `create` anidado solo satisface una. Se crea el torneo
    // con su cuadro y después los partidos con los dos ids escritos.
    const categoriaJuego = await prisma.categoriaJuego.findFirstOrThrow({
      orderBy: { orden: 'asc' },
    });

    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}-${Math.random()}`,
        fechaInicio: opciones.fechaFin,
        fechaFin: opciones.fechaFin,
        cierreInscripcion: opciones.fechaFin,
        estado: opciones.estado ?? EstadoTorneo.FINALIZADO,
        cuadros: {
          create: {
            categoriaId: categoria.id,
            categoriaJuegoId: categoriaJuego.id,
            cupo: 4,
            semillaSorteo: 1,
          },
        },
      },
      select: { id: true, cuadros: { select: { id: true } } },
    });

    const delCuadro = {
      torneoId: torneo.id,
      torneoCategoriaId: torneo.cuadros[0].id,
    };

    await prisma.partido.createMany({
      data: [
        {
          ...delCuadro,
          ronda: 1,
          posicion: 1,
          jugadorAId: opciones.campeon,
          jugadorBId: opciones.otros[0],
          ganadorId: opciones.campeon,
        },
        {
          ...delCuadro,
          ronda: 1,
          posicion: 2,
          jugadorAId: opciones.finalista,
          jugadorBId: opciones.otros[1],
          ganadorId: opciones.finalista,
        },
        {
          ...delCuadro,
          ronda: 2,
          posicion: 1,
          jugadorAId: opciones.campeon,
          jugadorBId: opciones.finalista,
          ganadorId: opciones.campeon,
        },
      ],
    });

    return torneo.id;
  };

  /** Borra los torneos y deja los jugadores, para probar dos ventanas seguidas. */
  const limpiarTorneos = async () => {
    // **Acotado a los torneos de este archivo.** Jest corre los archivos en paralelo:
    // un `deleteMany({})` acá le borra el cuadro a otra suite a mitad de un test, y
    // eso salía como un fallo intermitente sin causa aparente en otro archivo.
    const mios = { torneo: { nombre: { startsWith: MARCA } } };
    await prisma.partido.deleteMany({ where: mios });
    await prisma.inscripcionTorneo.deleteMany({ where: mios });
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatRank' } },
    });
  };

  const limpiar = async () => {
    await limpiarTorneos();
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
  };

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
    await limpiar();
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();

    await crearCuenta('jefe', true);
    cookieAdmin = await entrar('jefe');

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

  it('**la tabla se ve sin cuenta**', async () => {
    await torneoTerminado({
      puntosCampeon: 250,
      fechaFin: hoyEnElClub(),
      campeon: jugadores[0],
      finalista: jugadores[1],
      otros: [jugadores[2], jugadores[3]],
    });

    const { posiciones } = await tabla();

    expect(posiciones[0].nombre).toBe(`Ana ${APELLIDO}`);
    expect(posiciones[0].puntos).toBe(250);
  });

  it('**el campeón queda arriba en cuanto se carga la final, sin recalcular nada**', async () => {
    // Este sí va por el camino largo: el admin arma el cuadro y carga los tres
    // resultados por el panel. Es el criterio 1 del spec, y el único lugar donde se
    // comprueba que el ranking lee lo que el panel escribió.
    const categoria = await prisma.categoriaTorneo.create({
      data: { nombre: `CatRank ${Date.now()}`, puntosCampeon: 250 },
      select: { id: true },
    });

    const categoriaJuego = await prisma.categoriaJuego.findFirstOrThrow({
      orderBy: { orden: 'asc' },
    });

    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} en vivo`,
        fechaInicio: hoyEnElClub(),
        fechaFin: hoyEnElClub(),
        cierreInscripcion: hoyEnElClub(),
        cuadros: {
          create: {
            categoriaId: categoria.id,
            categoriaJuegoId: categoriaJuego.id,
            cupo: 4,
          },
        },
      },
      select: { id: true, cuadros: { select: { id: true } } },
    });
    const cuadroId = torneo.cuadros[0].id;

    for (const jugadorId of jugadores) {
      await request(app.getHttpServer())
        .post(`/api/admin/cuadros/${cuadroId}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .send({ jugadorId })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/api/admin/cuadros/${cuadroId}/armar`)
      .set('Cookie', cookieAdmin)
      .expect(201);

    // Todavía no hay resultados: nadie puntúa.
    expect((await tabla()).posiciones).toHaveLength(0);

    const cuadro = await request(app.getHttpServer())
      .get(`/api/admin/cuadros/${cuadroId}`)
      .set('Cookie', cookieAdmin)
      .expect(200);
    const partidos = (
      cuadro.body as {
        partidos: { id: number; ronda: number; jugadorAId: number | null }[];
      }
    ).partidos;

    // Las dos semifinales y después la final, que es la que cierra el torneo.
    for (const partido of partidos.filter((p) => p.ronda === 1)) {
      await request(app.getHttpServer())
        .post(
          `/api/admin/torneos/${torneo.id}/partidos/${partido.id}/resultado`,
        )
        .set('Cookie', cookieAdmin)
        .send({ ganadorId: partido.jugadorAId, marcador: '6-4 6-2' })
        .expect(200);
    }

    const final = (
      await request(app.getHttpServer())
        .get(`/api/admin/cuadros/${cuadroId}`)
        .set('Cookie', cookieAdmin)
        .expect(200)
    ).body as { partidos: { id: number; ronda: number; jugadorAId: number }[] };
    const partidoFinal = final.partidos.find((p) => p.ronda === 2)!;

    await request(app.getHttpServer())
      .post(
        `/api/admin/torneos/${torneo.id}/partidos/${partidoFinal.id}/resultado`,
      )
      .set('Cookie', cookieAdmin)
      .send({ ganadorId: partidoFinal.jugadorAId, marcador: '6-4 6-2' })
      .expect(200);

    const { posiciones } = await tabla();

    expect(posiciones[0].jugadorId).toBe(partidoFinal.jugadorAId);
    expect(posiciones[0].puntos).toBe(250);
    expect(posiciones[0].puesto).toBe(1);
    // El finalista, el 60 %; los dos que perdieron entrando no aparecen.
    expect(posiciones[1].puntos).toBe(150);
    expect(posiciones).toHaveLength(2);
  });

  it('**un torneo que terminó hace 53 semanas ya no suma**', async () => {
    await torneoTerminado({
      puntosCampeon: 250,
      fechaFin: hace(53),
      campeon: jugadores[0],
      finalista: jugadores[1],
      otros: [jugadores[2], jugadores[3]],
    });

    expect((await tabla()).posiciones).toHaveLength(0);
  });

  it('y uno de hace 51 semanas todavía cuenta', async () => {
    // El par con el anterior: sin este, un corte que dejara todo afuera pasaría.
    await torneoTerminado({
      puntosCampeon: 250,
      fechaFin: hace(51),
      campeon: jugadores[0],
      finalista: jugadores[1],
      otros: [jugadores[2], jugadores[3]],
    });

    expect((await tabla()).posiciones).toHaveLength(2);
  });

  it('**el borde está al día: 364 entra y 365 no**', async () => {
    // Los de 51 y 53 semanas dejan pasar un corte corrido tres días. La ventana son
    // 52 semanas exactas, y el día que se cae un torneo del ranking es una llamada
    // al club: tiene que ser el día que corresponde y no uno cerca.
    const enElBorde = async (dias: number) => {
      await limpiarTorneos();
      await torneoTerminado({
        puntosCampeon: 250,
        fechaFin: haceDias(dias),
        campeon: jugadores[0],
        finalista: jugadores[1],
        otros: [jugadores[2], jugadores[3]],
      });

      return (await tabla()).posiciones.length;
    };

    expect(await enElBorde(364)).toBe(2);
    expect(await enElBorde(365)).toBe(0);
  });

  it('uno que se jugó antes de su fecha suma igual', async () => {
    // El admin puso el torneo para el mes que viene y se terminó de jugar antes. Los
    // puntos ya se repartieron: esconderlos hasta que llegue el día sería negar un
    // torneo que el club vio jugarse. Por eso la ventana tiene un solo borde.
    await torneoTerminado({
      puntosCampeon: 250,
      fechaFin: haceDias(-21),
      campeon: jugadores[0],
      finalista: jugadores[1],
      otros: [jugadores[2], jugadores[3]],
    });

    expect((await tabla()).posiciones).toHaveLength(2);
  });

  it('un torneo que todavía no termina no reparte puntos', async () => {
    await torneoTerminado({
      puntosCampeon: 250,
      fechaFin: hoyEnElClub(),
      campeon: jugadores[0],
      finalista: jugadores[1],
      otros: [jugadores[2], jugadores[3]],
      estado: EstadoTorneo.EN_CURSO,
    });

    expect((await tabla()).posiciones).toHaveLength(0);
  });

  it('un torneo cancelado tampoco, aunque tenga resultados cargados', async () => {
    await torneoTerminado({
      puntosCampeon: 250,
      fechaFin: hoyEnElClub(),
      campeon: jugadores[0],
      finalista: jugadores[1],
      otros: [jugadores[2], jugadores[3]],
      estado: EstadoTorneo.CANCELADO,
    });

    expect((await tabla()).posiciones).toHaveLength(0);
  });

  it('suma los torneos de la ventana, no se queda con el último', async () => {
    await torneoTerminado({
      puntosCampeon: 250,
      fechaFin: hace(30),
      campeon: jugadores[0],
      finalista: jugadores[1],
      otros: [jugadores[2], jugadores[3]],
    });
    await torneoTerminado({
      puntosCampeon: 250,
      fechaFin: hace(2),
      campeon: jugadores[1],
      finalista: jugadores[0],
      otros: [jugadores[2], jugadores[3]],
    });

    const { posiciones } = await tabla();

    // 250 + 150 cada uno, y los dos en el puesto 1.
    expect(posiciones.map((fila) => [fila.puesto, fila.puntos])).toEqual([
      [1, 400],
      [1, 400],
    ]);
  });

  it('**corregir una semifinal cambia la tabla en la consulta siguiente**', async () => {
    const torneoId = await torneoTerminado({
      puntosCampeon: 250,
      fechaFin: hoyEnElClub(),
      campeon: jugadores[0],
      finalista: jugadores[1],
      otros: [jugadores[2], jugadores[3]],
    });

    expect((await tabla()).posiciones[1].jugadorId).toBe(jugadores[1]);

    // La semifinal la había ganado Beto; en realidad la ganó Dani, que pasa a ser el
    // finalista. Deshacer la final es parte de corregir, y lo hace `resultados`.
    const semi = await prisma.partido.findFirst({
      where: { torneoId, ronda: 1, posicion: 2 },
      select: { id: true },
    });

    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/partidos/${semi!.id}/resultado`)
      .set('Cookie', cookieAdmin)
      .send({ ganadorId: jugadores[3] })
      .expect(200);

    const { posiciones } = await tabla();

    // Con la final deshecha no hay campeón: quedan los dos finalistas de su semi,
    // que alcanzaron la ronda 1 y no puntúan. Lo que importa es que **cambió**.
    expect(posiciones.some((fila) => fila.jugadorId === jugadores[1])).toBe(
      false,
    );
  });

  it('dice desde cuándo está contando y qué torneos cuenta', async () => {
    // El ranking cambia sin que pase nada: un lunes cualquiera alguien baja tres
    // puestos porque caducó el torneo del año pasado. Si la pantalla no dice el
    // corte ni los torneos, el club recibe la llamada.
    const torneoId = await torneoTerminado({
      puntosCampeon: 250,
      fechaFin: hace(10),
      campeon: jugadores[0],
      finalista: jugadores[1],
      otros: [jugadores[2], jugadores[3]],
    });

    const respuesta = await tabla();

    // Contra los mismos 364 días literales que usa el test del borde, y no contra la
    // fórmula del servicio escrita otra vez acá: así el corte que se **anuncia** y el
    // que se **aplica** no pueden separarse sin que caiga uno de los dos.
    expect(respuesta.desde).toBe(haceDias(364).toISOString().slice(0, 10));
    // `torneoId` y no `id`: desde T70 lo que la tabla cuenta son **cuadros**, así que
    // `id` es el del cuadro y el del torneo viaja aparte.
    expect(respuesta.torneos.map((t) => t.torneoId)).toEqual([torneoId]);
    expect(respuesta.torneos[0].fechaFin).toBe(
      hace(10).toISOString().slice(0, 10),
    );
  });

  it('**la tabla no publica el teléfono de nadie**', async () => {
    // Se comprueba sobre el JSON entero: un campo nuevo que lo filtre entra sin que
    // nadie se acuerde de actualizar este test.
    await torneoTerminado({
      puntosCampeon: 250,
      fechaFin: hoyEnElClub(),
      campeon: jugadores[0],
      finalista: jugadores[1],
      otros: [jugadores[2], jugadores[3]],
    });

    const crudo = JSON.stringify(await tabla());

    for (const guardado of GUARDADOS) expect(crudo).not.toContain(guardado);
    expect(crudo).not.toContain('telefono');
  });

  it('sin torneos terminados la tabla viene vacía, no rota', async () => {
    const respuesta = await tabla();

    expect(respuesta.posiciones).toEqual([]);
    expect(respuesta.torneos).toEqual([]);
  });

  /**
   * T70. Un torneo, dos cuadros que valen distinto.
   *
   * Es el criterio obligatorio: la Copa corre Honor y 4ª el mismo fin de semana, y el
   * club decidió que ganar Honor vale el doble. Antes de T70 el valor colgaba del
   * torneo y los dos campeones sumaban lo mismo.
   */
  describe('un torneo con varios cuadros (T70)', () => {
    /** Un cuadro de cuatro dentro de un torneo que ya existe. */
    const unCuadro = async (
      torneoId: number,
      opciones: {
        puntosCampeon: number;
        categoriaJuego: string;
        campeon: number;
        finalista: number;
        otros: [number, number];
      },
    ) => {
      const valor = await prisma.categoriaTorneo.create({
        data: {
          nombre: `CatRank ${Date.now()}-${Math.random()}`,
          puntosCampeon: opciones.puntosCampeon,
        },
        select: { id: true },
      });

      const nivel = await prisma.categoriaJuego.findUniqueOrThrow({
        where: { nombre: opciones.categoriaJuego },
        select: { id: true },
      });

      const cuadro = await prisma.torneoCategoria.create({
        data: {
          torneoId,
          categoriaId: valor.id,
          categoriaJuegoId: nivel.id,
          cupo: 4,
          semillaSorteo: 1,
        },
        select: { id: true },
      });

      const suyo = { torneoId, torneoCategoriaId: cuadro.id };

      await prisma.partido.createMany({
        data: [
          {
            ...suyo,
            ronda: 1,
            posicion: 1,
            jugadorAId: opciones.campeon,
            jugadorBId: opciones.otros[0],
            ganadorId: opciones.campeon,
          },
          {
            ...suyo,
            ronda: 1,
            posicion: 2,
            jugadorAId: opciones.finalista,
            jugadorBId: opciones.otros[1],
            ganadorId: opciones.finalista,
          },
          {
            ...suyo,
            ronda: 2,
            posicion: 1,
            jugadorAId: opciones.campeon,
            jugadorBId: opciones.finalista,
            ganadorId: opciones.campeon,
          },
        ],
      });

      return cuadro.id;
    };

    /** Un torneo pelado: sus cuadros los pone cada test. */
    const unTorneoVacio = async () =>
      (
        await prisma.torneo.create({
          data: {
            nombre: `${MARCA} dos cuadros ${Date.now()}-${Math.random()}`,
            fechaInicio: hace(10),
            fechaFin: hace(10),
            cierreInscripcion: hace(10),
            estado: EstadoTorneo.FINALIZADO,
          },
          select: { id: true },
        })
      ).id;

    it('**el campeón de Honor suma más que el de 4ª, en el mismo torneo**', async () => {
      const torneoId = await unTorneoVacio();

      await unCuadro(torneoId, {
        puntosCampeon: 500,
        categoriaJuego: 'Honor',
        campeon: jugadores[0],
        finalista: jugadores[1],
        otros: [jugadores[2], jugadores[3]],
      });
      await unCuadro(torneoId, {
        puntosCampeon: 250,
        categoriaJuego: '4ª',
        campeon: jugadores[4],
        finalista: jugadores[5],
        otros: [jugadores[6], jugadores[7]],
      });

      const respuesta = await tabla();
      const puntosDe = (jugadorId: number) =>
        respuesta.posiciones.find((f) => f.jugadorId === jugadorId)?.puntos;

      expect(puntosDe(jugadores[0])).toBe(500);
      expect(puntosDe(jugadores[4])).toBe(250);
      // Y los dos son campeones, no uno solo: el torneo reparte dos juegos de puntos.
      expect(respuesta.torneos).toHaveLength(2);
    });

    it('**el que perdió la primera ronda de cualquiera de los dos no aparece**', async () => {
      const torneoId = await unTorneoVacio();

      await unCuadro(torneoId, {
        puntosCampeon: 500,
        categoriaJuego: 'Honor',
        campeon: jugadores[0],
        finalista: jugadores[1],
        otros: [jugadores[2], jugadores[3]],
      });
      await unCuadro(torneoId, {
        puntosCampeon: 250,
        categoriaJuego: '4ª',
        campeon: jugadores[4],
        finalista: jugadores[5],
        otros: [jugadores[6], jugadores[7]],
      });

      const respuesta = await tabla();
      const estan = respuesta.posiciones.map((f) => f.jugadorId);

      // Perder en primera ronda da cero, y con cero no se entra a la tabla.
      expect(estan).not.toContain(jugadores[2]);
      expect(estan).not.toContain(jugadores[6]);
    });

    it('**los dos cuadros se nombran con su nivel y su valor**', async () => {
      // Quien mira la tabla tiene que poder ver de cuál de los tres cuadros salieron
      // sus puntos: "Copa · Honor · Máster 500" y no solo "Copa".
      const torneoId = await unTorneoVacio();

      await unCuadro(torneoId, {
        puntosCampeon: 500,
        categoriaJuego: 'Honor',
        campeon: jugadores[0],
        finalista: jugadores[1],
        otros: [jugadores[2], jugadores[3]],
      });

      const respuesta = await tabla();

      expect(respuesta.torneos[0].categoria).toBe('Honor');
      expect(respuesta.torneos[0].valor).toContain('CatRank');
      expect(respuesta.torneos[0].torneoId).toBe(torneoId);
    });
  });
});
