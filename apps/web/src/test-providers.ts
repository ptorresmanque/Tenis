import { EnvironmentProviders, Provider } from '@angular/core';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

/**
 * Los proveedores de todas las pruebas (`providersFile` en angular.json).
 *
 * Sin animaciones de Material: un MatDialog espera el fin de su animación para cerrarse, y en
 * jsdom esa espera es un reloj que las pruebas tendrían que adivinar (T252).
 */
const proveedores: (Provider | EnvironmentProviders)[] = [
  { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
];

export default proveedores;
