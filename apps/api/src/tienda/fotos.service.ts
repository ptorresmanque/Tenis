import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { borrarImagen, guardarImagenConMiniatura } from '../comun/imagenes';
import { PrismaService } from '../prisma/prisma.service';

/** Una foto como la ve el panel: su orden y las dos direcciones para pedirla. */
export interface FotoDeProducto {
  id: number;
  orden: number;
  miniatura: string;
  imagen: string;
}

/**
 * Las dos direcciones públicas de una foto, por su id (T158).
 *
 * **La ruta en disco no sale**, como en las fotos de torneos: dónde está el archivo es del
 * servidor, y publicarlo invitaría a pedir cualquier otro nombre de la carpeta.
 */
export function direccionesDeLaFoto(id: number): {
  miniatura: string;
  imagen: string;
} {
  return {
    miniatura: `/api/tienda/fotos/${id}/miniatura`,
    imagen: `/api/tienda/fotos/${id}/imagen`,
  };
}

/**
 * Las fotos de los productos (T158), con el mismo camino que las de torneos: se
 * reencodan, pierden el EXIF y quedan en dos tamaños, el de la ficha y la miniatura del
 * catálogo.
 */
@Injectable()
export class FotosDeProductos {
  constructor(private readonly prisma: PrismaService) {}

  /** La foto nueva va al final. El disco se toca después de saber que el producto existe. */
  async subir(productoId: number, bytes: Buffer): Promise<FotoDeProducto> {
    const producto = await this.prisma.producto.findUnique({
      where: { id: productoId },
      select: { id: true },
    });
    if (!producto)
      throw new NotFoundException('No hay un producto con ese número.');

    const { web, miniatura } = await guardarImagenConMiniatura(
      bytes,
      `tienda/${productoId}`,
    );
    const { _max } = await this.prisma.fotoProducto.aggregate({
      where: { productoId },
      _max: { orden: true },
    });

    const creada = await this.prisma.fotoProducto.create({
      data: {
        productoId,
        rutaWeb: web.ruta,
        rutaMiniatura: miniatura.ruta,
        orden: (_max.orden ?? -1) + 1,
      },
      select: { id: true, orden: true },
    });

    return { ...creada, ...direccionesDeLaFoto(creada.id) };
  }

  /**
   * El orden nuevo, con **la lista entera** de sus fotos: la primera es la portada del
   * catálogo. Una lista que no trae exactamente sus fotos se rechaza, en vez de dejar
   * dos con el mismo orden o una afuera.
   */
  async reordenar(
    productoId: number,
    ids: number[],
  ): Promise<FotoDeProducto[]> {
    const suyas = await this.prisma.fotoProducto.findMany({
      where: { productoId },
      select: { id: true },
    });
    const deEste = new Set(suyas.map((foto) => foto.id));

    if (ids.length !== deEste.size || ids.some((id) => !deEste.has(id))) {
      throw new BadRequestException(
        'El orden tiene que traer todas las fotos del producto, una vez cada una.',
      );
    }

    await this.prisma.$transaction(
      ids.map((id, orden) =>
        this.prisma.fotoProducto.update({ where: { id }, data: { orden } }),
      ),
    );

    return ids.map((id, orden) => ({ id, orden, ...direccionesDeLaFoto(id) }));
  }

  /** Borra la foto **y sus dos archivos**: una fila menos no libera disco. */
  async quitar(productoId: number, id: number): Promise<{ id: number }> {
    const foto = await this.prisma.fotoProducto.findFirst({
      where: { id, productoId },
      select: { id: true, rutaWeb: true, rutaMiniatura: true },
    });
    if (!foto) {
      throw new NotFoundException(
        'Ese producto no tiene una foto con ese número.',
      );
    }

    await this.prisma.fotoProducto.delete({ where: { id } });
    await borrarImagen(foto.rutaWeb);
    await borrarImagen(foto.rutaMiniatura);

    return { id };
  }

  /** La ruta en disco, **por el id de la fila** y nunca por lo que venga en la URL. */
  async rutaDeLaFoto(id: number, cual: 'web' | 'miniatura'): Promise<string> {
    const foto = await this.prisma.fotoProducto.findUnique({
      where: { id },
      select: { rutaWeb: true, rutaMiniatura: true },
    });
    if (!foto) throw new NotFoundException('No hay una foto con ese número.');

    return cual === 'web' ? foto.rutaWeb : foto.rutaMiniatura;
  }
}
