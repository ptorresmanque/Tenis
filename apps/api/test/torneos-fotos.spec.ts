import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';

import { sembrarCategoriasDeJuego } from '../prisma/seed-torneos';
import { AppModule } from '../src/app.module';
import { carpetaDeSubidas } from '../src/comun/imagenes';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T69: las fotos del torneo.
 *
 * Lo que más cuida este archivo son las **dos reglas de servido**: la foto se ve sin
 * cuenta y el comprobante de pago no. Son dos carpetas con dos reglas, y el error que
 * importa —el que un test tiene que impedir— es que alguna vez se sirvan igual: el
 * comprobante lleva el nombre, el banco y el número de cuenta de una persona.
 *
 * Lo segundo es que **el EXIF no sobreviva**. Una foto de celular lleva las coordenadas
 * de dónde se tomó, y publicarla entera es publicar eso sin que nadie lo decida.
 */
describe('Fotos del torneo', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;
  let carpeta: string;

  const MARCA = 'Copa fotografiada';
  const APELLIDO = 'Fotografiado';
  const DOMINIO = '@fotos.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  /** Lo que la API devuelve de una foto. Tipado acá: `body` llega como `any`. */
  interface FotoPublicada {
    id: number;
    partidoId: number | null;
    momento: string;
    descripcion: string | null;
    miniatura: string;
    imagen: string;
  }

  let torneoId: number;
  let partidoId: number;
  let cuadroId: number;
  let cuartaId: number;

  /** Una foto como la que saca un celular: grande y con coordenadas adentro. */
  const unaFoto = (ancho = 4000, alto = 3000) =>
    sharp({
      create: {
        width: ancho,
        height: alto,
        channels: 3,
        background: { r: 40, g: 120, b: 60 },
      },
    })
      .withExif({ IFD0: { Copyright: 'Alguien', Artist: 'Su teléfono' } })
      .jpeg()
      .toBuffer();

  /**
   * Una foto de celular, fabricada una sola vez.
   *
   * Se arma en `beforeAll` y no en cada llamada para que `subir` sea sincrónico: un
   * helper `async` devuelve una promesa y `.expect(201)` no existe sobre ella.
   */
  let bytesDeLaFoto: Buffer;

  const subir = (extra: Record<string, string> = {}) => {
    const peticion = request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/fotos`)
      .set('Cookie', cookieAdmin);

    // Los campos antes del archivo: es el orden en que un formulario los manda.
    for (const [campo, valor] of Object.entries(extra)) {
      void peticion.field(campo, valor);
    }

    return peticion.attach('foto', bytesDeLaFoto, 'cancha.jpg');
  };

  let siguienteTelefono = 0;
  const unTelefono = () =>
    `5697${String(1_000_000 + (siguienteTelefono += 1)).slice(-7)}`;

  const limpiar = async () => {
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatFoto' } },
    });
  };

  /** Un cuadro de dos, para tener un partido de verdad al que colgarle una foto. */
  const unTorneoJugado = async () => {
    const categoria = await prisma.categoriaTorneo.create({
      data: {
        nombre: `CatFoto ${Date.now()}${Math.random()}`,
        puntosCampeon: 250,
      },
    });

    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}`,
        fechaInicio: new Date('2027-12-04T00:00:00.000Z'),
        fechaFin: new Date('2027-12-05T00:00:00.000Z'),
        cierreInscripcion: new Date('2027-11-25T00:00:00.000Z'),
        cuadros: {
          create: {
            categoriaJuegoId: cuartaId,
            cupo: 2,
            categoriaId: categoria.id,
          },
        },
      },
      select: { id: true, cuadros: { select: { id: true } } },
    });

    for (const nombre of ['Pedro', 'Andrés']) {
      const jugador = await prisma.jugador.create({
        data: { nombre, apellido: APELLIDO, telefono: unTelefono() },
      });

      await prisma.inscripcionTorneo.create({
        data: {
          torneoId: torneo.id,
          torneoCategoriaId: torneo.cuadros[0].id,
          jugadorId: jugador.id,
        },
      });
    }

    await request(app.getHttpServer())
      .post(`/api/admin/cuadros/${torneo.cuadros[0].id}/armar`)
      .set('Cookie', cookieAdmin)
      .expect(201);

    const partido = await prisma.partido.findFirstOrThrow({
      where: { torneoCategoriaId: torneo.cuadros[0].id },
    });

    return {
      torneoId: torneo.id,
      cuadroId: torneo.cuadros[0].id,
      partidoId: partido.id,
    };
  };

  beforeAll(async () => {
    bytesDeLaFoto = await unaFoto();
    carpeta = await mkdtemp(join(tmpdir(), 'fotos-'));
    process.env.SUBIDAS_DIR = carpeta;

    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    await sembrarCategoriasDeJuego(prisma);

    const cuarta = await prisma.categoriaJuego.findFirstOrThrow({
      where: { nombre: '4ª' },
    });
    cuartaId = cuarta.id;

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
          apellido: 'Fotos',
          esAdmin,
        },
      });
    }

    const entrar = async (sufijo: string) => {
      const respuesta = await request(app.getHttpServer())
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

  afterAll(async () => {
    await limpiar();
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    delete process.env.SUBIDAS_DIR;
    await rm(carpeta, { recursive: true, force: true });
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();
    const armado = await unTorneoJugado();
    torneoId = armado.torneoId;
    cuadroId = armado.cuadroId;
    partidoId = armado.partidoId;
  });

  it('**la foto llega al disco sin su EXIF**, en dos tamaños', async () => {
    // Obligatorio. Una foto de celular lleva las coordenadas de dónde se tomó; el
    // `Copyright` hace de sustituto porque viaja en el mismo bloque y se descarta igual.
    const original = await unaFoto();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const foto = (await subir().expect(201)).body as FotoPublicada;

    const fila = await prisma.fotoTorneo.findUniqueOrThrow({
      where: { id: foto.id },
    });

    for (const ruta of [fila.rutaWeb, fila.rutaMiniatura]) {
      const guardada = await sharp(join(carpetaDeSubidas(), ruta)).metadata();

      expect(guardada.exif).toBeUndefined();
      expect(guardada.width).toBeLessThan(4000);
    }

    // La miniatura pesa menos que la versión web: es la razón de existir de las dos.
    const pesoWeb = (await stat(join(carpetaDeSubidas(), fila.rutaWeb))).size;
    const pesoMini = (await stat(join(carpetaDeSubidas(), fila.rutaMiniatura)))
      .size;

    expect(pesoMini).toBeLessThan(pesoWeb);
    expect(pesoWeb).toBeLessThan(original.length);
  });

  it('**las fotos se ven sin cuenta y el comprobante no**', async () => {
    // Obligatorio, y el mismo test recorre las dos rutas a propósito: el error que
    // importa es que alguna vez se sirvan con la misma regla.
    const foto = (await subir().expect(201)).body as FotoPublicada;

    await request(app.getHttpServer()).get(foto.miniatura).expect(200);

    await request(app.getHttpServer()).get(foto.imagen).expect(200);

    const inscripcion = await prisma.inscripcionTorneo.findFirstOrThrow({
      where: { torneoId },
    });

    // Sin sesión y con sesión de socio: las dos rebotan. 401 en la primera y 403 en
    // la segunda porque son cosas distintas —no dijiste quién eres, y no te alcanza—,
    // y lo que este test fija es que ninguna de las dos ve el archivo.
    await request(app.getHttpServer())
      .get(`/api/admin/inscripciones/${inscripcion.id}/comprobante`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`/api/admin/inscripciones/${inscripcion.id}/comprobante`)
      .set('Cookie', cookieSocio)
      .expect(403);
  });

  it('**un archivo que no es imagen falla y no deja nada en disco**', async () => {
    const antes = await prisma.fotoTorneo.count({ where: { torneoId } });

    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/fotos`)
      .set('Cookie', cookieAdmin)
      .attach('foto', Buffer.from('<?php echo 1; ?>'), 'foto.jpg')
      .expect(400);

    expect(await prisma.fotoTorneo.count({ where: { torneoId } })).toBe(antes);
  });

  it('la galería devuelve direcciones y **nunca la ruta del disco**', async () => {
    await subir({ descripcion: 'La entrega de premios' }).expect(201);

    const galeria = (
      await request(app.getHttpServer())
        .get(`/api/torneos/${torneoId}/fotos`)
        .expect(200)
    ).body as FotoPublicada[];

    expect(galeria).toHaveLength(1);
    expect(galeria[0].descripcion).toBe('La entrega de premios');
    expect(galeria[0].miniatura).toMatch(
      /^\/api\/torneos\/fotos\/\d+\/miniatura$/,
    );
    // La ruta del disco no viaja: si saliera, alguien podría pedir otro nombre.
    expect(JSON.stringify(galeria)).not.toContain('.jpg');
  });

  it('**la foto de un partido sale en la galería y en su ficha**', async () => {
    // Es el uso que el club más va a darle: los dos jugadores antes de salir a jugar.
    await subir({ partidoId: String(partidoId), momento: 'ANTES' }).expect(201);

    const galeria = (
      await request(app.getHttpServer())
        .get(`/api/torneos/${torneoId}/fotos`)
        .expect(200)
    ).body as FotoPublicada[];

    const delPartido = (
      await request(app.getHttpServer())
        .get(`/api/torneos/partidos/${partidoId}/fotos`)
        .expect(200)
    ).body as FotoPublicada[];

    expect(galeria).toHaveLength(1);
    expect(delPartido).toHaveLength(1);
    expect(delPartido[0].momento).toBe('ANTES');
  });

  it('**un partido de otro torneo se rechaza**: la foto saldría en dos lados', async () => {
    const otro = await unTorneoJugado();

    const respuesta = await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/fotos`)
      .set('Cookie', cookieAdmin)
      .field('partidoId', String(otro.partidoId))
      .attach('foto', bytesDeLaFoto, 'cancha.jpg')
      .expect(400);

    expect((respuesta.body as { message: string }).message).toContain(
      'no es de este torneo',
    );
  });

  it('subir una foto exige ser admin', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/fotos`)
      .set('Cookie', cookieSocio)
      .attach('foto', bytesDeLaFoto, 'cancha.jpg')
      .expect(403);
  });

  it('**borrar la foto se lleva sus dos archivos**', async () => {
    const foto = (await subir().expect(201)).body as FotoPublicada;

    const fila = await prisma.fotoTorneo.findUniqueOrThrow({
      where: { id: foto.id },
    });

    await request(app.getHttpServer())
      .delete(`/api/admin/torneos/${torneoId}/fotos/${foto.id}`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    for (const ruta of [fila.rutaWeb, fila.rutaMiniatura]) {
      await expect(stat(join(carpetaDeSubidas(), ruta))).rejects.toThrow();
    }

    expect(await prisma.fotoTorneo.count({ where: { torneoId } })).toBe(0);
  });

  it('borrar una foto de otro torneo responde 404', async () => {
    const foto = (await subir().expect(201)).body as FotoPublicada;
    const otro = await unTorneoJugado();

    await request(app.getHttpServer())
      .delete(`/api/admin/torneos/${otro.torneoId}/fotos/${foto.id}`)
      .set('Cookie', cookieAdmin)
      .expect(404);
  });

  it('**deshacer el cuadro no borra las fotos del torneo**', async () => {
    // La foto de los dos jugadores sigue siendo una foto del torneo: perderla por un
    // cambio administrativo sería borrar el recuerdo.
    await subir({ partidoId: String(partidoId) }).expect(201);

    await request(app.getHttpServer())
      .post(`/api/admin/cuadros/${cuadroId}/deshacer`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    const quedan = await prisma.fotoTorneo.findMany({ where: { torneoId } });

    expect(quedan).toHaveLength(1);
    expect(quedan[0].partidoId).toBeNull();
  });

  it('un pie de foto de más de 200 letras se rechaza', async () => {
    await subir({ descripcion: 'x'.repeat(201) }).expect(400);
  });
});
