import { ComponentFixture } from '@angular/core/testing';

/**
 * Para las pruebas: responder los diálogos de `ui/dialogo-de-confirmacion` y
 * `ui/dialogo-de-motivo` (T253) como una persona, con clics. Reemplazan a los `spyOn` de
 * `window.confirm` y `window.prompt`.
 */
const contenedor = () => document.querySelector<HTMLElement>('mat-dialog-container');

const esperar = async (fixture: ComponentFixture<unknown>) => {
  // Dos vueltas: el diálogo se cierra, y después la pantalla sigue con lo que esperaba.
  for (let i = 0; i < 2; i++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
};

/** El texto del diálogo abierto, o vacío si no hay ninguno. */
export const textoDelDialogo = () => contenedor()?.textContent?.replace(/\s+/g, ' ') ?? '';

/** Confirma (true) o descarta con «Mejor no» (false) la pregunta abierta. */
export async function responder(fixture: ComponentFixture<unknown>, si: boolean): Promise<void> {
  const dialogo = contenedor();
  if (!dialogo) throw new Error('No hay un diálogo abierto');
  const boton = si
    ? dialogo.querySelector<HTMLButtonElement>('mat-dialog-actions button.mat-mdc-unelevated-button')
    : [...dialogo.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Mejor no');
  boton!.click();
  await esperar(fixture);
}

/** Escribe el motivo y confirma, o descarta con «Mejor no» si es null. */
export async function darMotivo(
  fixture: ComponentFixture<unknown>,
  motivo: string | null,
): Promise<void> {
  if (motivo === null) return responder(fixture, false);

  const dialogo = contenedor();
  if (!dialogo) throw new Error('No hay un diálogo abierto');
  // NgForm conecta el campo un microtask después de crearlo: antes, escribir no llega.
  await Promise.resolve();
  const campo = dialogo.querySelector<HTMLInputElement>('input')!;
  campo.value = motivo;
  campo.dispatchEvent(new Event('input'));
  await esperar(fixture);
  dialogo.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
  await esperar(fixture);
}
