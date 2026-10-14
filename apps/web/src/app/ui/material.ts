import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';

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
