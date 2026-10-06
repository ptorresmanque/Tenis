import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { CATEGORIAS_DE_JUEGO, sembrarCategoriasDeJuego } from '../src/arranque';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T60: la categoría de juego del jugador.
 *
 * **No es `CategoriaTorneo`**, y esa confusión es lo que estos tests defienden.
 * `CategoriaTorneo` es el nivel del *torneo* —"Club 250", "Club 500"— y de su
 * `puntosCampeon` sale la escala entera del ranking. `CategoriaJuego` es el nivel del
 * *jugador* —5ª, 4ª, … Honor— y solo separa cuadros. Mezclarlas rompería
 * `SPEC-ranking.md` § De dónde salen los puntos.
 */
describe('Torneos: la categoría de juego', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;

  const DOMINIO = '@categorias.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  /**
   * Las de prueba se distinguen por el nombre y por un `orden` lejos del seed.
   *
   * `orden` es único en toda la tabla: usar 10 o 20 acá chocaría con las seis del
   * club y el test fallaría por una razón que no es la que está probando.
   */
  const MARCA = 'Prueba';
  const ORDEN_DE_PRUEBA = 900;

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'De categorías',
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

  interface CategoriaPublicada {
    id: number;
    nombre: string;
    orden: number;
    activa: boolean;
  }

  const categoriaDe = (respuesta: { body: unknown }) =>
    respuesta.body as CategoriaPublicada;

  const crear = (cuerpo: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/admin/categorias-juego')
      .set('Cookie', cookieAdmin)
      .send(cuerpo);

  const listar = async (query = '') => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/categorias-juego${query}`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as CategoriaPublicada[];
  };

  const limpiar = async () => {
    await prisma.categoriaJuego.deleteMany({
      where: { nombre: { startsWith: MARCA } },
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
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
    await sembrarCategoriasDeJuego(prisma);
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();

    await crearCuenta('jefa', true);
    cookieAdmin = await entrar('jefa');

    await crearCuenta('socio');
    cookieSocio = await entrar('socio');
  });

  it('el seed trae las seis categorías con que juega el club', async () => {
    const nombres = (await listar()).map((c) => c.nombre);

    for (const categoria of CATEGORIAS_DE_JUEGO) {
      expect(nombres).toContain(categoria.nombre);
    }
    expect(CATEGORIAS_DE_JUEGO).toHaveLength(6);
  });

  it('**volver a sembrar no deshace lo que el admin decidió, ni revienta**', async () => {
    // El caso real, y tiene que ser sobre una categoría **del seed**: el admin mueve
    // la 5ª de lugar y mete otra en el hueco que dejó. Un seed que reescriba `orden`
    // choca contra el único a mitad del bucle —que no es transaccional— y deja la
    // siembra por la mitad. Sobre una categoría de prueba no se probaría nada: el
    // seed no la toca.
    const quinta = await prisma.categoriaJuego.findUniqueOrThrow({
      where: { nombre: '5ª' },
    });

    try {
      await request(app.getHttpServer())
        .patch(`/api/admin/categorias-juego/${quinta.id}`)
        .set('Cookie', cookieAdmin)
        .send({ orden: ORDEN_DE_PRUEBA, activa: false })
        .expect(200);

      await crear({
        nombre: `${MARCA} Intrusa`,
        orden: quinta.orden,
      }).expect(201);

      // No debe lanzar.
      await sembrarCategoriasDeJuego(prisma);

      const despues = await prisma.categoriaJuego.findUniqueOrThrow({
        where: { id: quinta.id },
      });
      expect(despues.orden).toBe(ORDEN_DE_PRUEBA);
      expect(despues.activa).toBe(false);
    } finally {
      // La 5ª es del seed y la comparten las demás pruebas: se devuelve a su lugar
      // aunque el test falle, o el resto de la suite arrastra este desorden.
      await prisma.categoriaJuego.deleteMany({
        where: { nombre: `${MARCA} Intrusa` },
      });
      await prisma.categoriaJuego.update({
        where: { id: quinta.id },
        data: { orden: quinta.orden, activa: quinta.activa },
      });
    }
  });

  it('sembrar dos veces no duplica ninguna de las seis', async () => {
    await sembrarCategoriasDeJuego(prisma);

    const cuantas = await prisma.categoriaJuego.count({
      where: { nombre: { in: CATEGORIAS_DE_JUEGO.map((c) => c.nombre) } },
    });
    expect(cuantas).toBe(CATEGORIAS_DE_JUEGO.length);
  });

  it('**se ordenan por `orden` y nunca alfabéticamente**', async () => {
    // Es la razón de que el campo exista: "1ª" ordena antes que "5ª" y "Honor"
    // después de las dos, y ninguna de las tres es la posición correcta.
    await crear({ nombre: `${MARCA} Zeta`, orden: ORDEN_DE_PRUEBA }).expect(
      201,
    );
    await crear({
      nombre: `${MARCA} Alfa`,
      orden: ORDEN_DE_PRUEBA + 10,
    }).expect(201);

    const deLaPrueba = (await listar())
      .filter((c) => c.nombre.startsWith(MARCA))
      .map((c) => c.nombre);

    expect(deLaPrueba).toEqual([`${MARCA} Zeta`, `${MARCA} Alfa`]);
  });

  it('el seed queda de la más baja a la más alta: la 5ª primero, Honor al final', async () => {
    const delClub = (await listar()).filter((c) =>
      CATEGORIAS_DE_JUEGO.some((s) => s.nombre === c.nombre),
    );

    expect(delClub.at(0)?.nombre).toBe('5ª');
    expect(delClub.at(-1)?.nombre).toBe('Honor');
  });

  it('dos categorías no pueden compartir `orden`', async () => {
    await crear({ nombre: `${MARCA} Primera`, orden: ORDEN_DE_PRUEBA }).expect(
      201,
    );

    await crear({ nombre: `${MARCA} Segunda`, orden: ORDEN_DE_PRUEBA }).expect(
      409,
    );
  });

  it('dos categorías no pueden compartir nombre', async () => {
    await crear({ nombre: `${MARCA} Repetida`, orden: ORDEN_DE_PRUEBA }).expect(
      201,
    );

    await crear({
      nombre: `${MARCA} Repetida`,
      orden: ORDEN_DE_PRUEBA + 10,
    }).expect(409);
  });

  it('**desactivar una categoría la saca del selector sin borrarla**', async () => {
    // El club deja de ofrecer la 5ª este año. La fila se queda: los torneos que ya
    // la usaron siguen contando, y el año que viene se vuelve a activar sin
    // reescribirla.
    const categoria = categoriaDe(
      await crear({
        nombre: `${MARCA} Retirada`,
        orden: ORDEN_DE_PRUEBA,
      }).expect(201),
    );

    await request(app.getHttpServer())
      .patch(`/api/admin/categorias-juego/${categoria.id}`)
      .set('Cookie', cookieAdmin)
      .send({ activa: false })
      .expect(200);

    const activas = await listar('?activas=1');
    expect(activas.map((c) => c.id)).not.toContain(categoria.id);

    // Sigue existiendo, con su nombre y su lugar intactos.
    const guardada = await prisma.categoriaJuego.findUniqueOrThrow({
      where: { id: categoria.id },
    });
    expect(guardada.activa).toBe(false);
    expect(guardada.orden).toBe(ORDEN_DE_PRUEBA);
  });

  it('desactivar no obliga a repetir el nombre ni el orden', async () => {
    const categoria = categoriaDe(
      await crear({
        nombre: `${MARCA} Parcial`,
        orden: ORDEN_DE_PRUEBA,
      }).expect(201),
    );

    const respuesta = await request(app.getHttpServer())
      .patch(`/api/admin/categorias-juego/${categoria.id}`)
      .set('Cookie', cookieAdmin)
      .send({ activa: false })
      .expect(200);

    expect((respuesta.body as CategoriaPublicada).nombre).toBe(
      `${MARCA} Parcial`,
    );
  });

  it('el admin la reordena cambiando su número', async () => {
    const categoria = categoriaDe(
      await crear({
        nombre: `${MARCA} Movible`,
        orden: ORDEN_DE_PRUEBA,
      }).expect(201),
    );

    await request(app.getHttpServer())
      .patch(`/api/admin/categorias-juego/${categoria.id}`)
      .set('Cookie', cookieAdmin)
      .send({ orden: ORDEN_DE_PRUEBA + 50 })
      .expect(200);

    const guardada = await prisma.categoriaJuego.findUniqueOrThrow({
      where: { id: categoria.id },
    });
    expect(guardada.orden).toBe(ORDEN_DE_PRUEBA + 50);
  });

  it('moverla al lugar de otra se rechaza y dice por qué', async () => {
    await crear({ nombre: `${MARCA} Fija`, orden: ORDEN_DE_PRUEBA }).expect(
      201,
    );
    const otra = categoriaDe(
      await crear({
        nombre: `${MARCA} Otra`,
        orden: ORDEN_DE_PRUEBA + 10,
      }).expect(201),
    );

    await request(app.getHttpServer())
      .patch(`/api/admin/categorias-juego/${otra.id}`)
      .set('Cookie', cookieAdmin)
      .send({ orden: ORDEN_DE_PRUEBA })
      .expect(409);
  });

  it('sin nombre, o con un orden que no es un número, se rechaza', async () => {
    await crear({ orden: ORDEN_DE_PRUEBA }).expect(400);
    await crear({ nombre: `${MARCA} Sin orden` }).expect(400);
    await crear({ nombre: `${MARCA} Cero`, orden: 0 }).expect(400);
  });

  it('editar una categoría que no existe responde 404', async () => {
    await request(app.getHttpServer())
      .patch('/api/admin/categorias-juego/999999')
      .set('Cookie', cookieAdmin)
      .send({ activa: false })
      .expect(404);
  });

  it('solo el admin toca las categorías de juego', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/categorias-juego')
      .set('Cookie', cookieSocio)
      .send({ nombre: `${MARCA} Colada`, orden: ORDEN_DE_PRUEBA })
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/admin/categorias-juego')
      .expect(401);
  });
});
