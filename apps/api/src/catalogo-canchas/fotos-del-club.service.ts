import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { borrarImagen, guardarImagenConMiniatura } from '../comun/imagenes';
import { Lugar } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FotoPedida } from './fotos-del-club.dto';

/**
 * Cuántas fotos admite cada lugar. Es un bloque de una página y no una galería: la
 * portada muestra la primera y «El club» todas, en una fila.
 */
export const FOTOS_POR_LUGAR = 6;

/** Una foto como se publica: **con las dos direcciones ya armadas**, sin la ruta del disco. */
export interface FotoDelLugar {
  id: number;
  descripcion: string | null;
  miniatura: string;
  imagen: string;
}

/**
 * Las fotos de la tienda y la cafetería (T185).
 *
 * El mismo trato que las de los torneos (`torneos/fotos.service.ts`): se reencodifican
 * **sin EXIF** antes de tocar el disco, se guardan en dos tamaños y se sirven sin sesión.
 */
@Injectable()
export class FotosDelClub {
  constructor(private readonly prisma: PrismaService) {}

  /** Las de cada lugar, en el orden en que se subieron: la primera es la de la portada. */
  async porLugar(): Promise<Record<Lugar, FotoDelLugar[]>> {
    const filas = await this.prisma.fotoLugar.findMany({
      orderBy: [{ creadaEn: 'asc' }, { id: 'asc' }],
      select: { id: true, lugar: true, descripcion: true },
    });

    return {
      TIENDA: filas.filter((f) => f.lugar === 'TIENDA').map(publicar),
      CAFETERIA: filas.filter((f) => f.lugar === 'CAFETERIA').map(publicar),
      GIMNASIO: filas.filter((f) => f.lugar === 'GIMNASIO').map(publicar),
    };
  }

  /**
   * Sube una foto a un lugar.
   *
   * **El tope se mira antes de procesar la imagen**: reencodificar 15 MB para después
   * rechazarlos es gastar el servidor en nada.
   */
  // ponytail: contar y crear no van en una transacción; dos subidas simultáneas con
  // cinco fotos pueden dejar siete. Lo sube un admin a la vez; si molesta, un candado.
  async subir(pedida: FotoPedida, bytes: Buffer): Promise<FotoDelLugar> {
    const cuantas = await this.prisma.fotoLugar.count({
      where: { lugar: pedida.lugar },
    });

    if (cuantas >= FOTOS_POR_LUGAR) {
      throw new BadRequestException(
        'Cada lugar admite seis fotos. Borra una antes de subir otra.',
      );
    }

    const { web, miniatura } = await guardarImagenConMiniatura(
      bytes,
      `club/${pedida.lugar.toLowerCase()}`,
    );

    const creada = await this.prisma.fotoLugar.create({
      data: {
        lugar: pedida.lugar,
        descripcion: pedida.descripcion,
        rutaWeb: web.ruta,
        rutaMiniatura: miniatura.ruta,
      },
      select: { id: true, descripcion: true },
    });

    return publicar(creada);
  }

  /** Borra la foto **y sus dos archivos**: una fila menos no libera disco. */
  async quitar(id: number): Promise<void> {
    const foto = await this.prisma.fotoLugar.findUnique({
      where: { id },
      select: { rutaWeb: true, rutaMiniatura: true },
    });

    if (!foto) throw new NotFoundException('No hay una foto con ese número.');

    await this.prisma.fotoLugar.delete({ where: { id } });
    await borrarImagen(foto.rutaWeb);
    await borrarImagen(foto.rutaMiniatura);
  }

  /**
   * La ruta en disco de una de las dos versiones, **resuelta por el id de la fila** y
   * nunca con lo que venga en la URL: así un `../../` no sale de la carpeta de subidas.
   */
  async ruta(id: number, cual: 'web' | 'miniatura'): Promise<string> {
    const foto = await this.prisma.fotoLugar.findUnique({
      where: { id },
      select: { rutaWeb: true, rutaMiniatura: true },
    });

    if (!foto) throw new NotFoundException('No hay una foto con ese número.');

    return cual === 'web' ? foto.rutaWeb : foto.rutaMiniatura;
  }
}

function publicar(fila: {
  id: number;
  descripcion: string | null;
}): FotoDelLugar {
  return {
    id: fila.id,
    descripcion: fila.descripcion,
    miniatura: `/api/club/fotos/${fila.id}/miniatura`,
    imagen: `/api/club/fotos/${fila.id}/imagen`,
  };
}
