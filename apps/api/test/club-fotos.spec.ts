import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { carpetaDeSubidas } from '../src/comun/imagenes';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T185: las fotos de la tienda y la cafetería.
 *
 * Las mismas reglas que las fotos de los torneos —sin EXIF, dos tamaños, servidas sin
 * cuenta y nunca con la ruta del disco— más un tope: **seis por lugar**. Es un bloque de
 * una página, no una galería.
 */
describe('Fotos de la tienda y la cafetería', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;
  let carpeta: string;

  const DOMINIO = '@fotos-del-club.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  /** Lo que la API devuelve de una foto. Tipado acá: `body` llega como `any`. */
  interface FotoPublicada {
    id: number;
    descripcion: string | null;
    miniatura: string;
    imagen: string;
  }

  type ClubPublico = {
    tienda: { fotos: FotoPublicada[] };
    cafeteria: { fotos: FotoPublicada[] };
  };

  /** Una foto como la que saca un celular: grande y con datos adentro. */
  let fotoDeCelular: Buffer;
  /** Una chica, para los casos que suben varias: procesarla es lo que tarda. */
  let fotoChica: Buffer;

  const unaFoto = (ancho: number, alto: number) =>
    sharp({
      create: {
        width: ancho,
        height: alto,
        channels: 3,
        background: { r: 160, g: 90, b: 40 },
      },
    })
      .withExif({ IFD0: { Copyright: 'Alguien', Artist: 'Su teléfono' } })
      .jpeg()
      .toBuffer();

  const subir = (
    lugar: string,
    bytes: Buffer = fotoChica,
    extra: Record<string, string> = {},
    cookie = cookieAdmin,
  ) => {
    const peticion = request(app.getHttpServer())
      .post('/api/admin/club/fotos')
      .set('Cookie', cookie)
      .field('lugar', lugar);

    for (const [campo, valor] of Object.entries(extra)) {
      void peticion.field(campo, valor);
    }

    return peticion.attach('foto', bytes, 'vitrina.jpg');
  };

  const existe = (ruta: string) =>
    access(join(carpetaDeSubidas(), ruta)).then(
      () => true,
      () => false,
    );

  const publico = async (): Promise<ClubPublico> =>
    (await request(app.getHttpServer()).get('/api/club').expect(200))
      .body as ClubPublico;

  beforeAll(async () => {
    fotoDeCelular = await unaFoto(4000, 3000);
    fotoChica = await unaFoto(400, 300);
    carpeta = await mkdtemp(join(tmpdir(), 'fotos-club-'));
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
          apellido: 'Fotos del club',
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

  beforeEach(async () => {
    await prisma.fotoLugar.deleteMany();
  });

  afterAll(async () => {
    await prisma.fotoLugar.deleteMany();
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    delete process.env.SUBIDAS_DIR;
    await rm(carpeta, { recursive: true, force: true });
    await app.close();
  });

  it('**la foto llega al disco sin su EXIF**, en dos tamaños', async () => {
    expect((await sharp(fotoDeCelular).metadata()).exif).toBeDefined();

    const foto = (await subir('TIENDA', fotoDeCelular).expect(201))
      .body as FotoPublicada;
    const fila = await prisma.fotoLugar.findUniqueOrThrow({
      where: { id: foto.id },
    });

    for (const ruta of [fila.rutaWeb, fila.rutaMiniatura]) {
      const guardada = await sharp(join(carpetaDeSubidas(), ruta)).metadata();

      expect(guardada.exif).toBeUndefined();
      expect(guardada.width).toBeLessThan(4000);
    }
  });

  it('el sitio la publica en su lugar, con su texto, y **sin la ruta del disco**', async () => {
    await subir('CAFETERIA', fotoChica, {
      descripcion: '  La barra del café  ',
    }).expect(201);

    const club = await publico();

    expect(club.tienda.fotos).toEqual([]);
    expect(club.cafeteria.fotos).toHaveLength(1);
    expect(club.cafeteria.fotos[0].descripcion).toBe('La barra del café');
    expect(club.cafeteria.fotos[0].miniatura).toMatch(
      /^\/api\/club\/fotos\/\d+\/miniatura$/,
    );
    expect(club.cafeteria.fotos[0].imagen).toMatch(
      /^\/api\/club\/fotos\/\d+\/imagen$/,
    );
    expect(JSON.stringify(club)).not.toContain('.jpg');
  });

  it('van en el orden en que se subieron: **la primera es la de la portada**', async () => {
    const primera = (await subir('TIENDA').expect(201)).body as FotoPublicada;
    const segunda = (await subir('TIENDA').expect(201)).body as FotoPublicada;

    expect((await publico()).tienda.fotos.map((f) => f.id)).toEqual([
      primera.id,
      segunda.id,
    ]);
  });

  it('**se ven sin cuenta**, las dos versiones', async () => {
    const foto = (await subir('TIENDA').expect(201)).body as FotoPublicada;

    const miniatura = await request(app.getHttpServer())
      .get(foto.miniatura)
      .expect(200);
    await request(app.getHttpServer()).get(foto.imagen).expect(200);

    // Un año de caché: el nombre lo genera el servidor y nunca cambia de contenido.
    expect(miniatura.headers['cache-control']).toContain('immutable');
  });

  it('**un archivo que no es imagen falla y no deja nada**', async () => {
    await subir('TIENDA', Buffer.from('<?php echo 1; ?>')).expect(400);

    expect(await prisma.fotoLugar.count()).toBe(0);
  });

  it('**seis por lugar**: la séptima se rechaza y lo dice; el otro lugar sigue aceptando', async () => {
    for (let vez = 0; vez < 6; vez += 1) {
      await subir('TIENDA').expect(201);
    }

    const septima = await subir('TIENDA').expect(400);

    expect((septima.body as { message: string }).message).toContain('seis');
    expect(await prisma.fotoLugar.count({ where: { lugar: 'TIENDA' } })).toBe(
      6,
    );

    await subir('CAFETERIA').expect(201);
  });

  it('un lugar que no existe, o un texto de más de 200 letras, responden 400', async () => {
    await subir('QUINCHO').expect(400);
    await subir('TIENDA', fotoChica, { descripcion: 'a'.repeat(201) }).expect(
      400,
    );

    expect(await prisma.fotoLugar.count()).toBe(0);
  });

  it('**borrar una foto borra sus dos archivos**', async () => {
    const foto = (await subir('TIENDA').expect(201)).body as FotoPublicada;
    const fila = await prisma.fotoLugar.findUniqueOrThrow({
      where: { id: foto.id },
    });

    await request(app.getHttpServer())
      .delete(`/api/admin/club/fotos/${foto.id}`)
      .set('Cookie', cookieAdmin)
      .expect(204);

    expect(await prisma.fotoLugar.count()).toBe(0);
    expect(await existe(fila.rutaWeb)).toBe(false);
    expect(await existe(fila.rutaMiniatura)).toBe(false);
    await request(app.getHttpServer()).get(foto.miniatura).expect(404);
  });

  it('**subir y borrar son del admin**: sin sesión 401, con sesión de socio 403', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/club/fotos')
      .field('lugar', 'TIENDA')
      .attach('foto', fotoChica, 'vitrina.jpg')
      .expect(401);
    await subir('TIENDA', fotoChica, {}, cookieSocio).expect(403);

    const foto = (await subir('TIENDA').expect(201)).body as FotoPublicada;

    await request(app.getHttpServer())
      .delete(`/api/admin/club/fotos/${foto.id}`)
      .set('Cookie', cookieSocio)
      .expect(403);
    expect(await prisma.fotoLugar.count()).toBe(1);
  });
});
