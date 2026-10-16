import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import type { MatSnackBarConfig } from '@angular/material/snack-bar';

/**
 * Las opciones de Angular Material que valen para toda la web (SPEC-interfaz.md, A7 del plan),
 * en un solo lugar en vez de repetirlas en cada componente.
 *
 * - **Los íconos usan la fuente del sitio** (T240): `fontSet` es la clase `.icono` de
 *   `styles.css`, que trae Material Symbols Sharp —rellena y en 500, la de esquinas rectas— y
 *   deja que `text-*` mande sobre el tamaño. Con la de Google, que viene sin capa, ninguna
 *   utilidad de Tailwind podría cambiarlo.
 *
 * Lo de los campos no va acá: con su token viajaría el campo de Material entero en el arranque
 * (62 kB). Va en `proveerCampos()`, que cada componente con campos provee para sí.
 */
export function proveerMaterial(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'icono' } },
  ]);
}

/**
 * La confirmación de lo hecho es un snackbar (T254, S2): abajo al centro, cinco segundos —lo que
 * tarda en leerse una frase corta— y anunciada sin interrumpir (`polite`). Material la anuncia
 * `assertive` por omisión, que es para errores, y un error no va en snackbar.
 *
 * Una constante que cada pantalla pasa al abrirlo, y no `MAT_SNACK_BAR_DEFAULT_OPTIONS` en
 * `proveerMaterial()`: con el token viajaría el snackbar entero en el arranque (57 kB). Acá se
 * importa solo el tipo, que no pesa.
 */
export const LO_HECHO: MatSnackBarConfig = {
  duration: 5000,
  horizontalPosition: 'center',
  verticalPosition: 'bottom',
  politeness: 'polite',
};
