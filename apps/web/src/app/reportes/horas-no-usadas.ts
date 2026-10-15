import { Component, computed, inject } from '@angular/core';

import { Pendientes } from '../core/pendientes';
import { PestanasDeLaPantalla } from '../ui/pestanas-de-la-pantalla';

/**
 * Horas no usadas (T287, SPEC-panel.md D6): las horas que un socio reportó y la estadística del
 * período, que eran dos ítems del menú, en una pantalla con pestañas.
 *
 * **«Por revisar» va primero**, con un badge que dice cuántas esperan: es lo que hay que
 * resolver, y la estadística de «Período» solo cuenta lo que el club ya confirmó.
 */
@Component({
  selector: 'app-horas-no-usadas',
  imports: [PestanasDeLaPantalla],
  template: `
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Horas no usadas</h1>
      </div>
    </header>

    <app-pestanas-de-la-pantalla etiqueta="Secciones de horas no usadas" [pestanas]="pestanas()" />
  `,
})
export class HorasNoUsadas {
  private readonly conteo = inject(Pendientes).conteo;

  protected readonly pestanas = computed(() => {
    const porRevisar = this.conteo()?.horasPorRevisar ?? 0;

    return [
      {
        ruta: '/administracion/no-uso/por-revisar',
        etiqueta: 'Por revisar',
        insignia: porRevisar,
        descripcion: porRevisar === 1 ? '1 hora por revisar' : `${porRevisar} horas por revisar`,
      },
      { ruta: '/administracion/no-uso/periodo', etiqueta: 'Período' },
    ];
  });
}
