import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Esqueleto } from '../../ui/esqueleto';

import { enPesos } from '../../catalogo-canchas/reloj-del-club';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { Cuotas } from '../cuotas.service';

/**
 * Quién le debe al club, del que más debe al que menos.
 *
 * **Se cuenta sobre las cuotas impagas, no restando fechas.** Un socio con agosto
 * impago y septiembre pagado debe una, no cero ni dos: la resta contra `alDiaHasta`
 * diría cualquier cosa y el club llamaría por el mes equivocado.
 *
 * Existe para que el club vea la deuda **antes de que el socio se entere en la
 * cancha**, que es la conversación que este módulo viene a evitar.
 */
@Component({
  selector: 'app-morosos',
  imports: [Esqueleto, RouterLink, EstadoVacio, Insignia],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: es una pantalla para mirar. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Socios con deuda</h1>
        <p class="mt-1 text-muted-foreground">
          Ordenados por lo que deben. Se cuenta por cuotas impagas, no por fechas.
        </p>
      </div>
    </header>

    @if (morosos.isLoading()) {
      <app-esqueleto class="mt-4 block" [filas]="5" etiqueta="Cargando los socios con deuda…" />
    } @else if (morosos.value().length === 0) {
      <app-estado-vacio
        class="mt-4 block"
        icono="sentiment_satisfied"
        titulo="Nadie debe nada"
        detalle="Todas las cuotas emitidas están pagadas."
      />
    } @else {
      <p class="mt-4 text-lg">
        <strong class="font-display text-3xl font-bold text-destructive tabular-nums">
          {{ pesos(totalClp()) }}
        </strong>
        por cobrar, de {{ morosos.value().length }}
        {{ morosos.value().length === 1 ? 'socio' : 'socios' }}
      </p>

      <div class="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
        <table class="tabla">
          <caption class="sr-only">
            Socios con cuotas impagas
          </caption>
          <thead>
            <tr>
              <th scope="col">Nº</th>
              <th scope="col">Socio</th>
              <th scope="col">Debe desde</th>
              <th scope="col">Cuotas</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            @for (moroso of morosos.value(); track moroso.socioId) {
              <tr>
                <td class="font-mono text-sm">{{ moroso.numeroSocio }}</td>
                <td class="font-medium">
                  {{ moroso.nombre }}
                  <a
                    [href]="'mailto:' + moroso.email"
                    class="block text-sm font-normal text-muted-foreground underline"
                  >
                    {{ moroso.email }}
                  </a>
                </td>
                <td class="whitespace-nowrap">{{ moroso.desdePeriodo }}</td>
                <td>
                  <app-insignia
                    [variante]="moroso.cuotasImpagas > 2 ? 'error' : 'aviso'"
                    icono="receipt_long"
                  >
                    {{ moroso.cuotasImpagas }}
                  </app-insignia>
                </td>
                <td class="font-semibold whitespace-nowrap">
                  {{ pesos(moroso.deudaClp) }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <p class="mt-4 text-sm text-muted-foreground">
        Para cobrar una cuota, ábrela en
        <a routerLink="/administracion/cuotas" class="underline">las cuotas del mes</a>.
      </p>
    }
  `,
})
export class MorososPanel {
  private readonly api = inject(Cuotas);

  protected readonly morosos = resource({
    loader: () => this.api.morosos(),
    defaultValue: [],
  });

  /** Lo que el club tiene por cobrar en total. Es la cifra que la directiva mira. */
  protected readonly totalClp = computed(() =>
    this.morosos.value().reduce((suma, moroso) => suma + moroso.deudaClp, 0),
  );

  protected readonly pesos = enPesos;
}
