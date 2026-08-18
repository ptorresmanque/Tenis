import { EstadoTransaccion } from '../generated/prisma/client';

/**
 * Las únicas transiciones que existen (`SPEC-pagos.md` § Modelo de datos).
 *
 * `AUTORIZADA` y `RECHAZADA` son terminales salvo la anulación, y ningún estado
 * vuelve a `PENDIENTE`: una transacción que retrocede es un cobro que se puede
 * repetir.
 */
const PERMITIDAS: Readonly<
  Record<EstadoTransaccion, readonly EstadoTransaccion[]>
> = {
  PENDIENTE: [
    EstadoTransaccion.AUTORIZADA,
    EstadoTransaccion.RECHAZADA,
    EstadoTransaccion.EXPIRADA,
  ],
  AUTORIZADA: [EstadoTransaccion.ANULADA],
  RECHAZADA: [],
  ANULADA: [],
  EXPIRADA: [],
};

/**
 * El estado al que se pasa, o un error si esa transición no existe.
 *
 * Devuelve el destino en vez de un booleano para que usarla sea el camino corto: el
 * `update` escribe `estado: transicionar(actual, destino)` en una línea, en vez de un
 * `if` que se puede olvidar.
 *
 * **No es una garantía.** Un `update` que escriba el estado a mano la saltea y nada
 * lo impide; que todo cambio de estado pase por acá es una convención que sostienen
 * los servicios de `pagos` (T18, T19) y su revisión, no el tipo ni la base.
 *
 * Un mismo estado consigo mismo también lanza. La confirmación repetida —el callback
 * que la pasarela reintenta— se resuelve antes, devolviendo el resultado ya guardado
 * (T18); si en cambio se permitiera el bucle, el segundo callback reescribiría el
 * código de autorización y la fecha del primero.
 */
export function transicionar(
  desde: EstadoTransaccion,
  hacia: EstadoTransaccion,
): EstadoTransaccion {
  if (!PERMITIDAS[desde].includes(hacia)) {
    throw new Error(
      `Transición de transacción inválida: ${desde} → ${hacia}. ` +
        `Desde ${desde} solo se puede pasar a ${PERMITIDAS[desde].join(', ') || 'ningún otro estado'}.`,
    );
  }

  return hacia;
}
