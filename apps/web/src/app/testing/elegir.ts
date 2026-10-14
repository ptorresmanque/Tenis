import { ComponentFixture } from '@angular/core/testing';
import { MatSelect } from '@angular/material/select';
import { By } from '@angular/platform-browser';

/**
 * Para las pruebas: los `mat-select` por su valor, como los usa una persona (T248).
 *
 * `MatSelectHarness` elige por el texto de la opción, y las pruebas de la web eligen por el
 * valor que viaja al servidor (el id de una cancha, «saltar»). Esto abre la lista y hace clic en
 * la opción de ese valor: pasa por lo mismo que el clic de verdad, con `selectionChange` y el
 * `ngModel` al día.
 */
function select(fixture: ComponentFixture<unknown>, selector: string): MatSelect {
  const elemento = fixture.debugElement.query(By.css(selector));
  if (!elemento) throw new Error(`No hay un mat-select ${selector}`);
  return elemento.injector.get(MatSelect);
}

/** Elige la opción con ese valor. */
export async function elegir(
  fixture: ComponentFixture<unknown>,
  selector: string,
  valor: unknown,
): Promise<void> {
  const lista = select(fixture, selector);
  lista.open();
  fixture.detectChanges();

  const opcion = lista.options.find((o) => String(o.value) === String(valor));
  if (!opcion) throw new Error(`${selector} no tiene la opción ${String(valor)}`);
  // Elegir la que ya está no avisa nada: la prueba pasaría sin probar nada.
  if (opcion.selected) throw new Error(`${selector} ya tiene elegida la opción ${String(valor)}`);
  opcion._getHostElement().click();

  await fixture.whenStable();
  fixture.detectChanges();
}

/** Los valores de sus opciones, como texto (como los daba el `<select>` de antes). */
export function valoresDe(fixture: ComponentFixture<unknown>, selector: string): string[] {
  return select(fixture, selector).options.map((o) => String(o.value));
}

/** Los textos de sus opciones. */
export function textosDe(fixture: ComponentFixture<unknown>, selector: string): string[] {
  return select(fixture, selector).options.map((o) => o.viewValue);
}

/** Sus opciones, con lo que se ve de cada una: el valor, el texto y si se puede elegir. */
export function opcionesDe(
  fixture: ComponentFixture<unknown>,
  selector: string,
): { valor: string; texto: string; deshabilitada: boolean }[] {
  return select(fixture, selector).options.map((o) => ({
    valor: String(o.value),
    texto: o.viewValue,
    deshabilitada: o.disabled,
  }));
}

/** El valor elegido, como texto; sin la lista en pantalla, `undefined` (como `?.value`). */
export function elegidoEn(
  fixture: ComponentFixture<unknown>,
  selector: string,
): string | undefined {
  if (!fixture.debugElement.query(By.css(selector))) return undefined;
  const valor = select(fixture, selector).value as unknown;
  return valor === null || valor === undefined ? '' : String(valor);
}
