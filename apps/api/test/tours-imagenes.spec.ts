import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { carpetaDeSubidas } from '../src/comun/imagenes';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T190: la imagen representativa y la galería de un tour.
 *
 * Las mismas reglas que las fotos de los torneos —sin EXIF, dos tamaños, servidas sin
 * cuenta y nunca con la ruta del disco—, más dos propias: **reemplazar la imagen borra la
 * anterior**, y **borrar un tour borra todos sus archivos**. Una fila menos no libera disco.
 */
describe('Imagen y galería de un tour', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;
  let carpeta: string;

  const DOMINIO = '@tours-imagenes.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Tour fotografiado';

  interface Foto {
    id: number;
    descripcion: string | null;
    miniatura: string;
    imagen: string;
  }

  interface Ficha {
    id: number;
    imagen: { miniatura: string; web: string } | null;
    fotos: Foto[];
  }

  let fotoDeCelular: Buffer;
  let fotoChica: Buffer;

  const unaFoto = (ancho: number, alto: number) =>
    sharp({
      create: {
        width: ancho,
        height: alto,
        channels: 3,
        background: { r: 11, g: 79, b: 158 },
      },
    })
      .withExif({ IFD0: { Copyright: 'Alguien', Artist: 'Su teléfono' } })
      .jpeg()
      .toBuffer();

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const unTour = async (): Promise<number> =>
    (
      (
        await request(servidor())
          .post('/api/admin/tours')
          .set('Cookie', cookieAdmin)
          .send({ nombre: `${MARCA} ${Date.now()}${Math.random()}` })
          .expect(201)
      ).body as { id: number }
    ).id;

  const ficha = async (id: number): Promise<Ficha> =>
    (
      await request(servidor())
        .get(`/api/admin/tours/${id}`)
        .set('Cookie', cookieAdmin)
        .expect(200)
    ).body as Ficha;

  const subirImagen = (
    tourId: number,
    bytes: Buffer = fotoChica,
    cookie = cookieAdmin,
  ) =>
    request(servidor())
      .post(`/api/admin/tours/${tourId}/imagen`)
      .set('Cookie', cookie)
      .attach('imagen', bytes, 'afiche.jpg');

  const subirFoto = (
    tourId: number,
    descripcion?: string,
    bytes: Buffer = fotoChica,
    cookie = cookieAdmin,
  ) => {
    const peticion = request(servidor())
      .post(`/api/admin/tours/${tourId}/fotos`)
      .set('Cookie', cookie);
    if (descripcion !== undefined)
      void peticion.field('descripcion', descripcion);
    return peticion.attach('foto', bytes, 'premiacion.jpg');
  };

  const existe = (ruta: string) =>
    access(join(carpetaDeSubidas(), ruta)).then(
      () => true,
      () => false,
    );

  /** Todo lo que quedó en la carpeta de un tour. */
  const archivosDe = (tourId: number) =>
    readdir(join(carpetaDeSubidas(), 'tours', String(tourId))).catch(
      () => [] as string[],
    );

  beforeAll(async () => {
    fotoDeCelular = await unaFoto(4000, 3000);
    fotoChica = await unaFoto(400, 300);
    carpeta = await mkdtemp(join(tmpdir(), 'tours-imagenes-'));
    process.env.SUBIDAS_DIR = carpeta;

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
          apellido: 'Imágenes',
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

  beforeEach(async () => {
    await prisma.tour.deleteMany({ where: { nombre: { startsWith: MARCA } } });
  });

  afterAll(async () => {
    await prisma.tour.deleteMany({ where: { nombre: { startsWith: MARCA } } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    delete process.env.SUBIDAS_DIR;
    await rm(carpeta, { recursive: true, force: true });
    await app.close();
  });

  describe('la imagen representativa', () => {
    it('**llega al disco sin su EXIF**, en dos tamaños, y la ficha da sus direcciones', async () => {
      const tourId = await unTour();
      expect((await ficha(tourId)).imagen).toBeNull();

      await subirImagen(tourId, fotoDeCelular).expect(201);

      const fila = await prisma.tour.findUniqueOrThrow({
        where: { id: tourId },
      });
      for (const ruta of [fila.imagenRutaWeb!, fila.imagenRutaMiniatura!]) {
        const guardada = await sharp(join(carpetaDeSubidas(), ruta)).metadata();

        expect(guardada.exif).toBeUndefined();
        expect(guardada.width).toBeLessThan(4000);
      }

      expect((await ficha(tourId)).imagen).toEqual({
        miniatura: `/api/tours/${tourId}/miniatura`,
        web: `/api/tours/${tourId}/imagen`,
      });
    });

    it('**se ve sin cuenta**, y se revalida en vez de quedar un año en caché', async () => {
      // Su dirección es la del tour, y no cambia al reemplazarla: con `immutable`, el
      // navegador seguiría mostrando la anterior.
      const tourId = await unTour();
      await subirImagen(tourId).expect(201);

      const imagen = await request(servidor())
        .get(`/api/tours/${tourId}/imagen`)
        .expect(200);
      await request(servidor())
        .get(`/api/tours/${tourId}/miniatura`)
        .expect(200);

      expect(imagen.headers['cache-control']).toContain('no-cache');
      expect(imagen.headers['etag']).toBeDefined();
    });

    it('un tour sin imagen responde 404 en las dos direcciones', async () => {
      const tourId = await unTour();

      await request(servidor()).get(`/api/tours/${tourId}/imagen`).expect(404);
      await request(servidor())
        .get(`/api/tours/${tourId}/miniatura`)
        .expect(404);
    });

    it('**reemplazarla borra los archivos de la anterior**', async () => {
      const tourId = await unTour();
      await subirImagen(tourId).expect(201);
      const antes = await prisma.tour.findUniqueOrThrow({
        where: { id: tourId },
      });

      await subirImagen(tourId).expect(201);

      expect(await existe(antes.imagenRutaWeb!)).toBe(false);
      expect(await existe(antes.imagenRutaMiniatura!)).toBe(false);
      expect(await archivosDe(tourId)).toHaveLength(2);
    });

    it('un archivo que no es imagen responde 400 y deja la anterior intacta', async () => {
      const tourId = await unTour();
      await subirImagen(tourId).expect(201);
      const antes = await prisma.tour.findUniqueOrThrow({
        where: { id: tourId },
      });

      await subirImagen(tourId, Buffer.from('<?php echo 1; ?>')).expect(400);

      const despues = await prisma.tour.findUniqueOrThrow({
        where: { id: tourId },
      });
      expect(despues.imagenRutaWeb).toBe(antes.imagenRutaWeb);
      expect(await archivosDe(tourId)).toHaveLength(2);
    });
  });

  describe('la galería', () => {
    it('sube con su pie, sin EXIF, y la ficha la muestra **sin la ruta del disco**', async () => {
      const tourId = await unTour();

      const foto = (
        await subirFoto(
          tourId,
          '  La premiación de 2027  ',
          fotoDeCelular,
        ).expect(201)
      ).body as Foto;

      expect(foto).toEqual({
        id: foto.id,
        descripcion: 'La premiación de 2027',
        miniatura: `/api/tours/fotos/${foto.id}/miniatura`,
        imagen: `/api/tours/fotos/${foto.id}/imagen`,
      });

      const fila = await prisma.fotoTour.findUniqueOrThrow({
        where: { id: foto.id },
      });
      expect(
        (await sharp(join(carpetaDeSubidas(), fila.rutaWeb)).metadata()).exif,
      ).toBeUndefined();

      const laFicha = await ficha(tourId);
      expect(laFicha.fotos).toEqual([foto]);
      expect(JSON.stringify(laFicha)).not.toContain('.jpg');
    });

    it('va de la más nueva a la más vieja, y sin pie el pie es nulo', async () => {
      const tourId = await unTour();
      const primera = (await subirFoto(tourId).expect(201)).body as Foto;
      const segunda = (await subirFoto(tourId).expect(201)).body as Foto;

      expect(primera.descripcion).toBeNull();
      expect((await ficha(tourId)).fotos.map((f) => f.id)).toEqual([
        segunda.id,
        primera.id,
      ]);
    });

    it('**se ve sin cuenta**, con un año de caché: la dirección es de esa foto y no cambia', async () => {
      const tourId = await unTour();
      const foto = (await subirFoto(tourId).expect(201)).body as Foto;

      const miniatura = await request(servidor())
        .get(foto.miniatura)
        .expect(200);
      await request(servidor()).get(foto.imagen).expect(200);

      expect(miniatura.headers['cache-control']).toContain('immutable');
    });

    it('el pie se corrige, y uno de más de 200 letras responde 400', async () => {
      const tourId = await unTour();
      const foto = (await subirFoto(tourId).expect(201)).body as Foto;

      const corregida = (
        await request(servidor())
          .patch(`/api/admin/tours/fotos/${foto.id}`)
          .set('Cookie', cookieAdmin)
          .send({ descripcion: 'El cuadro de Honor' })
          .expect(200)
      ).body as Foto;

      expect(corregida.descripcion).toBe('El cuadro de Honor');
      await subirFoto(tourId, 'a'.repeat(201)).expect(400);
    });

    it('**borrar una foto borra sus dos archivos**', async () => {
      const tourId = await unTour();
      const foto = (await subirFoto(tourId).expect(201)).body as Foto;
      const fila = await prisma.fotoTour.findUniqueOrThrow({
        where: { id: foto.id },
      });

      await request(servidor())
        .delete(`/api/admin/tours/fotos/${foto.id}`)
        .set('Cookie', cookieAdmin)
        .expect(200);

      expect(await existe(fila.rutaWeb)).toBe(false);
      expect(await existe(fila.rutaMiniatura)).toBe(false);
      await request(servidor()).get(foto.miniatura).expect(404);
    });

    it('un archivo que no es imagen falla y no deja nada', async () => {
      const tourId = await unTour();

      await subirFoto(
        tourId,
        undefined,
        Buffer.from('<?php echo 1; ?>'),
      ).expect(400);

      expect(await prisma.fotoTour.count({ where: { tourId } })).toBe(0);
      expect(await archivosDe(tourId)).toHaveLength(0);
    });
  });

  it('**borrar el tour borra todos sus archivos**: la imagen y la galería', async () => {
    const tourId = await unTour();
    await subirImagen(tourId).expect(201);
    await subirFoto(tourId).expect(201);
    await subirFoto(tourId).expect(201);
    expect(await archivosDe(tourId)).toHaveLength(6);

    await request(servidor())
      .delete(`/api/admin/tours/${tourId}`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    expect(await archivosDe(tourId)).toHaveLength(0);
  });

  it('**subir, corregir y borrar son del admin**: sin sesión 401, con sesión de socio 403', async () => {
    const tourId = await unTour();
    const foto = (await subirFoto(tourId).expect(201)).body as Foto;

    await request(servidor())
      .post(`/api/admin/tours/${tourId}/imagen`)
      .attach('imagen', fotoChica, 'afiche.jpg')
      .expect(401);
    await subirImagen(tourId, fotoChica, cookieSocio).expect(403);
    await subirFoto(tourId, undefined, fotoChica, cookieSocio).expect(403);
    await request(servidor())
      .patch(`/api/admin/tours/fotos/${foto.id}`)
      .set('Cookie', cookieSocio)
      .send({ descripcion: 'x' })
      .expect(403);
    await request(servidor())
      .delete(`/api/admin/tours/fotos/${foto.id}`)
      .set('Cookie', cookieSocio)
      .expect(403);
  });
});
