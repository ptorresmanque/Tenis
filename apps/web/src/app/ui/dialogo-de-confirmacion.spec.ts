import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { describe, expect, it } from 'vitest';

import { confirmar } from './dialogo-de-confirmacion';

/**
 * T253. La pregunta que reemplaza a `window.confirm`: su título es la pregunta, y responde true
 * solo si se confirma. Descartar, Escape o el fondo dan false.
 */
describe('confirmar', () => {
  const contenedor = () => document.querySelector<HTMLElement>('mat-dialog-container');
  const boton = (texto: string) =>
    [...(contenedor()?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent?.trim() === texto,
    )!;

  const preguntar = () => {
    const dialogos = TestBed.inject(MatDialog);
    const respuesta = confirmar(dialogos, {
      titulo: '¿Borrar esta observación?',
      detalle: 'No queda rastro de ella.',
      confirmar: 'Sí, borrar',
      peligro: true,
    });
    TestBed.tick();
    return respuesta;
  };

  it('muestra la pregunta como título, el detalle y sus dos acciones', () => {
    void preguntar();

    expect(contenedor()?.querySelector('[mat-dialog-title]')?.textContent).toContain(
      '¿Borrar esta observación?',
    );
    expect(contenedor()?.textContent).toContain('No queda rastro de ella.');
    expect(boton('Mejor no')).toBeDefined();
    expect(boton('Sí, borrar').classList).toContain('peligro');
  });

  it('confirmar responde true', async () => {
    const respuesta = preguntar();

    boton('Sí, borrar').click();

    expect(await respuesta).toBe(true);
  });

  it('descartar responde false y no hace nada más', async () => {
    const respuesta = preguntar();

    boton('Mejor no').click();

    expect(await respuesta).toBe(false);
  });

  it('Escape también responde false', async () => {
    const respuesta = preguntar();

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    Object.defineProperty(escape, 'keyCode', { value: 27 });
    document.body.dispatchEvent(escape);

    expect(await respuesta).toBe(false);
  });
});
