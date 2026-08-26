import {
  comoFechaCivil,
  fechaDelClub,
  instanteEnElClub,
} from '../comun/tiempo';

/**
 * El rango de un reporte, como instantes.
 *
 * Los reportes reciben dos fechas civiles y consultan columnas que guardan instantes,
 * así que en algún punto hay que cruzar del calendario del club al reloj. Ese cruce
 * vive acá y no en cada servicio: escrito dos veces, el día que alguien arregle el
 * borde en uno los dos reportes empiezan a contar rangos distintos y el club ve
 * números que no cuadran entre sí.
 */

/**
 * El instante en que empieza el primer día del rango.
 *
 * Medianoche **del reloj del club**, no UTC: en agosto son las 04:00Z y en enero las
 * 03:00Z, y usar la medianoche UTC metería en el reporte horas del día anterior.
 */
export function abreEl(desde: string): Date {
  return instanteEnElClub(desde, '00:00');
}

/**
 * El instante en que termina el último día: la medianoche del siguiente.
 *
 * **El último día del rango entra entero.** Pedir "hasta el 31" y perder la hora de
 * las 22:00 de ese día es el error que hace que un reporte mensual no cuadre con la
 * suma de sus días.
 */
export function cierraEl(hasta: string): Date {
  const siguiente = fechaDelClub(hasta);
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);

  return instanteEnElClub(comoFechaCivil(siguiente), '00:00');
}
