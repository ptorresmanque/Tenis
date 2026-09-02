import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

import {
  borrarImagen,
  carpetaDeSubidas,
  guardarImagen,
  guardarImagenConMiniatura,
} from './imagenes';

/**
 * T66. El pipeline con que entra una imagen de afuera.
 *
 * Lo usan el comprobante de pago y la galería del torneo, y en los dos casos el archivo
 * lo manda alguien que no controlamos. Este archivo es el que decide si eso es seguro.
 */
describe('guardarImagen', () => {
  let carpeta: string;

  /** Una foto como la que saca un celular: grande y con coordenadas adentro. */
  const unaFoto = (ancho = 4000, alto = 3000) =>
    sharp({
      create: {
        width: ancho,
        height: alto,
        channels: 3,
        background: { r: 200, g: 30, b: 30 },
      },
    })
      // Con metadatos adentro, como sale de un celular: el `Copyright` hace de
      // sustituto de las coordenadas GPS, que `sharp` no expone para escribir pero
      // viajan en el mismo bloque EXIF y se descartan igual.
      .withExif({ IFD0: { Copyright: 'Alguien', Artist: 'Su teléfono' } })
      .jpeg()
      .toBuffer();

  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'imagenes-'));
    process.env.SUBIDAS_DIR = carpeta;
  });

  afterAll(async () => {
    delete process.env.SUBIDAS_DIR;
    await rm(carpeta, { recursive: true, force: true });
  });

  it('reduce la foto al lado que se le pide', async () => {
    const { ruta, ancho, alto } = await guardarImagen(
      await unaFoto(),
      'pruebas',
    );

    expect(ancho).toBe(1600);
    expect(alto).toBe(1200);
    expect(ruta.startsWith('pruebas/')).toBe(true);
  });

  it('**lo que queda en disco pesa menos que lo que llegó**', async () => {
    const original = await unaFoto();
    const { ruta } = await guardarImagen(original, 'pruebas');

    const guardado = await stat(join(carpetaDeSubidas(), ruta));
    expect(guardado.size).toBeLessThan(original.length);
  });

  it('**se descartan los metadatos EXIF**', async () => {
    // Una foto de celular lleva las coordenadas de dónde se tomó y a veces el nombre
    // del dueño del teléfono. Publicarla con el EXIF intacto es publicar eso sin que
    // nadie lo haya decidido.
    const original = await unaFoto();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const { ruta } = await guardarImagen(original, 'pruebas');
    const guardada = await sharp(
      await readFile(join(carpetaDeSubidas(), ruta)),
    ).metadata();

    expect(guardada.exif).toBeUndefined();
  });

  it('**el nombre en disco lo genera el servidor**, no quien sube', async () => {
    // El nombre del cliente es por donde entra un `../../` a escribir fuera de la
    // carpeta: acá ni siquiera se recibe.
    const { ruta } = await guardarImagen(await unaFoto(), 'pruebas');

    expect(ruta).toMatch(
      /^pruebas\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
    );
  });

  it('dos subidas de la misma foto no se pisan', async () => {
    const foto = await unaFoto();
    const una = await guardarImagen(foto, 'pruebas');
    const otra = await guardarImagen(foto, 'pruebas');

    expect(una.ruta).not.toBe(otra.ruta);
  });

  it('**un archivo que no es una imagen se rechaza**', async () => {
    // Un `.php` renombrado a `.jpg` no se puede decodificar, así que muere acá: es una
    // prueba más fuerte que mirar los primeros bytes o creerle al `Content-Type`, que
    // los escribe quien sube.
    const php = Buffer.from('<?php system($_GET["c"]); ?>');

    await expect(guardarImagen(php, 'pruebas')).rejects.toThrow();
  });

  it('un archivo vacío se rechaza', async () => {
    await expect(guardarImagen(Buffer.alloc(0), 'pruebas')).rejects.toThrow();
  });

  it('**una imagen de más de 15 MB se rechaza antes de procesarla**', async () => {
    const enorme = Buffer.alloc(16 * 1024 * 1024, 1);

    await expect(guardarImagen(enorme, 'pruebas')).rejects.toThrow(/MB/);
  });

  it('una imagen chica no se estira: agrandarla solo agrega peso', async () => {
    const { ancho, alto } = await guardarImagen(
      await unaFoto(200, 150),
      'pruebas',
    );

    expect(ancho).toBe(200);
    expect(alto).toBe(150);
  });

  it('el rechazo no deja nada escrito', async () => {
    const antes = await archivosEn('pruebas');

    await expect(
      guardarImagen(Buffer.from('no soy una imagen'), 'pruebas'),
    ).rejects.toThrow();

    expect(await archivosEn('pruebas')).toBe(antes);
  });

  it('la miniatura sale de la misma subida y es más chica', async () => {
    const { web, miniatura } = await guardarImagenConMiniatura(
      await unaFoto(),
      'galeria',
    );

    expect(web.ancho).toBe(1600);
    expect(miniatura.ancho).toBe(400);
    expect(web.ruta).not.toBe(miniatura.ruta);
  });

  it('borrar un archivo que ya no está no revienta', async () => {
    // Se llama al reemplazar un comprobante: que el viejo ya no exista es el resultado
    // que se quería, no un problema que valga la pena propagar.
    await expect(
      borrarImagen('pruebas/no-existe.jpg'),
    ).resolves.toBeUndefined();
  });

  it('borrar saca el archivo del disco', async () => {
    const { ruta } = await guardarImagen(await unaFoto(), 'pruebas');

    await borrarImagen(ruta);

    await expect(stat(join(carpetaDeSubidas(), ruta))).rejects.toThrow();
  });

  const archivosEn = async (destino: string) => {
    const { readdir } = await import('node:fs/promises');

    try {
      return (await readdir(join(carpetaDeSubidas(), destino))).length;
    } catch {
      return 0;
    }
  };
});
