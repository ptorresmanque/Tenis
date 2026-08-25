import { Component, inject, resource, signal } from '@angular/core';

import { diaConAnioEnPalabras, enPesos, hoyEnElClub } from '../catalogo-canchas/reloj-del-club';
import { EstadoVacio } from '../ui/estado-vacio';
import { CorteDeIngreso, CORTES_DE_INGRESO, Reportes } from './reportes.service';

/**
 * El ingreso del club por período.
 *
 * **El ingreso se atribuye a la hora jugada, no a la fecha de pago.** Es la decisión que
 * hace comparables las canchas, y la razón por la que este reporte contesta la pregunta
 * que el club tiene sobre la mesa: si la techada rinde más que la abierta.
 *
 * La pantalla dice dos cosas que evitan leer mal el número: **cuánto de lo atribuido
 * sigue sin cobrarse** y **cuándo se calculó**. Un mes reciente todavía se mueve, porque
 * una cuota de agosto pagada en octubre se suma a agosto.
 */
@Component({
  selector: 'app-ingreso-panel',
  imports: [EstadoVacio],
  template: `
    <h1 class="font-display text-2xl font-bold">Ingreso del club</h1>
    <p class="mt-2 max-w-prose text-sm text-muted-foreground">
      Lo que entró en el período, puesto en la fecha en que se jugó la hora y no en la que se pagó.
      Las cuotas van a su mes, no al día en que el socio se puso al día.
    </p>

    <div class="mt-4 grid gap-3 sm:grid-cols-3">
      <label class="grid gap-1 text-sm">
        <span class="font-medium">Desde</span>
        <input
          type="date"
          name="desde"
          class="campo"
          [value]="desde()"
          (change)="desde.set(valorDe($event))"
        />
      </label>

      <label class="grid gap-1 text-sm">
        <span class="font-medium">Hasta</span>
        <input
          type="date"
          name="hasta"
          class="campo"
          [value]="hasta()"
          (change)="hasta.set(valorDe($event))"
        />
      </label>

      <label class="grid gap-1 text-sm">
        <span class="font-medium">Cortado por</span>
        <select name="corte" class="campo" [value]="corte()" (change)="corte.set(valorDe($event))">
          @for (opcion of OPCIONES; track opcion.valor) {
            <option [value]="opcion.valor">{{ opcion.etiqueta }}</option>
          }
        </select>
      </label>
    </div>

    @if (reporte.value(); as datos) {
      @if (datos.filas.length === 0) {
        <app-estado-vacio
          class="mt-6 block"
          icono="payments"
          titulo="No hubo ingresos en este período"
          detalle="Ni arriendos cobrados ni cuotas pagadas con fecha dentro del rango."
        />
      } @else {
        <div class="mt-6 overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">
              Ingreso del período, cortado por
              {{
                nombreDelCorte(datos.corte)
              }}
            </caption>
            <thead>
              <tr class="border-b border-border text-left text-muted-foreground">
                <th scope="col" class="py-2 pr-3 font-medium">Corte</th>
                <th scope="col" class="py-2 text-right font-medium">Ingreso</th>
              </tr>
            </thead>
            <tbody>
              @for (fila of datos.filas; track fila.etiqueta) {
                <tr class="border-b border-border">
                  <th scope="row" class="py-2 pr-3 text-left font-normal">
                    {{ fila.etiqueta }}
                  </th>
                  <td class="py-2 text-right">{{ pesos(fila.montoClp) }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" class="py-2 pr-3 text-left font-semibold">Total</th>
                <td class="py-2 text-right font-semibold">
                  {{ pesos(datos.totalClp) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      }

      <!-- Las dos advertencias que evitan leer el número como si estuviera cerrado. -->
      <div class="mt-4 grid gap-1 text-sm text-muted-foreground">
        @if (datos.cuotasImpagasClp > 0) {
          <p>
            Quedan <strong>{{ pesos(datos.cuotasImpagasClp) }}</strong> en cuotas de este período
            <strong>sin cobrar</strong>. Si se pagan, se suman acá aunque el mes ya haya cerrado.
          </p>
        }
        <p>Calculado el {{ enPalabras(datos.calculadoEn) }}.</p>
      </div>
    } @else if (reporte.isLoading()) {
      <p class="mt-6 text-muted-foreground">Sumando el período…</p>
    }
  `,
})
export class IngresoPanel {
  private readonly api = inject(Reportes);

  protected readonly OPCIONES = (Object.keys(CORTES_DE_INGRESO) as CorteDeIngreso[]).map(
    (valor) => ({ valor, etiqueta: CORTES_DE_INGRESO[valor] }),
  );

  /** El mes corriente: es lo que el club mira al entrar. */
  protected readonly desde = signal(`${hoyEnElClub().slice(0, 7)}-01`);
  protected readonly hasta = signal(hoyEnElClub());

  /** Por condición, que es la pregunta que motivó el módulo. */
  protected readonly corte = signal('condicion');

  protected readonly reporte = resource({
    params: () => ({
      desde: this.desde(),
      hasta: this.hasta(),
      corte: this.corte() as CorteDeIngreso,
    }),
    loader: ({ params }) => this.api.ingreso(params.desde, params.hasta, params.corte),
  });

  protected readonly pesos = enPesos;

  protected valorDe(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected nombreDelCorte(corte: CorteDeIngreso): string {
    return CORTES_DE_INGRESO[corte] ?? corte;
  }

  /** El instante en que se calculó, en palabras. Llega como ISO con hora. */
  protected enPalabras(instante: string): string {
    return diaConAnioEnPalabras(instante);
  }
}
