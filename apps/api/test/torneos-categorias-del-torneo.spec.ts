import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { sembrarCategoriasDeJuego } from '../prisma/seed-torneos';
import { Superficie } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T61: un torneo corre varios cuadros, uno por categoría de juego.
 *
 * Esta es la mitad **expandir** del cambio de eje: se agrega `TorneoCategoria` y las
 * columnas nulables que apuntan a ella, y se rellenan los torneos que ya estaban. El
 * único de `Partido` no se toca todavía y el cuadro sigue funcionando igual — eso es
 * T62.
 *
 * **El test que importa es el del backfill.** Es la única parte de las fases 12 a 15
 * que puede perder el historial de los torneos ya jugados, y no hay de dónde
 * reconstruirlo.
 */
describe('Torneos: las categorías de un torneo', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;

  const DOMINIO = '@cuadros.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Copa de cuadros';

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'De cuadros',
      })
      .expect(201);

    await prisma.usuario.update({
      where: { email: `${sufijo}${DOMINIO}` },
      data: { esAdmin },
    });
  };

  const entrar = async (sufijo: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA })
      .expect(204);

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  interface CuadroPublicado {
    id: number;
    torneoId: number;
    categoriaJuegoId: number;
    categoria: string;
    cupo: number;
    montoInscripcionClp: number;
  }

  /**
   * Cuánto vale ganar un cuadro. Desde T70 se elige **por cuadro**, así que cada test
   * de este archivo necesita una a mano para poder agregar uno.
   */
  let valorId = 0;

  const crearTorneo = async () => {
    const valor = await prisma.categoriaTorneo.create({
      data: {
        nombre: `Nivel ${Date.now()}${Math.random()}`,
        puntosCampeon: 250,
      },
    });
    valorId = valor.id;

    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/torneos')
      .set('Cookie', cookieAdmin)
      .send({
        nombre: `${MARCA} ${Date.now()}`,
        superficie: Superficie.ARCILLA,
        fechaInicio: '2026-12-01',
        fechaFin: '2026-12-07',
        cierreInscripcion: '2026-11-25',
      })
      .expect(201);

    return (respuesta.body as { id: number }).id;
  };

  const idDe = async (nombre: string) =>
    (await prisma.categoriaJuego.findUniqueOrThrow({ where: { nombre } })).id;

  const agregarCuadro = (torneoId: number, cuerpo: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/categorias`)
      .set('Cookie', cookieAdmin)
      // El valor por omisión, para que cada test hable solo de lo suyo. El que prueba
      // el valor lo manda explícito.
      .send({ categoriaId: valorId, ...cuerpo });

  const cuadrosDe = async (torneoId: number) => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/torneos/${torneoId}/categorias`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as CuadroPublicado[];
  };

  const limpiar = async () => {
    // El torneo primero: se lleva en cascada sus cuadros y sus inscripciones, y hasta
    // que eso pase el jugador tiene filas apuntándolo y la base no lo deja borrar.
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: 'De cuadros' } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'Nivel ' } },
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
    await sembrarCategoriasDeJuego(prisma);
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();

    await crearCuenta('jefe', true);
    cookieAdmin = await entrar('jefe');

    await crearCuenta('socia');
    cookieSocio = await entrar('socia');
  });

  describe('el backfill de la migración', () => {
    // El test de "cero huérfanos" vivió en T61 y **se murió de éxito en T62**: la
    // columna pasó a `NOT NULL`, así que un huérfano ya no se puede ni escribir y la
    // consulta que lo buscaba no compila. Lo que garantizaba ahora lo garantiza la
    // base, que es donde tenía que estar.

    it('**cada fila quedó colgando de un cuadro de su propio torneo**', async () => {
      // El error que un backfill puede cometer y que el conteo no ve: apuntar las
      // inscripciones de un torneo al cuadro de otro. Los conteos cuadran igual y el
      // historial queda mezclado.
      const inscripciones = await prisma.inscripcionTorneo.findMany({
        select: {
          torneoId: true,
          torneoCategoria: { select: { torneoId: true } },
        },
      });
      const partidos = await prisma.partido.findMany({
        select: {
          torneoId: true,
          torneoCategoria: { select: { torneoId: true } },
        },
      });

      for (const fila of [...inscripciones, ...partidos]) {
        expect(fila.torneoCategoria?.torneoId).toBe(fila.torneoId);
      }
    });

    it('ningún torneo quedó sin cuadro', async () => {
      // `Torneo.cupo` y `Torneo.semillaSorteo` se borraron en T62, así que ya no hay
      // contra qué comparar: lo que queda por comprobar es que **cada torneo tenga al
      // menos un cuadro**, que es lo que la migración garantizó al rellenar.
      const torneos = await prisma.torneo.findMany({
        select: { id: true, _count: { select: { cuadros: true } } },
      });

      for (const torneo of torneos) {
        expect(torneo._count.cuadros).toBeGreaterThan(0);
      }
    });
  });

  describe('el admin arma los cuadros del torneo', () => {
    it('agrega dos categorías y cada una lleva su propio cupo', async () => {
      const torneoId = await crearTorneo();

      await agregarCuadro(torneoId, {
        categoriaJuegoId: await idDe('4ª'),
        cupo: 32,
      }).expect(201);
      await agregarCuadro(torneoId, {
        categoriaJuegoId: await idDe('Honor'),
        cupo: 8,
        montoInscripcionClp: 15000,
      }).expect(201);

      const cuadros = await cuadrosDe(torneoId);
      expect(cuadros.map((c) => [c.categoria, c.cupo])).toEqual([
        ['4ª', 32],
        ['Honor', 8],
      ]);
      expect(cuadros.at(1)?.montoInscripcionClp).toBe(15000);
    });

    it('**los cuadros salen ordenados por la categoría, no por cuándo se agregaron**', async () => {
      const torneoId = await crearTorneo();

      await agregarCuadro(torneoId, {
        categoriaJuegoId: await idDe('Honor'),
        cupo: 8,
      }).expect(201);
      await agregarCuadro(torneoId, {
        categoriaJuegoId: await idDe('5ª'),
        cupo: 16,
      }).expect(201);

      expect((await cuadrosDe(torneoId)).map((c) => c.categoria)).toEqual([
        '5ª',
        'Honor',
      ]);
    });

    it('**la misma categoría dos veces en un torneo se rechaza**', async () => {
      const torneoId = await crearTorneo();
      const cuarta = await idDe('4ª');

      await agregarCuadro(torneoId, {
        categoriaJuegoId: cuarta,
        cupo: 16,
      }).expect(201);
      await agregarCuadro(torneoId, {
        categoriaJuegoId: cuarta,
        cupo: 8,
      }).expect(409);
    });

    it('la inscripción es gratis mientras nadie diga otra cosa', async () => {
      const torneoId = await crearTorneo();

      await agregarCuadro(torneoId, {
        categoriaJuegoId: await idDe('4ª'),
        cupo: 16,
      }).expect(201);

      expect((await cuadrosDe(torneoId)).at(0)?.montoInscripcionClp).toBe(0);
    });

    it('una categoría que no existe, o un torneo que no existe, se rechazan', async () => {
      const torneoId = await crearTorneo();

      await agregarCuadro(torneoId, {
        categoriaJuegoId: 999999,
        cupo: 16,
      }).expect(404);
      await agregarCuadro(999999, {
        categoriaJuegoId: await idDe('4ª'),
        cupo: 16,
      }).expect(404);
    });

    it('un cupo menor que dos no arma ningún cuadro', async () => {
      const torneoId = await crearTorneo();

      await agregarCuadro(torneoId, {
        categoriaJuegoId: await idDe('4ª'),
        cupo: 1,
      }).expect(400);
    });

    it('el admin corrige el cupo y el monto de un cuadro', async () => {
      const torneoId = await crearTorneo();
      const cuadro = (
        await agregarCuadro(torneoId, {
          categoriaJuegoId: await idDe('4ª'),
          cupo: 16,
        }).expect(201)
      ).body as CuadroPublicado;

      await request(app.getHttpServer())
        .patch(`/api/admin/torneos/${torneoId}/categorias/${cuadro.id}`)
        .set('Cookie', cookieAdmin)
        .send({ cupo: 32, montoInscripcionClp: 20000 })
        .expect(200);

      const guardado = await prisma.torneoCategoria.findUniqueOrThrow({
        where: { id: cuadro.id },
      });
      expect(guardado.cupo).toBe(32);
      expect(guardado.montoInscripcionClp).toBe(20000);
    });

    it('quitar un cuadro vacío se puede', async () => {
      const torneoId = await crearTorneo();
      const cuadro = (
        await agregarCuadro(torneoId, {
          categoriaJuegoId: await idDe('4ª'),
          cupo: 16,
        }).expect(201)
      ).body as CuadroPublicado;

      await request(app.getHttpServer())
        .delete(`/api/admin/torneos/${torneoId}/categorias/${cuadro.id}`)
        .set('Cookie', cookieAdmin)
        .expect(200);

      expect(await cuadrosDe(torneoId)).toHaveLength(0);
    });

    it('**quitar un cuadro con gente inscrita se rechaza**', async () => {
      // Borrarlo se llevaría por delante las inscripciones y, más tarde, los partidos
      // jugados. Es el mismo criterio que impide borrar una categoría de juego.
      const torneoId = await crearTorneo();
      const cuadro = (
        await agregarCuadro(torneoId, {
          categoriaJuegoId: await idDe('4ª'),
          cupo: 16,
        }).expect(201)
      ).body as CuadroPublicado;

      const jugador = await prisma.jugador.create({
        data: { nombre: 'Rodrigo', apellido: 'De cuadros' },
      });
      await prisma.inscripcionTorneo.create({
        data: {
          torneoId,
          jugadorId: jugador.id,
          torneoCategoriaId: cuadro.id,
        },
      });

      await request(app.getHttpServer())
        .delete(`/api/admin/torneos/${torneoId}/categorias/${cuadro.id}`)
        .set('Cookie', cookieAdmin)
        .expect(409);

      // El cuadro sigue ahí y el inscrito también: rechazar no puede haber borrado
      // nada a medias.
      expect(await cuadrosDe(torneoId)).toHaveLength(1);
      expect(
        await prisma.inscripcionTorneo.count({
          where: { torneoCategoriaId: cuadro.id },
        }),
      ).toBe(1);
    });

    it('borrar el torneo se lleva sus cuadros', async () => {
      const torneoId = await crearTorneo();
      await agregarCuadro(torneoId, {
        categoriaJuegoId: await idDe('4ª'),
        cupo: 16,
      }).expect(201);

      await prisma.torneo.delete({ where: { id: torneoId } });

      expect(await prisma.torneoCategoria.count({ where: { torneoId } })).toBe(
        0,
      );
    });

    it('solo el admin arma cuadros', async () => {
      const torneoId = await crearTorneo();

      await request(app.getHttpServer())
        .post(`/api/admin/torneos/${torneoId}/categorias`)
        .set('Cookie', cookieSocio)
        .send({ categoriaJuegoId: await idDe('4ª'), cupo: 16 })
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/admin/torneos/${torneoId}/categorias`)
        .expect(401);
    });
  });
  /**
   * T62: lo que el cambio de eje hace posible y antes no lo era.
   *
   * Con el único viejo sobre `(torneoId, ronda, posicion)`, el segundo cuadro de un
   * torneo **no se podía guardar**: su ronda 1 posición 1 chocaba con la del primero.
   */
  describe('dos cuadros en el mismo torneo', () => {
    const inscribir = async (cuadroId: number, nombre: string) => {
      const jugador = await prisma.jugador.create({
        data: { nombre, apellido: 'De cuadros' },
      });

      await request(app.getHttpServer())
        .post(`/api/admin/cuadros/${cuadroId}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .send({ jugadorId: jugador.id })
        .expect(201);

      return jugador.id;
    };

    const armar = (cuadroId: number) =>
      request(app.getHttpServer())
        .post(`/api/admin/cuadros/${cuadroId}/armar`)
        .set('Cookie', cookieAdmin);

    const dosCuadros = async () => {
      const torneoId = await crearTorneo();
      const cuarta = (
        await agregarCuadro(torneoId, {
          categoriaJuegoId: await idDe('4ª'),
          cupo: 4,
        }).expect(201)
      ).body as CuadroPublicado;
      const honor = (
        await agregarCuadro(torneoId, {
          categoriaJuegoId: await idDe('Honor'),
          cupo: 2,
        }).expect(201)
      ).body as CuadroPublicado;

      return { torneoId, cuarta: cuarta.id, honor: honor.id };
    };

    it('**los dos se arman y ninguno pisa al otro**', async () => {
      const { cuarta, honor } = await dosCuadros();

      for (const nombre of ['Ana', 'Beto', 'Cata', 'Dani']) {
        await inscribir(cuarta, nombre);
      }
      for (const nombre of ['Eva', 'Facu']) await inscribir(honor, nombre);

      await armar(cuarta).expect(201);
      await armar(honor).expect(201);

      // Cuatro jugadores dan un cuadro de 4: dos semifinales y una final.
      expect(
        await prisma.partido.count({ where: { torneoCategoriaId: cuarta } }),
      ).toBe(3);
      // Dos jugadores dan un cuadro de 2: la final y nada más.
      expect(
        await prisma.partido.count({ where: { torneoCategoriaId: honor } }),
      ).toBe(1);
    });

    it('**los dos tienen su ronda 1 posición 1, que es lo que el único viejo impedía**', async () => {
      const { cuarta, honor } = await dosCuadros();

      for (const nombre of ['Ana', 'Beto', 'Cata', 'Dani']) {
        await inscribir(cuarta, nombre);
      }
      for (const nombre of ['Eva', 'Facu']) await inscribir(honor, nombre);

      await armar(cuarta).expect(201);
      await armar(honor).expect(201);

      const primeros = await prisma.partido.findMany({
        where: {
          ronda: 1,
          posicion: 1,
          torneoCategoriaId: { in: [cuarta, honor] },
        },
      });
      expect(primeros).toHaveLength(2);
    });

    it('**cada cuadro guarda su propia semilla: rearmar Honor no re-sortea la 4ª**', async () => {
      const { cuarta, honor } = await dosCuadros();

      for (const nombre of ['Ana', 'Beto', 'Cata', 'Dani']) {
        await inscribir(cuarta, nombre);
      }
      for (const nombre of ['Eva', 'Facu']) await inscribir(honor, nombre);

      await armar(cuarta).expect(201);
      const semillaDeLaCuarta = (
        await prisma.torneoCategoria.findUniqueOrThrow({
          where: { id: cuarta },
        })
      ).semillaSorteo;

      await armar(honor).expect(201);
      await request(app.getHttpServer())
        .post(`/api/admin/cuadros/${honor}/deshacer`)
        .set('Cookie', cookieAdmin)
        .expect(200);
      await armar(honor).expect(201);

      const despues = await prisma.torneoCategoria.findUniqueOrThrow({
        where: { id: cuarta },
      });
      expect(despues.semillaSorteo).toBe(semillaDeLaCuarta);
      expect(
        await prisma.partido.count({ where: { torneoCategoriaId: cuarta } }),
      ).toBe(3);
    });

    it('**el cupo es de cada cuadro**: 4 en la 4ª y 2 en Honor', async () => {
      const { cuarta, honor } = await dosCuadros();

      for (const nombre of ['Eva', 'Facu']) await inscribir(honor, nombre);
      // El tercero de Honor se pasa del cupo de 2 y va a espera, aunque la 4ª tenga
      // lugar de sobra: los cupos no se comparten.
      const tercero = await prisma.jugador.create({
        data: { nombre: 'Gabo', apellido: 'De cuadros' },
      });
      const enEspera = await request(app.getHttpServer())
        .post(`/api/admin/cuadros/${honor}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .send({ jugadorId: tercero.id })
        .expect(201);

      expect((enEspera.body as { estado: string }).estado).toBe('LISTA_ESPERA');

      const lista = (
        await request(app.getHttpServer())
          .get(`/api/admin/cuadros/${cuarta}/inscripciones`)
          .set('Cookie', cookieAdmin)
          .expect(200)
      ).body as { cupo: number; inscritos: unknown[] };
      expect(lista.cupo).toBe(4);
      expect(lista.inscritos).toHaveLength(0);
    });

    it('**dos inscripciones simultáneas en dos cuadros dan 409, no 500**', async () => {
      // El cerrojo es sobre el cuadro y la comprobación de "ya está inscrito" abarca
      // el torneo entero: las dos toman filas distintas, las dos pasan, y el único
      // `(torneoId, jugadorActivo)` atrapa una. **Sin traducir ese error sale un 500**,
      // que es lo que este test ataja. Mismo criterio que T2, T21 y T18.
      const { cuarta, honor } = await dosCuadros();
      const jugador = await prisma.jugador.create({
        data: { nombre: 'Doble', apellido: 'De cuadros' },
      });

      const respuestas = await Promise.all(
        [cuarta, honor].map((cuadroId) =>
          request(app.getHttpServer())
            .post(`/api/admin/cuadros/${cuadroId}/inscripciones`)
            .set('Cookie', cookieAdmin)
            .send({ jugadorId: jugador.id }),
        ),
      );

      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it('**un jugador no puede estar en las dos categorías del mismo torneo**', async () => {
      const { cuarta, honor } = await dosCuadros();
      const jugadorId = await inscribir(cuarta, 'Ana');

      await request(app.getHttpServer())
        .post(`/api/admin/cuadros/${honor}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .send({ jugadorId })
        .expect(409);
    });

    it('**el torneo no queda FINALIZADO hasta que caen las dos finales**', async () => {
      const { torneoId, cuarta, honor } = await dosCuadros();

      for (const nombre of ['Ana', 'Beto']) await inscribir(cuarta, nombre);
      for (const nombre of ['Eva', 'Facu']) await inscribir(honor, nombre);

      await armar(cuarta).expect(201);
      await armar(honor).expect(201);

      const finalDe = async (cuadroId: number) =>
        prisma.partido.findFirstOrThrow({
          where: { torneoCategoriaId: cuadroId },
        });

      const finalCuarta = await finalDe(cuarta);
      await request(app.getHttpServer())
        .post(
          `/api/admin/torneos/${torneoId}/partidos/${finalCuarta.id}/resultado`,
        )
        .set('Cookie', cookieAdmin)
        .send({ ganadorId: finalCuarta.jugadorAId, marcador: '6-0 6-0' })
        .expect(200);

      // Una final caída y la otra no: el torneo sigue en curso. De `FINALIZADO` salen
      // los puntos del ranking, y ponerlo acá los repartiría a medias.
      expect(
        (await prisma.torneo.findUniqueOrThrow({ where: { id: torneoId } }))
          .estado,
      ).not.toBe('FINALIZADO');

      const finalHonor = await finalDe(honor);
      await request(app.getHttpServer())
        .post(
          `/api/admin/torneos/${torneoId}/partidos/${finalHonor.id}/resultado`,
        )
        .set('Cookie', cookieAdmin)
        .send({ ganadorId: finalHonor.jugadorAId, marcador: '7-5 6-4' })
        .expect(200);

      expect(
        (await prisma.torneo.findUniqueOrThrow({ where: { id: torneoId } }))
          .estado,
      ).toBe('FINALIZADO');
    });
  });
});
