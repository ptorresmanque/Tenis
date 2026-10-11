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

/**
 * Los invitados anteriores de un socio, una vez cada uno (T106, A4 del plan).
 *
 * Salen de los nombres que ya escribió en sus reservas, sin tabla propia. El mismo
 * invitado escrito con y sin tilde, en mayúsculas o con un espacio de más es una sola
 * persona, y queda **la forma más reciente**: si corrigió cómo se escribe, la corrección
 * es la que vale.
 *
 * @param nombres Los nombres tal como se declararon, del más reciente al más antiguo.
 */
export function invitadosAnteriores(nombres: string[]): string[] {
  const porClave = new Map<string, string>();

  for (const nombre of nombres) {
    const limpio = nombre.trim().replace(/\s+/g, ' ');
    const clave = limpio
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('es');

    if (limpio && !porClave.has(clave)) porClave.set(clave, limpio);
  }

  return [...porClave.values()];
}
