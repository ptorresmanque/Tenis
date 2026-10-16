import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { describe, expect, it } from 'vitest';

import { pedirMotivo } from './dialogo-de-motivo';

/**
 * T253. El motivo que reemplaza a `window.prompt`: sin escribirlo no deja confirmar, responde el
 * texto sin espacios de más, y descartar responde null.
 */
describe('pedirMotivo', () => {
  const contenedor = () => document.querySelector<HTMLElement>('mat-dialog-container');
  const boton = (texto: string) =>
    [...(contenedor()?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent?.trim() === texto,
    )!;
  /** NgForm conecta el campo un microtask después de crearlo: antes, escribir no llega. */
  const escribir = async (valor: string) => {
    await Promise.resolve();
    const campo = contenedor()!.querySelector<HTMLInputElement>('input, textarea')!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    TestBed.tick();
  };

  const preguntar = () => {
    const respuesta = pedirMotivo(TestBed.inject(MatDialog), {
      titulo: '¿Cancelar la clase de Ana Silva?',
      etiqueta: 'Por qué se cancela',
      confirmar: 'Cancelar la clase',
    });
    TestBed.tick();
    return respuesta;
  };

  it('muestra la pregunta como título y el campo con su etiqueta', () => {
    void preguntar();

    expect(contenedor()?.querySelector('[mat-dialog-title]')?.textContent).toContain(
      '¿Cancelar la clase de Ana Silva?',
    );
    expect(contenedor()?.querySelector('mat-label')?.textContent).toContain('Por qué se cancela');
  });

  it('**sin motivo no deja confirmar**: solo espacios tampoco', async () => {
    void preguntar();
    expect(boton('Cancelar la clase').disabled).toBe(true);

    await escribir('   ');

    expect(boton('Cancelar la clase').disabled).toBe(true);
  });

  it('con motivo, responde el texto sin espacios de más', async () => {
    const respuesta = preguntar();

    await escribir('  El profesor está enfermo ');
    boton('Cancelar la clase').click();

    expect(await respuesta).toBe('El profesor está enfermo');
  });

  it('el botón va en rojo solo si confirmar cancela o anula algo: condonar no', () => {
    void pedirMotivo(TestBed.inject(MatDialog), {
      titulo: '¿Condonar la cuota?',
      etiqueta: 'Por qué se condona',
      confirmar: 'Condonar',
    });
    TestBed.tick();

    expect(boton('Condonar').classList).not.toContain('peligro');
  });

  it('descartar responde null y no hace nada más', async () => {
    const respuesta = preguntar();

    await escribir('Algo');
    boton('Mejor no').click();

    expect(await respuesta).toBeNull();
  });
});
