import { BadRequestException } from '@nestjs/common';

import { Lugar } from '../generated/prisma/client';

export interface FotoPedida {
  lugar: Lugar;
  descripcion: string | null;
}

/**
 * Lo que acompaña a la imagen. Llega por `multipart`, así que todo es texto.
 *
 * Propio y no el `leerFoto` de los torneos: este módulo es la base de la que depende
 * `torneos`, y la flecha no se invierte por un pie de foto.
 */
export function leerFotoDelLugar(cuerpo: unknown): FotoPedida {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  if (datos.lugar !== 'TIENDA' && datos.lugar !== 'CAFETERIA') {
    throw new BadRequestException('El lugar tiene que ser TIENDA o CAFETERIA.');
  }

  const descripcion = datos.descripcion;

  if (descripcion !== undefined && typeof descripcion !== 'string') {
    throw new BadRequestException('El texto de la foto tiene que ser texto.');
  }

  const limpia = descripcion?.trim() ?? '';

  if (limpia.length > 200) {
    throw new BadRequestException(
      'El texto de la foto no puede pasar de 200 letras.',
    );
  }

  return { lugar: datos.lugar, descripcion: limpia || null };
}
