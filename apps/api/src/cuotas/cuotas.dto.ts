import { BadRequestException } from '@nestjs/common';

import { MedioPago } from '../generated/prisma/client';

/**
 * Lo que un admin puede registrar a mano.
 *
 * **`WEBPAY` no está**, y es deliberado: ese medio lo escribe el callback de la
 * pasarela cuando el cobro se autoriza de verdad. Aceptarlo acá dejaría marcar como
 * cobrada por internet una cuota que nadie pagó, y sin transacción que lo respalde.
 */
export const MEDIOS_DEL_MESON = [
  MedioPago.EFECTIVO,
  MedioPago.TRANSFERENCIA,
] as const;

export type MedioDelMeson = (typeof MEDIOS_DEL_MESON)[number];

/** El medio del cuerpo, o 400 con lo que sí se acepta. */
export function leerMedio(cuerpo: unknown): MedioDelMeson {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const medios = MEDIOS_DEL_MESON as readonly string[];

  if (typeof datos.medio !== 'string' || !medios.includes(datos.medio)) {
    throw new BadRequestException(
      `El medio de pago tiene que ser uno de: ${medios.join(', ')}. ` +
        'Los pagos por Webpay los registra la pasarela.',
    );
  }

  return datos.medio as MedioDelMeson;
}
