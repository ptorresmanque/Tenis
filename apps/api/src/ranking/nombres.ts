/**
 * Cómo se lee el nombre de un socio, en un solo lugar.
 *
 * Los dos servicios del módulo lo necesitan —los partidos y la tabla interna—, y el
 * nombre no vive en `Socio` sino en su `Usuario`. Dos copias de ese `select` anidado son
 * dos lugares donde arreglarlo el día que la ficha guarde un nombre propio.
 */
export const NOMBRE_DEL_SOCIO = {
  usuario: { select: { nombre: true, apellido: true } },
} as const;

/** El socio, como se lo nombra en pantalla. Nada más que el nombre. */
export function nombreDeSocio(socio: {
  usuario: { nombre: string; apellido: string };
}): string {
  return `${socio.usuario.nombre} ${socio.usuario.apellido}`;
}
