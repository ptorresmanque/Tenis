import { BadRequestException } from '@nestjs/common';

import type { DuracionMin } from '../catalogo-canchas/bloques';

/**
 * Lo que dura la reserva que se pide, leída del borde de la API (T82).
 *
 * **Sin duración vale 1 hora**: es lo que se reservaba antes de la duración elegible, y lo
 * que manda todo cliente que todavía no la elige. Cualquier otra cosa que no sea 60 o 90
 * es un 400, incluidos `"90abc"` y `[90]`: `Number([90])` da 90, así que convertir y
 * comparar no alcanza.
 */
export function leerDuracion(valor: unknown): DuracionMin {
  if (valor === undefined || valor === null) return 60;

  const numero =
    typeof valor === 'number'
      ? valor
      : typeof valor === 'string' && /^\d+$/.test(valor)
        ? Number(valor)
        : NaN;

  if (numero === 60 || numero === 90) return numero;

  throw new BadRequestException(
    'La duración tiene que ser de 60 o de 90 minutos.',
  );
}
