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
  const TELEFONO = '+56977776666';

  interface Posicion {
    puesto: number;
    jugadorId: number;
    nombre: string;
    puntos: number;
    torneos: number;
  }

  interface Tabla {
    desde: string;
    hasta: string;
    torneos: {
      id: number;
      nombre: string;
      categoria: string;
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

  /** Una fecha civil a tantas semanas de hoy, hacia atrás. */
  const hace = (semanas: number) =>
    new Date(hoyEnElClub().getTime() - semanas * 7 * 24 * 60 * 60 * 1000);

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

    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}-${Math.random()}`,
        categoriaId: categoria.id,
        fechaInicio: opciones.fechaFin,
        fechaFin: opciones.fechaFin,
        cierreInscripcion: opciones.fechaFin,
        cupo: 4,
        estado: opciones.estado ?? EstadoTorneo.FINALIZADO,
        partidos: {
          create: [
            {
              ronda: 1,
              posicion: 1,
              jugadorAId: opciones.campeon,
              jugadorBId: opciones.otros[0],
              ganadorId: opciones.campeon,
            },
            {
              ronda: 1,
              posicion: 2,
              jugadorAId: opciones.finalista,
              jugadorBId: opciones.otros[1],
              ganadorId: opciones.finalista,
            },
            {
              ronda: 2,
              posicion: 1,
              jugadorAId: opciones.campeon,
              jugadorBId: opciones.finalista,
              ganadorId: opciones.campeon,
            },
          ],
        },
      },
      select: { id: true },
    });

    return torneo.id;
  };

  const limpiar = async () => {
    await prisma.partido.deleteMany({});
    await prisma.inscripcionTorneo.deleteMany({});
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatRank' } },
    });
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
    await app.init();

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

    // Los cuatro llevan teléfono: es lo que la tabla no puede publicar.
    jugadores = [];
    for (const nombre of ['Ana', 'Beto', 'Cata', 'Dani']) {
      const jugador = await prisma.jugador.create({
        data: { nombre, apellido: APELLIDO, telefono: TELEFONO },
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

    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} en vivo`,
        categoriaId: categoria.id,
        fechaInicio: hoyEnElClub(),
        fechaFin: hoyEnElClub(),
        cierreInscripcion: hoyEnElClub(),
        cupo: 4,
      },
      select: { id: true },
    });

    for (const jugadorId of jugadores) {
      await request(app.getHttpServer())
        .post(`/api/admin/torneos/${torneo.id}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .send({ jugadorId })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneo.id}/cuadro`)
      .set('Cookie', cookieAdmin)
      .expect(201);

    // Todavía no hay resultados: nadie puntúa.
    expect((await tabla()).posiciones).toHaveLength(0);

    const cuadro = await request(app.getHttpServer())
      .get(`/api/admin/torneos/${torneo.id}/cuadro`)
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
        .get(`/api/admin/torneos/${torneo.id}/cuadro`)
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
    const corte = new Date(hoyEnElClub().getTime());
    corte.setUTCDate(corte.getUTCDate() - 364);

    expect(respuesta.desde).toBe(corte.toISOString().slice(0, 10));
    expect(respuesta.hasta).toBe(hoyEnElClub().toISOString().slice(0, 10));
    expect(respuesta.torneos.map((t) => t.id)).toEqual([torneoId]);
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

    expect(crudo).not.toContain(TELEFONO);
    expect(crudo).not.toContain('telefono');
  });

  it('sin torneos terminados la tabla viene vacía, no rota', async () => {
    const respuesta = await tabla();

    expect(respuesta.posiciones).toEqual([]);
    expect(respuesta.torneos).toEqual([]);
  });
});
