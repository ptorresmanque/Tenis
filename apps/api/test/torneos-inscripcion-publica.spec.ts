import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { sembrarCategoriasDeJuego } from '../prisma/seed-torneos';
import { EstadoTorneo } from '../src/generated/prisma/client';
import { FALLOS_TOLERADOS, IntentosFallidos } from '../src/identidad/intentos';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T64: el jugador se inscribe solo, desde la calle y sin cuenta.
 *
 * **Es el único endpoint de este módulo sin sesión**, así que lo que no se compruebe
 * acá no se comprueba en ninguna parte: lo que llega es un desconocido escribiendo en
 * un formulario. La mitad de este archivo son rechazos, y eso es lo correcto.
 */
describe('POST /api/torneos/:id/inscripcion', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let envios: IntentosFallidos;

  /**
   * La llave del freno, tal como la arma el controlador.
   *
   * En los tests todas las peticiones salen de la misma IP y **comparten el contador**,
   * así que sin perdonarla entre tests el sexto test recibe un 429 por culpa del
   * quinto. Que haga falta esto es, en sí, la prueba de que el freno está puesto.
   */
  const LLAVE = 'inscripcion|::ffff:127.0.0.1';

  const MARCA = 'Copa abierta';
  const APELLIDO = 'DeLaCalle';
  const DOMINIO = '@abierta.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  /** Sesión de admin: la lista del panel es la única que muestra las restricciones. */
  let cookieAdmin: string;

  let torneoId: number;
  let cuartaId: number;
  let honorId: number;

  const inscribirse = (cuerpo: Record<string, unknown>, torneo = torneoId) =>
    request(app.getHttpServer())
      .post(`/api/torneos/${torneo}/inscripcion`)
      .send(cuerpo);

  /** Los datos válidos, para que cada test cambie solo lo que está probando. */
  const validos = (extra: Record<string, unknown> = {}) => ({
    nombre: 'Rodrigo',
    apellido: APELLIDO,
    telefono: `+56 9 8${Math.floor(Math.random() * 10_000_000)
      .toString()
      .padStart(7, '0')}`,
    procedencia: 'Club de Ñuñoa',
    categoriaJuegoId: cuartaId,
    ...extra,
  });

  const idDe = async (nombre: string) =>
    (await prisma.categoriaJuego.findUniqueOrThrow({ where: { nombre } })).id;

  const limpiar = async () => {
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatAbierta' } },
    });
  };

  const crearTorneo = async (extra: Record<string, unknown> = {}) => {
    const categoria = await prisma.categoriaTorneo.create({
      data: {
        nombre: `CatAbierta ${Date.now()}${Math.random()}`,
        puntosCampeon: 250,
      },
    });

    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}`,
        fechaInicio: new Date('2027-12-01T00:00:00.000Z'),
        fechaFin: new Date('2027-12-07T00:00:00.000Z'),
        cierreInscripcion: new Date('2027-11-25T00:00:00.000Z'),
        ...extra,
        cuadros: {
          create: [
            {
              categoriaId: categoria.id,
              categoriaJuegoId: await idDe('4ª'),
              cupo: 2,
            },
            {
              categoriaId: categoria.id,
              categoriaJuegoId: await idDe('Honor'),
              cupo: 4,
            },
          ],
        },
      },
      select: {
        id: true,
        cuadros: {
          select: { id: true, categoriaJuegoId: true },
          orderBy: { categoriaJuego: { orden: 'asc' } },
        },
      },
    });

    return torneo;
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    envios = app.get(IntentosFallidos);
    await sembrarCategoriasDeJuego(prisma);
    cuartaId = await idDe('4ª');
    honorId = await idDe('Honor');

    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `jefa${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: 'Jefa',
        apellido: 'De la calle',
      })
      .expect(201);
    await prisma.usuario.update({
      where: { email: `jefa${DOMINIO}` },
      data: { esAdmin: true },
    });
    const sesion = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `jefa${DOMINIO}`, contrasena: CONTRASENA })
      .expect(204);
    cookieAdmin = (sesion.headers['set-cookie'] as unknown as string[])[0];
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
    envios.perdonar(LLAVE);
    torneoId = (await crearTorneo()).id;
  });

  it('un desconocido se inscribe y queda dentro del cuadro', async () => {
    const respuesta = await inscribirse(validos()).expect(201);

    expect(respuesta.body).toMatchObject({
      estado: 'INSCRITA',
      categoria: '4ª',
      jugador: `Rodrigo ${APELLIDO}`,
    });
  });

  it('**el teléfono escrito de tres formas cae en el mismo jugador**', async () => {
    // Es la defensa contra el problema que abre el formulario público: quien escribe
    // el nombre es el propio jugador, y sin esta reutilización el ranking suma los
    // puntos de la misma persona en tres filas distintas.
    const formas = ['+56 9 8765 4321', '56987654321', '9 8765 4321'];

    for (const telefono of formas) {
      const otro = await crearTorneo();
      await inscribirse(validos({ telefono }), otro.id).expect(201);
    }

    expect(await prisma.jugador.count({ where: { apellido: APELLIDO } })).toBe(
      1,
    );
  });

  it('**reutilizar conserva el id, que es lo que hace que sus puntos sigan siendo suyos**', async () => {
    const primera = await inscribirse(
      validos({ telefono: '+56 9 8765 4321' }),
    ).expect(201);
    const jugador = await prisma.jugador.findFirstOrThrow({
      where: { telefono: '56987654321' },
    });

    const otro = await crearTorneo();
    await inscribirse(validos({ telefono: '56987654321' }), otro.id).expect(
      201,
    );

    const despues = await prisma.jugador.findFirstOrThrow({
      where: { telefono: '56987654321' },
    });
    expect(despues.id).toBe(jugador.id);
    // **Y su nombre no se toca.** Este test decía lo contrario, y con eso daba por
    // buena la vulnerabilidad: desde un formulario público, "actualizar los datos de
    // contacto" es dejar que un desconocido reescriba la ficha de otro.
    expect(despues.nombre).toBe('Rodrigo');
    expect(primera.status).toBe(201);
  });

  it('**el padre y sus hijos comparten teléfono y son personas distintas**', async () => {
    // Lo encontró el club usando el formulario: con el teléfono solo de llave, el
    // segundo hijo era el primero otra vez y recibía un "ya estás inscrito" que nadie
    // entendía. La llave es el teléfono **más** el nombre y los apellidos.
    const telefono = '+56 9 8765 4321';

    await inscribirse(validos({ telefono, nombre: 'Pedro' })).expect(201);

    const hijo = await inscribirse(
      validos({ telefono, nombre: 'Matías' }),
    ).expect(201);

    expect((hijo.body as { jugador: string }).jugador).toBe(
      `Matías ${APELLIDO}`,
    );
    expect(
      await prisma.jugador.count({ where: { telefono: '56987654321' } }),
    ).toBe(2);
  });

  it('**el rechazo por duplicado dice de quién es la inscripción que ya existe**', async () => {
    // Sin el nombre, quien inscribe a su hijo lee "ya estás inscrito" y no tiene cómo
    // saber que el sistema lo confundió con él mismo.
    const suyo = { nombre: 'Pedro', telefono: '+56 9 8765 4321' };
    await inscribirse(validos(suyo)).expect(201);

    // El mismo trío: es la misma persona anotándose dos veces.
    const repetida = await inscribirse(validos(suyo)).expect(409);

    expect((repetida.body as { message: string }).message).toContain(
      `Pedro ${APELLIDO}`,
    );
  });

  it('guarda de qué club viene, que es lo que el club quiere saber', async () => {
    await inscribirse(validos({ procedencia: 'Club Manquehue' })).expect(201);

    const jugador = await prisma.jugador.findFirstOrThrow({
      where: { apellido: APELLIDO },
    });
    expect(jugador.procedencia).toBe('Club Manquehue');
  });

  it('**pasado el cupo se entra en lista de espera, no se rechaza**', async () => {
    // El cupo de 4ª es 2.
    await inscribirse(validos()).expect(201);
    await inscribirse(validos()).expect(201);

    const tercera = await inscribirse(validos()).expect(201);
    expect((tercera.body as { estado: string }).estado).toBe('LISTA_ESPERA');
  });

  it('**el mismo jugador no entra en dos categorías del mismo torneo**', async () => {
    const telefono = '+56 9 8765 4321';

    await inscribirse(validos({ telefono })).expect(201);
    await inscribirse(validos({ telefono, categoriaJuegoId: honorId })).expect(
      409,
    );
  });

  describe('la restricción horaria (T65)', () => {
    const martes = { diaSemana: 2, horaDesde: '18:00', horaHasta: '21:00' };
    const jueves = { diaSemana: 4, horaDesde: '09:00', horaHasta: '12:00' };

    /** La lista del panel, que es la única que las muestra. */
    const enElPanel = async () => {
      const cuadro = await prisma.torneoCategoria.findFirstOrThrow({
        where: { torneoId, categoriaJuegoId: cuartaId },
      });
      const respuesta = await request(app.getHttpServer())
        .get(`/api/admin/cuadros/${cuadro.id}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .expect(200);

      return respuesta.body as {
        inscritos: { restricciones: unknown[]; procedencia: string | null }[];
      };
    };

    it('se guardan con la inscripción, en el mismo envío', async () => {
      await inscribirse(validos({ restricciones: [martes, jueves] })).expect(
        201,
      );

      const lista = await enElPanel();
      expect(lista.inscritos[0].restricciones).toHaveLength(2);
    });

    it('no tener ninguna es válido: no todos tienen horario que declarar', async () => {
      await inscribirse(validos()).expect(201);

      expect((await enElPanel()).inscritos[0].restricciones).toHaveLength(0);
    });

    it('**el sábado y el domingo se rechazan**', async () => {
      for (const diaSemana of [0, 6]) {
        await inscribirse(
          validos({ restricciones: [{ ...martes, diaSemana }] }),
        ).expect(400);
      }
    });

    it('de lunes a viernes se aceptan', async () => {
      await inscribirse(
        validos({
          restricciones: [1, 2, 3, 4, 5].map((diaSemana) => ({
            ...martes,
            diaSemana,
          })),
        }),
      ).expect(201);

      expect((await enElPanel()).inscritos[0].restricciones).toHaveLength(5);
    });

    it('**una franja que termina antes de empezar se rechaza**', async () => {
      await inscribirse(
        validos({
          restricciones: [
            { diaSemana: 2, horaDesde: '21:00', horaHasta: '18:00' },
          ],
        }),
      ).expect(400);
    });

    it('**una franja mala no deja la inscripción a medias**', async () => {
      // Todo va en la misma transacción: si la validación cae, no queda ni el jugador
      // ni la inscripción ni media lista de franjas.
      const antes = await prisma.jugador.count({
        where: { apellido: APELLIDO },
      });

      await inscribirse(
        validos({ restricciones: [martes, { ...martes, diaSemana: 6 }] }),
      ).expect(400);

      expect(
        await prisma.jugador.count({ where: { apellido: APELLIDO } }),
      ).toBe(antes);
      expect(await prisma.restriccionHoraria.count()).toBe(0);
    });

    it('**no salen en la respuesta pública**', async () => {
      // Dicen a qué hora esa persona no está en su casa: es dato de seguridad de un
      // tercero. Se comprueba sobre el JSON entero, como el teléfono.
      await inscribirse(validos({ restricciones: [martes] })).expect(201);

      const cuadro = await prisma.torneoCategoria.findFirstOrThrow({
        where: { torneoId, categoriaJuegoId: cuartaId },
      });
      const publico = JSON.stringify(
        (
          await request(app.getHttpServer())
            .get(`/api/torneos/cuadros/${cuadro.id}`)
            .expect(200)
        ).body,
      );

      expect(publico).not.toContain('restriccion');
      expect(publico).not.toContain('18:00');
    });

    it('se van con la inscripción cuando el torneo se borra', async () => {
      await inscribirse(validos({ restricciones: [martes] })).expect(201);
      expect(await prisma.restriccionHoraria.count()).toBeGreaterThan(0);

      await prisma.torneo.delete({ where: { id: torneoId } });

      expect(await prisma.restriccionHoraria.count()).toBe(0);
    });
  });

  describe('lo que un desconocido NO puede hacerle a un jugador que ya existe', () => {
    /** Alguien del club, con su ficha y su teléfono ya cargados. */
    const conFicha = () =>
      prisma.jugador.create({
        data: {
          nombre: 'Carolina',
          apellido: APELLIDO,
          telefono: '56911223344',
          procedencia: 'Club FEDAL',
        },
      });

    it('**no puede reescribirle el nombre inscribiéndose con su teléfono**', async () => {
      // Los teléfonos chilenos son enumerables. Si reutilizar significara sobreescribir,
      // quien adivine uno le cambia el nombre a cualquiera desde internet y sin cuenta
      // — y ese nombre es el que sale en el ranking y en la lista pública del cuadro.
      const victima = await conFicha();

      await inscribirse(
        validos({
          telefono: '+56 9 1122 3344',
          nombre: 'HACKEADO',
          apellido: APELLIDO,
          procedencia: 'No existe',
        }),
      ).expect(201);

      const despues = await prisma.jugador.findUniqueOrThrow({
        where: { id: victima.id },
      });
      expect(despues.nombre).toBe('Carolina');
      expect(despues.procedencia).toBe('Club FEDAL');
    });

    it('**una inscripción rechazada no deja nada escrito**', async () => {
      // Lo encontró una sonda al revisar T64: el jugador se creaba o se actualizaba
      // antes de comprobar si la inscripción podía entrar, así que un 409 igual
      // modificaba la base.
      const victima = await conFicha();
      const cerrado = await crearTorneo({
        fechaInicio: new Date('2020-12-01T00:00:00.000Z'),
        fechaFin: new Date('2020-12-07T00:00:00.000Z'),
        cierreInscripcion: new Date('2020-11-25T00:00:00.000Z'),
      });

      await inscribirse(
        validos({ telefono: '+56 9 1122 3344', nombre: 'HACKEADO' }),
        cerrado.id,
      ).expect(409);

      const despues = await prisma.jugador.findUniqueOrThrow({
        where: { id: victima.id },
      });
      expect(despues.nombre).toBe('Carolina');
    });

    it('**un rechazo tampoco crea jugadores nuevos**', async () => {
      const antes = await prisma.jugador.count({
        where: { apellido: APELLIDO },
      });
      const cerrado = await crearTorneo({
        fechaInicio: new Date('2020-12-01T00:00:00.000Z'),
        fechaFin: new Date('2020-12-07T00:00:00.000Z'),
        cierreInscripcion: new Date('2020-11-25T00:00:00.000Z'),
      });

      await inscribirse(validos(), cerrado.id).expect(409);

      expect(
        await prisma.jugador.count({ where: { apellido: APELLIDO } }),
      ).toBe(antes);
    });

    it('sí se completa lo que estaba vacío: rellenar no le quita nada a nadie', async () => {
      // Con el nombre del formulario: la llave es el trío, así que quien vuelve es
      // quien escribe las tres cosas iguales. Con otro nombre sería otra persona y no
      // habría hueco que rellenar.
      const sinClub = await prisma.jugador.create({
        data: {
          nombre: 'Rodrigo',
          apellido: APELLIDO,
          telefono: '56955667788',
          procedencia: null,
        },
      });

      await inscribirse(
        validos({ telefono: '+56 9 5566 7788', procedencia: 'Club Manquehue' }),
      ).expect(201);

      const despues = await prisma.jugador.findUniqueOrThrow({
        where: { id: sinClub.id },
      });
      expect(despues.procedencia).toBe('Club Manquehue');
      expect(despues.nombre).toBe('Rodrigo');
    });
  });

  describe('lo que rechaza, que es la mitad de lo que hace', () => {
    it('una categoría que ese torneo no corre', async () => {
      const quinta = await idDe('5ª');

      await inscribirse(validos({ categoriaJuegoId: quinta })).expect(404);
    });

    it('un torneo que no existe', async () => {
      await inscribirse(validos(), 999999).expect(404);
    });

    it('la inscripción ya cerrada por fecha', async () => {
      const cerrado = await crearTorneo({
        fechaInicio: new Date('2020-12-01T00:00:00.000Z'),
        fechaFin: new Date('2020-12-07T00:00:00.000Z'),
        cierreInscripcion: new Date('2020-11-25T00:00:00.000Z'),
      });

      await inscribirse(validos(), cerrado.id).expect(409);
    });

    it('un cuadro que ya se armó', async () => {
      const torneo = await crearTorneo();
      await prisma.torneoCategoria.update({
        where: { id: torneo.cuadros[0].id },
        data: { semillaSorteo: 1 },
      });

      await inscribirse(validos(), torneo.id).expect(409);
    });

    it('un torneo cancelado', async () => {
      const torneo = await crearTorneo({ estado: EstadoTorneo.CANCELADO });

      await inscribirse(validos(), torneo.id).expect(409);
    });

    it('un teléfono que no es un teléfono', async () => {
      for (const telefono of ['123', '', 'no tengo', null]) {
        await inscribirse(validos({ telefono })).expect(400);
      }
    });

    it('un nombre vacío, o de una sola letra', async () => {
      await inscribirse(validos({ nombre: '' })).expect(400);
      await inscribirse(validos({ nombre: '   ' })).expect(400);
      await inscribirse(validos({ nombre: 'R' })).expect(400);
    });

    it('sin decir de dónde viene', async () => {
      await inscribirse(validos({ procedencia: '' })).expect(400);
    });

    it('una categoría que no es un número', async () => {
      await inscribirse(validos({ categoriaJuegoId: 'cuarta' })).expect(400);
    });

    it('**un cuerpo vacío, y sin reventar**', async () => {
      // Llega de la calle: puede ser cualquier cosa, incluida nada.
      await inscribirse({}).expect(400);
    });
  });

  it('**una inscripción rechazada no gasta cuota**', async () => {
    // El freno cuenta **cupos retenidos**, no envíos: es lo que dice el propio
    // `IntentosFallidos` —"cuenta fallos, no peticiones"— y acá importa más que en el
    // login, porque el club entero sale a internet por una sola IP. Quien se equivoca
    // escribiendo el teléfono corrige y manda de nuevo; castigarlo por eso lo deja
    // afuera de un torneo por un error de tipeo.
    for (let i = 0; i < FALLOS_TOLERADOS + 2; i += 1) {
      await inscribirse(validos({ telefono: '123' })).expect(400);
    }

    await inscribirse(validos()).expect(201);
  });

  it('**pasada la cuota, la misma IP recibe un 429**', async () => {
    // Se reusa `IntentosFallidos`, el mismo freno del login y del formulario de
    // contacto. La defensa principal es el cobro (T66), pero no cubre el camino del
    // comprobante ni un torneo gratis: esto queda abierto a cualquiera.
    for (let i = 0; i < FALLOS_TOLERADOS; i += 1) {
      const otro = await crearTorneo();
      await inscribirse(validos(), otro.id);
    }

    const respuesta = await inscribirse(validos());
    expect(respuesta.status).toBe(429);
  });
});
