import { PartidoPublico } from '../torneos.service';

/**
 * Buscar a un jugador en un cuadro (T136 y T137): la misma regla en el orden de juego y en
 * el árbol, para que los dos marquen lo mismo.
 *
 * **Sin tildes ni mayúsculas**: "tomas" encuentra a "Tomás". Por parte del nombre o del
 * apellido: "fuen" encuentra a "Tomás Fuentes".
 */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** Si ese jugador es el que se busca. Una búsqueda vacía no encuentra a nadie. */
export function coincide(jugador: string | null, busqueda: string): boolean {
  const buscado = normalizar(busqueda);

  return buscado !== '' && jugador !== null && normalizar(jugador).includes(buscado);
}

/** Si en ese partido juega el que se busca. */
export function esDe(partido: PartidoPublico, busqueda: string): boolean {
  return coincide(partido.jugadorA, busqueda) || coincide(partido.jugadorB, busqueda);
}

/**
 * Un bye es un lugar vacío del cuadro y no un partido: en la primera ronda, uno de los dos
 * lados viene sin jugador.
 */
export function esBye(partido: PartidoPublico): boolean {
  return partido.ronda === 1 && (partido.jugadorA === null) !== (partido.jugadorB === null);
}
