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

  const lugares = Object.values(Lugar) as unknown[];
  if (!lugares.includes(datos.lugar)) {
    throw new BadRequestException(
      `El lugar tiene que ser uno de: ${lugares.join(', ')}.`,
    );
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

  return { lugar: datos.lugar as Lugar, descripcion: limpia || null };
}
