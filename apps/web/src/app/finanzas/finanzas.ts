import { Component } from '@angular/core';

import { PestanasDeLaPantalla } from '../ui/pestanas-de-la-pantalla';

/**
 * Finanzas (T286, SPEC-panel.md D4): el ingreso del club, el padrón y la morosidad, las cuotas
 * y los socios con deuda, que eran cuatro ítems del menú, en una pantalla con pestañas. Cada una
 * conserva su ruta, debajo de `/administracion/finanzas`, y las rutas viejas redirigen.
 */
@Component({
  selector: 'app-finanzas',
  imports: [PestanasDeLaPantalla],
  template: `
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Finanzas</h1>
      </div>
    </header>

    <app-pestanas-de-la-pantalla etiqueta="Secciones de finanzas" [pestanas]="PESTANAS" />
  `,
})
export class Finanzas {
  protected readonly PESTANAS = [
    { ruta: '/administracion/finanzas/ingreso', etiqueta: 'Ingreso' },
    { ruta: '/administracion/finanzas/padron', etiqueta: 'Padrón y morosidad' },
    { ruta: '/administracion/finanzas/cuotas', etiqueta: 'Cuotas' },
    { ruta: '/administracion/finanzas/morosos', etiqueta: 'Socios con deuda' },
  ];
}
