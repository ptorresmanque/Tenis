import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * Recibir una imagen de afuera y dejarla en disco.
 *
 * **La primera vez que este proyecto guarda un archivo.** `ConfiguracionClub` dejó el
 * logotipo fuera con el argumento de que un archivo necesita dónde guardarse y eso es
 * una decisión de infraestructura; la decisión se tomó en `SPEC-torneos.md` § La imagen
 * va al disco del servidor, y es acotada: carpeta en el disco de la API, sin bucket y
 * sin credenciales.
 *
 * Lo usan el comprobante de pago (T66) y la galería del torneo (T69). Nace con el
 * comprobante y no con la galería porque llega antes y necesita lo mismo; al revés
 * serían dos formas de recibir un archivo, y la primera en escribirse sería la peor.
 */

/** Lo que se acepta de entrada. Una foto de celular actual cabe de sobra. */
export const MAXIMO_BYTES = 15 * 1024 * 1024;

/** El lado mayor de la versión que se muestra. */
const LADO_WEB = 1600;

/** El lado mayor de la miniatura de la galería. */
const LADO_MINIATURA = 400;

export interface ImagenGuardada {
  /** Ruta relativa a la carpeta de subidas. Lo que va a la base. */
  ruta: string;
  ancho: number;
  alto: number;
}

/**
 * Dónde viven los archivos.
 *
 * Por variable de entorno para que las pruebas escriban en una carpeta temporal y el
 * despliegue pueda montar un volumen. **No sobrevive a un contenedor sin volumen**, y
 * eso está anotado como limitación conocida, no como olvido.
 */
export function carpetaDeSubidas(): string {
  return process.env.SUBIDAS_DIR ?? join(process.cwd(), 'subidas');
}

/**
 * Guarda una imagen, reducida y sin metadatos.
 *
 * **Reencodificar es la mejor prueba de que era una imagen**, y es más fuerte que mirar
 * los primeros bytes o creerle al `Content-Type`: los dos los escribe quien sube. Un
 * archivo que no se puede decodificar falla acá, y lo que sale al disco es un JPEG que
 * escribimos nosotros y no bytes de un desconocido.
 *
 * **Se descartan los metadatos EXIF**, que es lo que `sharp` hace por omisión al
 * reencodear. Una foto de celular lleva las coordenadas de dónde se tomó y a veces el
 * nombre del dueño del teléfono; publicarla con el EXIF intacto es publicar eso sin que
 * nadie lo haya decidido.
 *
 * **El nombre en disco lo genera el servidor.** El que manda el cliente no se usa
 * nunca: es por donde entra un `../../` a escribir fuera de la carpeta.
 */
export async function guardarImagen(
  bytes: Buffer,
  destino: string,
  lado: number = LADO_WEB,
): Promise<ImagenGuardada> {
  if (bytes.length === 0) {
    throw new BadRequestException('No llegó ningún archivo.');
  }

  if (bytes.length > MAXIMO_BYTES) {
    throw new BadRequestException(
      `Esa imagen pesa más de ${MAXIMO_BYTES / 1024 / 1024} MB. Mándala más liviana.`,
    );
  }

  const nombre = `${randomUUID()}.jpg`;
  const carpeta = join(carpetaDeSubidas(), destino);

  let reducida: Buffer;
  let ancho = 0;
  let alto = 0;

  try {
    const salida = await sharp(bytes)
      // `withoutEnlargement`: una imagen chica no se estira. Agrandarla no agrega
      // información, solo peso y una foto borrosa.
      .resize(lado, lado, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    reducida = salida.data;
    ancho = salida.info.width;
    alto = salida.info.height;
  } catch {
    // El error de `sharp` no se filtra: dice cosas del formato interno que no le
    // sirven a quien subió una foto, y a quien prueba a subir otra cosa le da pistas.
    throw new BadRequestException(
      'Ese archivo no es una imagen que podamos leer. Manda un JPG o un PNG.',
    );
  }

  await mkdir(carpeta, { recursive: true });
  await writeFile(join(carpeta, nombre), reducida);

  return { ruta: join(destino, nombre), ancho, alto };
}

/** Guarda además una miniatura, para las galerías. Ver T69. */
export async function guardarImagenConMiniatura(
  bytes: Buffer,
  destino: string,
): Promise<{ web: ImagenGuardada; miniatura: ImagenGuardada }> {
  const web = await guardarImagen(bytes, destino, LADO_WEB);
  const miniatura = await guardarImagen(bytes, destino, LADO_MINIATURA);

  return { web, miniatura };
}

/**
 * Borra un archivo subido. **No falla si ya no está.**
 *
 * Se llama al reemplazar un comprobante, y que el archivo viejo ya no exista no es un
 * problema que valga la pena propagar: el objetivo era que no estuviera.
 */
export async function borrarImagen(ruta: string): Promise<void> {
  try {
    await unlink(join(carpetaDeSubidas(), ruta));
  } catch {
    // Ya no estaba, o nunca estuvo. En los dos casos el resultado es el que se quería.
  }
}
