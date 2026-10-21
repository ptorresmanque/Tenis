import { describe, expect, it, vi } from 'vitest';

import { moverConFlechas } from './flechas-del-tablero';

/** Las flechas del tablero (T264, T270), con lo que se agregó en el PR #144. */
describe('moverConFlechas', () => {
  /** Dos filas de una columna, con un botón en cada una. */
  const tablero = () => {
    const tabla = document.createElement('table');
    tabla.innerHTML = `
      <tr><td><button data-fila="0" data-columna="0">Arriba</button></td></tr>
      <tr><td><button data-fila="1" data-columna="0">Abajo</button></td></tr>`;
    document.body.append(tabla);
    const [arriba, abajo] = [...tabla.querySelectorAll('button')];
    return { tabla, arriba, abajo };
  };
  const flecha = (key: string, desde: HTMLElement) => {
    const evento = new KeyboardEvent('keydown', { key, cancelable: true });
    Object.defineProperty(evento, 'currentTarget', { value: desde });
    moverConFlechas(evento, 2, 1);
  };

  it('lleva el foco a la de abajo', () => {
    const { tabla, arriba, abajo } = tablero();

    flecha('ArrowDown', arriba);

    expect(document.activeElement).toBe(abajo);
    tabla.remove();
  });

  it('**la lleva a la vista contando lo pegado**: con «nearest», que respeta su scroll-margin', () => {
    // El foco solo no desplaza si la celda sigue dentro de la ventana, aunque quede bajo el
    // encabezado y la línea fija del teléfono (WCAG 2.4.11). scrollIntoView con «nearest» mira
    // el scroll-margin de la celda, y no se mueve si ya se ve entera.
    const { tabla, arriba, abajo } = tablero();
    const llevar = vi.fn();
    abajo.scrollIntoView = llevar;

    flecha('ArrowDown', arriba);

    expect(llevar).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    tabla.remove();
  });
});
