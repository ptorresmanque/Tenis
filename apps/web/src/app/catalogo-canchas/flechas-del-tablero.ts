/** Cuánto se mueve cada flecha en un tablero: [filas, columnas]. */
const PASOS: Record<string, readonly [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * Las flechas de un tablero: llevan el foco al botón siguiente en esa dirección, saltándose
 * lo que no es botón, y en el borde lo dejan donde está.
 *
 * La comparten el tablero de disponibilidad (T264) y el de la agenda (T270): cada uno es una
 * sola parada de teclado, y con ocho canchas una parada por celda serían doscientas. Los
 * botones llevan `data-fila` y `data-columna`; una celda que ocupa varias filas lleva la
 * primera, así que la flecha de abajo sigue hasta la fila donde hay otro.
 */
export function moverConFlechas(evento: KeyboardEvent, filas: number, columnas: number): void {
  const paso = PASOS[evento.key];
  const desde = evento.currentTarget as HTMLElement;
  const tabla = desde.closest('table');
  if (!paso || !tabla) return;

  evento.preventDefault();
  let fila = Number(desde.dataset['fila']);
  let columna = Number(desde.dataset['columna']);

  for (;;) {
    fila += paso[0];
    columna += paso[1];
    if (fila < 0 || fila >= filas || columna < 0 || columna >= columnas) return;

    const destino = tabla.querySelector<HTMLElement>(
      `button[data-fila="${fila}"][data-columna="${columna}"]`,
    );
    if (destino) {
      // El foco solo no desplaza si la celda sigue en la ventana, aunque quede bajo lo pegado
      // (el encabezado y, en el teléfono, la línea de lo elegido): «nearest» respeta el
      // scroll-margin de la celda (WCAG 2.4.11), y no se mueve si ya se ve entera. jsdom no
      // implementa scrollIntoView.
      destino.focus({ preventScroll: true });
      destino.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      return;
    }
  }
}
