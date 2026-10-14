import { DebugElement } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { MatButtonToggle } from '@angular/material/button-toggle';
import { By } from '@angular/platform-browser';

/**
 * Para las pruebas: los `mat-button-toggle` por su valor (T251), como `elegir.ts` con las listas.
 *
 * El valor de un toggle no queda en el DOM —el radio escondido de `app-selector` sí lo dejaba—,
 * así que se lee del componente. El clic va al botón de adentro, como el de una
 * persona.
 */
function toggles(fixture: ComponentFixture<unknown>, grupo?: string): DebugElement[] {
  const raiz = grupo ? fixture.debugElement.query(By.css(grupo)) : fixture.debugElement;
  if (!raiz) throw new Error(`No hay un grupo ${grupo}`);
  return raiz.queryAll(By.directive(MatButtonToggle));
}

const toggle = (d: DebugElement) => d.injector.get(MatButtonToggle);

/** Elige la opción con ese valor, en la pantalla o dentro del grupo indicado. */
export async function alternar(
  fixture: ComponentFixture<unknown>,
  valor: unknown,
  grupo?: string,
): Promise<void> {
  const opcion = toggles(fixture, grupo).find((d) => String(toggle(d).value) === String(valor));
  if (!opcion) throw new Error(`No hay una opción ${String(valor)}`);
  (opcion.nativeElement as HTMLElement).querySelector('button')!.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Las opciones, con su valor, su texto, si está elegida y si está deshabilitada. */
export function opcionesDelGrupo(
  fixture: ComponentFixture<unknown>,
  grupo?: string,
): { valor: string; texto: string; elegida: boolean; deshabilitada: boolean }[] {
  return toggles(fixture, grupo).map((d) => ({
    valor: String(toggle(d).value),
    texto: ((d.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim(),
    elegida: toggle(d).checked,
    deshabilitada: toggle(d).disabled,
  }));
}
