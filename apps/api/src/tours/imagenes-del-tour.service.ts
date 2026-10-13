import { Injectable, NotFoundException } from '@nestjs/common';

import { borrarImagen, guardarImagenConMiniatura } from '../comun/imagenes';
import { PrismaService } from '../prisma/prisma.service';

/** Una foto de la galería como se publica: **las direcciones, nunca la ruta del disco**. */
export interface FotoDeTour {
  id: number;
  descripcion: string | null;
  miniatura: string;
  imagen: string;
}

/** Las dos direcciones de la imagen representativa, o nada si no tiene. */
export interface ImagenDeTour {
  miniatura: string;
  web: string;
}

/**
 * La imagen representativa y la galería de un tour (T190).
 *
 * El mismo trato que las fotos de los torneos (`torneos/fotos.service.ts`): se
 * reencodifican **sin EXIF** antes de tocar el disco, se guardan en dos tamaños y se
 * sirven sin sesión. Los archivos van en `tours/<id>`, una carpeta por tour.
 */
@Injectable()
export class ImagenesDelTour {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sube la imagen representativa. **La anterior se borra del disco**, después de que la
   * nueva quedó guardada: si la nueva falla, el tour se queda con la que tenía.
   */
  async subirImagen(tourId: number, bytes: Buffer): Promise<ImagenDeTour> {
    const antes = await this.exigirTour(tourId);

    const { web, miniatura } = await guardarImagenConMiniatura(
      bytes,
      `tours/${tourId}`,
    );

    await this.prisma.tour.update({
      where: { id: tourId },
      data: { imagenRutaWeb: web.ruta, imagenRutaMiniatura: miniatura.ruta },
    });

    if (antes.imagenRutaWeb) await borrarImagen(antes.imagenRutaWeb);
    if (antes.imagenRutaMiniatura)
      await borrarImagen(antes.imagenRutaMiniatura);

    return direccionesDeImagen(tourId);
  }

  async subirFoto(
    tourId: number,
    descripcion: string | null,
    bytes: Buffer,
  ): Promise<FotoDeTour> {
    await this.exigirTour(tourId);

    // El disco se toca **después** de validar: una foto guardada para un tour que no
    // existe es un archivo huérfano que nadie va a encontrar para borrar.
    const { web, miniatura } = await guardarImagenConMiniatura(
      bytes,
      `tours/${tourId}`,
    );

    const creada = await this.prisma.fotoTour.create({
      data: {
        tourId,
        descripcion,
        rutaWeb: web.ruta,
        rutaMiniatura: miniatura.ruta,
      },
      select: { id: true, descripcion: true },
    });

    return publicarFoto(creada);
  }

  async corregirPie(
    id: number,
    descripcion: string | null,
  ): Promise<FotoDeTour> {
    await this.exigirFoto(id);

    const corregida = await this.prisma.fotoTour.update({
      where: { id },
      data: { descripcion },
      select: { id: true, descripcion: true },
    });

    return publicarFoto(corregida);
  }

  /** Borra la foto **y sus dos archivos**. */
  async quitarFoto(id: number): Promise<{ id: number }> {
    const foto = await this.exigirFoto(id);

    await this.prisma.fotoTour.delete({ where: { id } });
    await borrarImagen(foto.rutaWeb);
    await borrarImagen(foto.rutaMiniatura);

    return { id };
  }

  /** La ruta en disco de la imagen del tour, **resuelta por su id** y nunca por la URL. */
  async rutaDeImagen(
    tourId: number,
    cual: 'web' | 'miniatura',
  ): Promise<string> {
    const tour = await this.prisma.tour.findUnique({
      where: { id: tourId },
      select: { imagenRutaWeb: true, imagenRutaMiniatura: true },
    });
    const ruta =
      cual === 'web' ? tour?.imagenRutaWeb : tour?.imagenRutaMiniatura;

    if (!ruta) throw new NotFoundException('Ese tour no tiene imagen.');

    return ruta;
  }

  async rutaDeFoto(id: number, cual: 'web' | 'miniatura'): Promise<string> {
    const foto = await this.exigirFoto(id);

    return cual === 'web' ? foto.rutaWeb : foto.rutaMiniatura;
  }

  private async exigirTour(id: number) {
    const tour = await this.prisma.tour.findUnique({
      where: { id },
      select: { imagenRutaWeb: true, imagenRutaMiniatura: true },
    });

    if (!tour) throw new NotFoundException('No hay un tour con ese número.');

    return tour;
  }

  private async exigirFoto(id: number) {
    const foto = await this.prisma.fotoTour.findUnique({
      where: { id },
      select: { rutaWeb: true, rutaMiniatura: true },
    });

    if (!foto) throw new NotFoundException('No hay una foto con ese número.');

    return foto;
  }
}

export function publicarFoto(fila: {
  id: number;
  descripcion: string | null;
}): FotoDeTour {
  return {
    id: fila.id,
    descripcion: fila.descripcion,
    miniatura: `/api/tours/fotos/${fila.id}/miniatura`,
    imagen: `/api/tours/fotos/${fila.id}/imagen`,
  };
}

export function direccionesDeImagen(tourId: number): ImagenDeTour {
  return {
    miniatura: `/api/tours/${tourId}/miniatura`,
    web: `/api/tours/${tourId}/imagen`,
  };
}
