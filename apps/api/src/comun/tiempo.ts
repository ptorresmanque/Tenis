/**
 * La zona del club. En T9 pasa a ser una columna de `ConfiguracionClub`; hasta
 * entonces es una constante, porque el club es uno solo y está en Santiago.
 *
 * Zona IANA y nunca un desfase fijo: Chile cambia la hora dos veces al año y un
 * `-04:00` escrito a mano deja la grilla corrida medio año.
 */
export const ZONA_DEL_CLUB = 'America/Santiago';

/**
 * El día de hoy en el club, como medianoche UTC — la misma forma en que las
 * columnas `DATE` vuelven de la base, así que se pueden comparar directamente.
 *
 * Importa de verdad: a las 21:00 de un 17 de agosto en Santiago ya es 18 de
 * agosto en UTC. Usar la fecha UTC dejaría morosos a los socios diez horas antes
 * de tiempo, todas las noches.
 */
export function hoyEnElClub(ahora = new Date()): Date {
  // 'en-CA' da exactamente AAAA-MM-DD, que es lo que se necesita para rearmarla.
  const civil = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_DEL_CLUB,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);

  return new Date(`${civil}T00:00:00.000Z`);
}
