import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T188: los tours y sus temporadas, desde el panel (`SPEC-tours.md`).
 *
 * Lo que más cuida este archivo es **que nada con torneos se pueda borrar**: un tour,
 * una temporada o un nivel que se lleva sus torneos cambia el ranking sin que nadie lo
 * haya decidido. Lo impide la base, con los `Restrict` de `torneo_tour`, y el servicio
 * lo explica con el número de torneos.
 */
describe('Tours y temporadas', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;

  const DOMINIO = '@tours.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Tour de prueba';
  const TORNEO = 'Copa de prueba de tours';

  interface Temporada {
    id: number;
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
  }

  interface Ficha {
    id: number;
    nombre: string;
    descripcion: string;
    temporadas: Temporada[];
  }

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];
  const comoAdmin = (
    metodo: 'get' | 'post' | 'patch' | 'delete',
    ruta: string,
  ) =>
    request(servidor())[metodo](`/api/admin${ruta}`).set('Cookie', cookieAdmin);

  const unTour = async (sufijo = 'A'): Promise<Ficha> =>
    (
      await comoAdmin('post', '/tours')
        .send({ nombre: `${MARCA} ${sufijo}` })
        .expect(201)
    ).body as Ficha;

  const unaTemporada = async (
    tourId: number,
    datos: Record<string, string> = {},
  ): Promise<Temporada> =>
    (
      await comoAdmin('post', `/tours/${tourId}/temporadas`)
        .send({
          nombre: '2027',
          fechaInicio: '2027-03-01',
          fechaFin: '2027-12-15',
          ...datos,
        })
        .expect(201)
    ).body as Temporada;

  /**
   * Un torneo asociado a la temporada, escrito directo en la base: la asociación la
   * escribe `torneos` recién en T196, y acá solo importa que exista la fila.
   */
  const unTorneoEn = async (tourId: number, temporadaId: number) => {
    const nivel = await prisma.nivelTemporada.create({
      data: {
        temporadaId,
        nombre: `500 ${Date.now()}${Math.random()}`,
        puntosCampeon: 500,
        puntosFinalista: 300,
        puntosSemifinal: 180,
        puntosCuartos: 90,
        puntosOctavos: 45,
        puntosDieciseisavos: 20,
        puntosTreintaidosavos: 10,
      },
    });
    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${TORNEO} ${Date.now()}`,
        fechaInicio: new Date('2027-04-10T00:00:00.000Z'),
        fechaFin: new Date('2027-04-11T00:00:00.000Z'),
        cierreInscripcion: new Date('2027-04-01T00:00:00.000Z'),
      },
    });

    await prisma.torneoTour.create({
      data: { torneoId: torneo.id, tourId, nivelId: nivel.id },
    });
  };

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
          apellido: 'Tours',
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

  describe('el tour', () => {
    it('nace con solo el nombre: la descripción vacía, sin temporadas', async () => {
      const tour = await unTour();

      expect(tour).toMatchObject({
        nombre: `${MARCA} A`,
        descripcion: '',
        temporadas: [],
      });

      const lista = (await comoAdmin('get', '/tours').expect(200)).body as {
        id: number;
        nombre: string;
        temporadas: number;
      }[];
      expect(lista.find((t) => t.id === tour.id)).toEqual({
        id: tour.id,
        nombre: `${MARCA} A`,
        temporadas: 0,
      });
    });

    it('**dos tours con el mismo nombre responden 409**', async () => {
      await unTour();

      const choque = await comoAdmin('post', '/tours')
        .send({ nombre: `  ${MARCA} A  ` })
        .expect(409);

      expect((choque.body as { message: string }).message).toContain('nombre');
    });

    it('sin nombre, con un nombre de más de 80 o una descripción de más de 2.000, 400', async () => {
      await comoAdmin('post', '/tours').send({ nombre: '   ' }).expect(400);
      await comoAdmin('post', '/tours')
        .send({ nombre: `${MARCA} ${'a'.repeat(80)}` })
        .expect(400);

      const tour = await unTour();
      await comoAdmin('patch', `/tours/${tour.id}`)
        .send({ descripcion: 'a'.repeat(2001) })
        .expect(400);
    });

    it('la descripción se guarda como texto plano, con sus saltos de línea', async () => {
      const tour = await unTour();

      const editado = (
        await comoAdmin('patch', `/tours/${tour.id}`)
          .send({ descripcion: '  Primera línea.\nSegunda <b>línea</b>.  ' })
          .expect(200)
      ).body as Ficha;

      expect(editado.descripcion).toBe('Primera línea.\nSegunda <b>línea</b>.');
    });

    it('un tour que no existe responde 404', async () => {
      await comoAdmin('get', '/tours/999999').expect(404);
      await comoAdmin('patch', '/tours/999999')
        .send({ nombre: 'x' })
        .expect(404);
    });
  });

  describe('las temporadas', () => {
    it('se crean con sus fechas y la ficha las devuelve, la más nueva primero', async () => {
      const tour = await unTour();
      await unaTemporada(tour.id, {
        nombre: '2026',
        fechaInicio: '2026-03-01',
        fechaFin: '2026-12-15',
      });
      await unaTemporada(tour.id);

      const ficha = (await comoAdmin('get', `/tours/${tour.id}`).expect(200))
        .body as Ficha;

      expect(ficha.temporadas.map((t) => t.nombre)).toEqual(['2027', '2026']);
      expect(ficha.temporadas[0]).toMatchObject({
        fechaInicio: '2027-03-01',
        fechaFin: '2027-12-15',
      });
    });

    it('**el inicio no puede ser posterior al término**; el mismo día, sí', async () => {
      const tour = await unTour();

      await comoAdmin('post', `/tours/${tour.id}/temporadas`)
        .send({
          nombre: '2027',
          fechaInicio: '2027-12-15',
          fechaFin: '2027-03-01',
        })
        .expect(400);
      await comoAdmin('post', `/tours/${tour.id}/temporadas`)
        .send({
          nombre: 'Un día',
          fechaInicio: '2027-05-01',
          fechaFin: '2027-05-01',
        })
        .expect(201);
    });

    it('una fecha que no existe responde 400', async () => {
      const tour = await unTour();

      await comoAdmin('post', `/tours/${tour.id}/temporadas`)
        .send({
          nombre: '2027',
          fechaInicio: '2027-02-30',
          fechaFin: '2027-12-15',
        })
        .expect(400);
    });

    it('**el mismo nombre en el mismo tour es 409**; en otro tour, no', async () => {
      const uno = await unTour('A');
      const otro = await unTour('B');
      await unaTemporada(uno.id);

      await comoAdmin('post', `/tours/${uno.id}/temporadas`)
        .send({
          nombre: '2027',
          fechaInicio: '2027-01-01',
          fechaFin: '2027-02-01',
        })
        .expect(409);
      await unaTemporada(otro.id);
    });

    it('se editan el nombre y las fechas, y las fechas se comprueban entre sí', async () => {
      const tour = await unTour();
      const temporada = await unaTemporada(tour.id);

      const editada = (
        await comoAdmin('patch', `/temporadas/${temporada.id}`)
          .send({
            nombre: 'Apertura 2027',
            fechaInicio: '2027-02-01',
            fechaFin: '2027-06-30',
          })
          .expect(200)
      ).body as Temporada;

      expect(editada).toMatchObject({
        nombre: 'Apertura 2027',
        fechaInicio: '2027-02-01',
        fechaFin: '2027-06-30',
      });

      await comoAdmin('patch', `/temporadas/${temporada.id}`)
        .send({ fechaInicio: '2027-07-01', fechaFin: '2027-06-30' })
        .expect(400);
    });
  });

  describe('los niveles (T189)', () => {
    const NIVEL_500 = {
      campeon: 500,
      finalista: 300,
      semifinal: 180,
      cuartos: 90,
      octavos: 45,
      dieciseisavos: 20,
      treintaidosavos: 10,
    };

    interface Nivel {
      id: number;
      nombre: string;
      tabla: typeof NIVEL_500;
      torneos: number;
      torneosTerminados: number;
    }

    const unNivel = async (
      temporadaId: number,
      nombre = '500',
      tabla: Record<string, number> = NIVEL_500,
    ): Promise<Nivel> =>
      (
        await comoAdmin('post', `/temporadas/${temporadaId}/niveles`)
          .send({ nombre, tabla })
          .expect(201)
      ).body as Nivel;

    const niveles = async (tourId: number) =>
      (
        (await comoAdmin('get', `/tours/${tourId}`).expect(200)).body as {
          temporadas: { nombre: string; niveles: Nivel[] }[];
        }
      ).temporadas;

    /** Un torneo en ese nivel, con el estado que pida el caso. */
    const asociar = async (
      tourId: number,
      nivelId: number,
      estado: 'INSCRIPCION' | 'FINALIZADO' = 'INSCRIPCION',
    ) => {
      const torneo = await prisma.torneo.create({
        data: {
          nombre: `${TORNEO} ${Date.now()}${Math.random()}`,
          fechaInicio: new Date('2027-04-10T00:00:00.000Z'),
          fechaFin: new Date('2027-04-11T00:00:00.000Z'),
          cierreInscripcion: new Date('2027-04-01T00:00:00.000Z'),
          estado,
        },
      });
      await prisma.torneoTour.create({
        data: { torneoId: torneo.id, tourId, nivelId },
      });
    };

    it('se crean con su tabla, y la ficha los muestra del que más vale al que menos', async () => {
      const tour = await unTour();
      const temporada = await unaTemporada(tour.id);

      const creado = await unNivel(temporada.id);
      await unNivel(temporada.id, '250', {
        ...NIVEL_500,
        campeon: 250,
        finalista: 150,
        semifinal: 90,
        cuartos: 45,
        octavos: 20,
        dieciseisavos: 10,
        treintaidosavos: 5,
      });

      expect(creado).toEqual({
        id: creado.id,
        nombre: '500',
        tabla: NIVEL_500,
        torneos: 0,
        torneosTerminados: 0,
      });
      expect((await niveles(tour.id))[0].niveles.map((n) => n.nombre)).toEqual([
        '500',
        '250',
      ]);
    });

    it('**una tabla desordenada responde 400**, y el mensaje nombra la fila', async () => {
      const tour = await unTour();
      const temporada = await unaTemporada(tour.id);

      const respuesta = await comoAdmin(
        'post',
        `/temporadas/${temporada.id}/niveles`,
      )
        .send({ nombre: '500', tabla: { ...NIVEL_500, semifinal: 400 } })
        .expect(400);

      expect((respuesta.body as { message: string }).message).toContain(
        'La semifinal no puede dar más puntos que la final',
      );
    });

    it('el mismo nombre en la misma temporada es 409', async () => {
      const tour = await unTour();
      const temporada = await unaTemporada(tour.id);
      await unNivel(temporada.id);

      await comoAdmin('post', `/temporadas/${temporada.id}/niveles`)
        .send({ nombre: '500', tabla: NIVEL_500 })
        .expect(409);
    });

    it('se corrigen el nombre o la tabla entera; la tabla, siempre completa', async () => {
      const tour = await unTour();
      const temporada = await unaTemporada(tour.id);
      const nivel = await unNivel(temporada.id);

      const editado = (
        await comoAdmin('patch', `/niveles/${nivel.id}`)
          .send({ nombre: 'Máster', tabla: { ...NIVEL_500, campeon: 1000 } })
          .expect(200)
      ).body as Nivel;

      expect(editado).toMatchObject({
        nombre: 'Máster',
        tabla: { campeon: 1000 },
      });

      // Media tabla no: la regla compara las filas entre sí.
      await comoAdmin('patch', `/niveles/${nivel.id}`)
        .send({ tabla: { campeon: 2000 } })
        .expect(400);
    });

    it('**crear una temporada copia los niveles de la más reciente**, como filas nuevas', async () => {
      const tour = await unTour();
      const de2026 = await unaTemporada(tour.id, {
        nombre: '2026',
        fechaInicio: '2026-03-01',
        fechaFin: '2026-12-15',
      });
      const de2027 = await unaTemporada(tour.id);
      await unNivel(de2026.id, 'Viejo');
      const quinientos = await unNivel(de2027.id, '500');

      const de2028 = await unaTemporada(tour.id, {
        nombre: '2028',
        fechaInicio: '2028-03-01',
        fechaFin: '2028-12-15',
      });

      const temporadas = await niveles(tour.id);
      const copia = temporadas.find((t) => t.nombre === '2028')!.niveles;

      // De 2027, que es la de inicio más reciente, y no de 2026.
      expect(copia.map((n) => n.nombre)).toEqual(['500']);
      expect(copia[0].tabla).toEqual(NIVEL_500);
      expect(copia[0].id).not.toBe(quinientos.id);
      expect(de2028).toMatchObject({ nombre: '2028' });
    });

    it('**editar la copia no toca el original** (D14)', async () => {
      const tour = await unTour();
      const de2027 = await unaTemporada(tour.id);
      await unNivel(de2027.id);
      await unaTemporada(tour.id, {
        nombre: '2028',
        fechaInicio: '2028-03-01',
        fechaFin: '2028-12-15',
      });

      const antes = await niveles(tour.id);
      const copia = antes.find((t) => t.nombre === '2028')!.niveles[0];

      await comoAdmin('patch', `/niveles/${copia.id}`)
        .send({ tabla: { ...NIVEL_500, campeon: 800 } })
        .expect(200);

      const despues = await niveles(tour.id);
      expect(
        despues.find((t) => t.nombre === '2027')!.niveles[0].tabla.campeon,
      ).toBe(500);
      expect(
        despues.find((t) => t.nombre === '2028')!.niveles[0].tabla.campeon,
      ).toBe(800);
    });

    it('la primera temporada de un tour nace sin niveles', async () => {
      const tour = await unTour();
      await unaTemporada(tour.id);

      expect((await niveles(tour.id))[0].niveles).toEqual([]);
    });

    it('**la ficha dice en cuántos torneos se usa cada nivel, y cuántos ya terminaron**', async () => {
      // Es lo que necesita el aviso del panel antes de cambiar una tabla (T192).
      const tour = await unTour();
      const temporada = await unaTemporada(tour.id);
      const nivel = await unNivel(temporada.id);
      await asociar(tour.id, nivel.id, 'FINALIZADO');
      await asociar(tour.id, nivel.id, 'FINALIZADO');
      await asociar(tour.id, nivel.id);

      expect((await niveles(tour.id))[0].niveles[0]).toMatchObject({
        torneos: 3,
        torneosTerminados: 2,
      });
    });

    it('**un nivel con torneos no se borra**; uno sin torneos, sí', async () => {
      const tour = await unTour();
      const temporada = await unaTemporada(tour.id);
      const conTorneo = await unNivel(temporada.id, '500');
      const vacio = await unNivel(temporada.id, '250', {
        campeon: 250,
        finalista: 150,
        semifinal: 90,
        cuartos: 45,
        octavos: 20,
        dieciseisavos: 10,
        treintaidosavos: 5,
      });
      await asociar(tour.id, conTorneo.id);

      const respuesta = await comoAdmin(
        'delete',
        `/niveles/${conTorneo.id}`,
      ).expect(409);
      expect((respuesta.body as { message: string }).message).toContain(
        '1 torneo',
      );

      await comoAdmin('delete', `/niveles/${vacio.id}`).expect(200);
      expect((await niveles(tour.id))[0].niveles.map((n) => n.nombre)).toEqual([
        '500',
      ]);
    });

    it('un nivel que no existe responde 404', async () => {
      await comoAdmin('patch', '/niveles/999999')
        .send({ nombre: 'x' })
        .expect(404);
      await comoAdmin('delete', '/niveles/999999').expect(404);
    });

    it('los niveles también son del admin: con sesión de socio, 403', async () => {
      const tour = await unTour();
      const temporada = await unaTemporada(tour.id);
      const nivel = await unNivel(temporada.id);

      await request(servidor())
        .post(`/api/admin/temporadas/${temporada.id}/niveles`)
        .set('Cookie', cookieSocio)
        .send({ nombre: '250', tabla: NIVEL_500 })
        .expect(403);
      await request(servidor())
        .patch(`/api/admin/niveles/${nivel.id}`)
        .set('Cookie', cookieSocio)
        .send({ nombre: 'x' })
        .expect(403);
    });
  });

  describe('borrar', () => {
    it('un tour sin torneos se borra con sus temporadas y sus niveles', async () => {
      const tour = await unTour();
      const temporada = await unaTemporada(tour.id);
      await prisma.nivelTemporada.create({
        data: {
          temporadaId: temporada.id,
          nombre: '250',
          puntosCampeon: 250,
          puntosFinalista: 150,
          puntosSemifinal: 90,
          puntosCuartos: 45,
          puntosOctavos: 20,
          puntosDieciseisavos: 10,
          puntosTreintaidosavos: 5,
        },
      });

      await comoAdmin('delete', `/tours/${tour.id}`).expect(200);

      expect(await prisma.tour.count({ where: { id: tour.id } })).toBe(0);
      expect(
        await prisma.temporadaTour.count({ where: { tourId: tour.id } }),
      ).toBe(0);
      expect(
        await prisma.nivelTemporada.count({
          where: { temporadaId: temporada.id },
        }),
      ).toBe(0);
    });

    it('**un tour con torneos no se borra, y el mensaje dice cuántos**', async () => {
      const tour = await unTour();
      const temporada = await unaTemporada(tour.id);
      await unTorneoEn(tour.id, temporada.id);
      await unTorneoEn(tour.id, temporada.id);

      const respuesta = await comoAdmin('delete', `/tours/${tour.id}`).expect(
        409,
      );

      expect((respuesta.body as { message: string }).message).toContain(
        '2 torneos',
      );
      expect(await prisma.tour.count({ where: { id: tour.id } })).toBe(1);
    });

    it('**una temporada con torneos tampoco**; una sin torneos, sí', async () => {
      const tour = await unTour();
      const conTorneo = await unaTemporada(tour.id);
      const vacia = await unaTemporada(tour.id, { nombre: '2028' });
      await unTorneoEn(tour.id, conTorneo.id);

      const respuesta = await comoAdmin(
        'delete',
        `/temporadas/${conTorneo.id}`,
      ).expect(409);
      expect((respuesta.body as { message: string }).message).toContain(
        '1 torneo',
      );

      await comoAdmin('delete', `/temporadas/${vacia.id}`).expect(200);
      expect(
        await prisma.temporadaTour.count({ where: { tourId: tour.id } }),
      ).toBe(1);
    });

    it('**la base lo impide aunque el servicio no mirara**: el Restrict de torneo_tour', async () => {
      // El servicio cuenta antes para dar un buen mensaje, pero lo que no se puede
      // saltar es la base: si alguien borra sin pasar por él, la cascada choca acá.
      const tour = await unTour();
      const temporada = await unaTemporada(tour.id);
      await unTorneoEn(tour.id, temporada.id);

      await expect(
        prisma.tour.delete({ where: { id: tour.id } }),
      ).rejects.toThrow();
      expect(
        await prisma.temporadaTour.count({ where: { tourId: tour.id } }),
      ).toBe(1);
    });
  });

  it('**el panel de tours es del admin**: sin sesión 401, con sesión de socio 403', async () => {
    const tour = await unTour();

    await request(servidor()).get('/api/admin/tours').expect(401);
    for (const [metodo, ruta] of [
      ['get', '/api/admin/tours'],
      ['post', '/api/admin/tours'],
      ['patch', `/api/admin/tours/${tour.id}`],
      ['delete', `/api/admin/tours/${tour.id}`],
      ['post', `/api/admin/tours/${tour.id}/temporadas`],
    ] as const) {
      await request(servidor())
        [metodo](ruta)
        .set('Cookie', cookieSocio)
        .expect(403);
    }
  });
});
