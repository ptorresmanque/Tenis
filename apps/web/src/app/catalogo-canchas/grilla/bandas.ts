import { BloqueDisponible } from '../disponibilidad';

/**
 * Lo que el bloque dice de la tarifa del socio: nada de plata, porque no paga la
 * hora sino su cuota mensual.
 *
 * En un solo lugar porque aparece en el bloque, en la etiqueta accesible y en la
 * barra de abajo: el día que el club cobre la hora pico al socio, un "sin costo"
 * suelto habría quedado en dos de los tres y nadie lo notaría hasta que reclamen.
 *
 * No viene del servidor a propósito. `BloqueDisponible.montoClp` es la tarifa del
 * no-socio, y el contrato de `catalogo-canchas` no tiene ni tiene por qué tener un
 * precio por tipo de persona.
 */
export const TARIFA_DEL_SOCIO = 'sin costo';

/**
 * Si la hora ya empezó, según el reloj de quien mira.
 *
 * La API rechaza reservar una hora que ya empezó (`BLOQUE_EN_EL_PASADO`), y la
 * grilla no ofrece lo que la API va a rechazar: a las 16:40 ofrecía la de las
 * 08:00. El filtro va acá y no en la disponibilidad pública porque el mesón lee el
 * mismo endpoint y sí puede tomar la hora que está corriendo. Si el reloj del
 * navegador anda mal, manda la API.
 */
export function yaEmpezo(bloque: BloqueDisponible): boolean {
  return new Date(bloque.inicio).getTime() <= Date.now();
}
