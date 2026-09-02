import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { borrarImagen, guardarImagenConMiniatura } from '../comun/imagenes';
import { PrismaService } from '../prisma/prisma.service';
import { FotoPedida, Momento } from './fotos.dto';

/** Una foto como se publica: **con las dos direcciones ya armadas**. */
export interface FotoPublicada {
  id: number;
  partidoId: number | null;
  momento: Momento;
  descripcion: string | null;
  /** Lo que carga la galería. */
  miniatura: string;
  /** Lo que se pide recién al abrir la foto. */
  imagen: string;
}

/**
 * Las fotos del torneo.
 *
 * **Se sirven sin sesión, al revés que el comprobante de pago.** No es un descuido:
 * son dos carpetas con dos reglas. El comprobante lleva el nombre, el banco y el
 * número de cuenta de una persona; la foto de dos jugadores dándose la mano antes de
 * salir a la cancha es lo que el club quiere que se vea, y pedir cuenta para mirarla
 * dejaría fuera justo a quien no la tiene.
 *
 * Lo que sí se cuida es lo que la foto lleva encima: `guardarImagenConMiniatura`
 * reencodifica y **descarta el EXIF**, que en una foto de celular incluye las
 * coordenadas de dónde se tomó.
 */
@Injectable()
export class FotosDelTorneo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lo que ve la galería pública.
   *
   * De más nueva a más vieja dentro de cada momento: la última jornada es la que
   * alguien abre el lunes a mirar.
   */
  async delTorneo(torneoId: number): Promise<FotoPublicada[]> {
    const filas = await this.prisma.fotoTorneo.findMany({
      where: { torneoId },
      orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
      select: SELECCION,
    });

    return filas.map(publicar);
  }

  /** Las de un partido: la previa de los dos jugadores, casi siempre. */
  async delPartido(partidoId: number): Promise<FotoPublicada[]> {
    const filas = await this.prisma.fotoTorneo.findMany({
      where: { partidoId },
      orderBy: [{ creadaEn: 'asc' }, { id: 'asc' }],
      select: SELECCION,
    });

    return filas.map(publicar);
  }

  /**
   * Sube una foto al torneo.
   *
   * **El partido tiene que ser de este torneo.** Sin esa comprobación, una foto colgada
   * del partido equivocado aparecería en la galería de un torneo y en la ficha de un
   * partido de otro, y nadie sabría cuál de los dos está mal.
   */
  async subir(
    torneoId: number,
    datos: FotoPedida,
    bytes: Buffer,
  ): Promise<FotoPublicada> {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id: torneoId },
      select: { id: true },
    });

    if (!torneo)
      throw new NotFoundException('No hay un torneo con ese número.');

    if (datos.partidoId !== null) {
      const partido = await this.prisma.partido.findUnique({
        where: { id: datos.partidoId },
        select: { torneoId: true },
      });

      if (!partido)
        throw new NotFoundException('No hay un partido con ese número.');

      if (partido.torneoId !== torneoId) {
        throw new BadRequestException('Ese partido no es de este torneo.');
      }
    }

    // El disco se toca **después** de validar: una foto guardada para un torneo que no
    // existe es un archivo huérfano que nadie va a encontrar para borrar.
    const { web, miniatura } = await guardarImagenConMiniatura(
      bytes,
      `torneos/${torneoId}`,
    );

    const creada = await this.prisma.fotoTorneo.create({
      data: {
        torneoId,
        partidoId: datos.partidoId,
        momento: datos.momento,
        descripcion: datos.descripcion,
        rutaWeb: web.ruta,
        rutaMiniatura: miniatura.ruta,
      },
      select: SELECCION,
    });

    return publicar(creada);
  }

  /** Borra la foto **y sus dos archivos**: una fila menos no libera disco. */
  async quitar(torneoId: number, id: number): Promise<{ id: number }> {
    const foto = await this.prisma.fotoTorneo.findFirst({
      where: { id, torneoId },
      select: { id: true, rutaWeb: true, rutaMiniatura: true },
    });

    if (!foto) {
      throw new NotFoundException(
        'Ese torneo no tiene una foto con ese número.',
      );
    }

    await this.prisma.fotoTorneo.delete({ where: { id: foto.id } });
    await borrarImagen(foto.rutaWeb);
    await borrarImagen(foto.rutaMiniatura);

    return { id };
  }

  /**
   * La ruta en disco de una de las dos versiones.
   *
   * Se resuelve por el id de la fila y **nunca con lo que venga en la URL**: es lo que
   * impide que un `../../` pedido por el cliente salga de la carpeta de subidas.
   */
  async rutaDeLaFoto(id: number, cual: 'web' | 'miniatura'): Promise<string> {
    const foto = await this.prisma.fotoTorneo.findUnique({
      where: { id },
      select: { rutaWeb: true, rutaMiniatura: true },
    });

    if (!foto) throw new NotFoundException('No hay una foto con ese número.');

    return cual === 'web' ? foto.rutaWeb : foto.rutaMiniatura;
  }
}

const SELECCION = {
  id: true,
  partidoId: true,
  momento: true,
  descripcion: true,
} as const;

/**
 * De la fila a lo que se publica.
 *
 * **Las rutas del disco no salen.** Lo que viaja son dos direcciones de la API; dónde
 * está el archivo y cómo se llama es del servidor, y publicarlo invitaría a pedir
 * cualquier otro nombre de esa carpeta.
 */
function publicar(fila: {
  id: number;
  partidoId: number | null;
  momento: Momento;
  descripcion: string | null;
}): FotoPublicada {
  return {
    id: fila.id,
    partidoId: fila.partidoId,
    momento: fila.momento,
    descripcion: fila.descripcion,
    miniatura: `/api/torneos/fotos/${fila.id}/miniatura`,
    imagen: `/api/torneos/fotos/${fila.id}/imagen`,
  };
}
