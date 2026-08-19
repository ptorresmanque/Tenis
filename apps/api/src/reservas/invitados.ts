/**
 * El mes calendario del club que contiene esa fecha, como rango `[desde, hasta)`.
 *
 * Fechas civiles del club y no instantes UTC, igual que la semana del cupo pico: en
 * Santiago el 1 de septiembre empieza a las 03:00Z, así que contra el calendario UTC
 * las reservas del 31 de agosto por la noche caerían en septiembre y el socio
 * estrenaría el mes con invitados ya gastados.
 *
 * @param fecha Fecha civil del club, "AAAA-MM-DD".
 */
export function mesDelClub(fecha: string): { desde: string; hasta: string } {
  const dia = new Date(`${fecha}T00:00:00.000Z`);
  const ano = dia.getUTCFullYear();
  const mes = dia.getUTCMonth();

  // `Date.UTC` con el mes 12 rueda solo a enero del año siguiente: sumar uno a mano
  // daría un mes 13 que no existe.
  return {
    desde: civil(new Date(Date.UTC(ano, mes, 1))),
    hasta: civil(new Date(Date.UTC(ano, mes + 1, 1))),
  };
}

function civil(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}
