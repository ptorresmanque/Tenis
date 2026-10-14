import { Provider } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import {
  MAT_FORM_FIELD_DEFAULT_OPTIONS,
  MatFormFieldDefaultOptions,
} from '@angular/material/form-field';

/**
 * Cómo van los campos de Material en toda la web (S5, T244).
 *
 * - **Con contorno**: el borde de 1 px y las esquinas del `.campo` de antes.
 * - **La etiqueta siempre arriba**, en el borde (decisión del 2026-10-14): se lee siempre, como
 *   la de arriba del `.campo`, y el campo vacío muestra su formato («dd-mm-aaaa»).
 * - **El lugar del error no se reserva** si no hay error: un formulario sin errores no queda con
 *   huecos debajo de cada campo.
 *
 * Se provee en cada componente con campos y no en la aplicación, como `proveerFechaYHora()`:
 * con el token viaja el campo de Material entero, y el arranque del sitio no tiene ninguno.
 */
export function proveerCampos(): Provider[] {
  const opciones: MatFormFieldDefaultOptions = {
    appearance: 'outline',
    floatLabel: 'always',
    subscriptSizing: 'dynamic',
  };

  return [{ provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: opciones }];
}

/**
 * El mensaje de un campo que no pasa su validación, para su `mat-error` (T245). Uno solo para
 * toda la web: el mismo error se dice igual en cada formulario. Vacío si no hay error.
 */
export function errorDelCampo(control: AbstractControl | null): string {
  if (!control) return '';
  if (control.hasError('required')) return 'Falta este dato.';
  if (control.hasError('email')) return 'Escribe un correo válido, como nombre@correo.cl.';
  // El +56 ya va adelante (T121): lo que falta son los 9 dígitos.
  if (control.hasError('telefono')) return 'Son 9 dígitos, como 9 8765 4321.';

  const corto = control.getError('minlength') as { requiredLength: number } | null;
  if (corto) return `Tiene que tener al menos ${corto.requiredLength} caracteres.`;

  return '';
}
