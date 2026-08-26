import { Component, computed, inject, resource, signal } from '@angular/core';

import {
  diaConAnioEnPalabras,
  enPesos,
  fechaEnElClub,
  hoyEnElClub,
} from '../catalogo-canchas/reloj-del-club';
import { EstadoVacio } from '../ui/estado-vacio';
import { DescargarCsv } from './descargar-csv';
import { Reportes } from './reportes.service';

/**
 * El padrón y la morosidad en el tiempo.
 *
 * `cuotas` ya dice quién debe hoy; lo que agrega esta pantalla es **la serie**: si la
 * deuda sube o baja mes a mes.
 *
 * **Altas y bajas son del período; los conteos por estado son de hoy.** No es un
 * capricho de nombres: el alta y la baja son hechos con fecha, y el estado es una foto
 * del presente. Mezclarlos en la misma tabla haría leer los cuatro números como una
 * serie histórica que no son, y por eso van en tarjetas aparte y con la etiqueta puesta.
 */
@Component({
  selector: 'app-padron-panel',
  imports: [EstadoVacio, DescargarCsv],
  template: `
    <h1 class="font-display text-2xl font-bold">Padrón y morosidad</h1>
    <p class="mt-2 max-w-prose text-sm text-muted-foreground">
      Cómo se mueve el padrón y cuánto se debe, mes a mes. La deuda de un mes son sus cuotas
      emitidas que siguen sin cobrarse, así que baja sola cuando alguien se pone al día.
    </p>

    <div class="mt-4 grid gap-3 sm:grid-cols-2">
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
    </div>

    @if (reporte.value(); as datos) {
      <dl class="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        @for (dato of resumen(); track dato.etiqueta) {
          <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
            <dt class="text-sm text-muted-foreground">{{ dato.etiqueta }}</dt>
            <dd class="font-display text-2xl font-bold">{{ dato.valor }}</dd>
          </div>
        }
      </dl>

      @if (datos.meses.length === 0) {
        <app-estado-vacio
          class="mt-6 block"
          icono="groups"
          titulo="No hay meses en este rango"
          detalle="Elige un período que cubra al menos un mes."
        />
      } @else {
        <div class="mt-6 overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">
              Altas, bajas y deuda por mes
            </caption>
            <thead>
              <tr class="border-b border-border text-left text-muted-foreground">
                <th scope="col" class="py-2 pr-3 font-medium">Mes</th>
                <th scope="col" class="py-2 pr-3 text-right font-medium">Altas</th>
                <th scope="col" class="py-2 pr-3 text-right font-medium">Bajas</th>
                <th scope="col" class="py-2 pr-3 text-right font-medium">Deuda</th>
                <th scope="col" class="py-2 text-right font-medium">Socios con deuda</th>
              </tr>
            </thead>
            <tbody>
              @for (mes of datos.meses; track mes.periodo) {
                <tr class="border-b border-border">
                  <th scope="row" class="py-2 pr-3 text-left font-normal">
                    {{ mes.periodo }}
                  </th>
                  <td class="py-2 pr-3 text-right">{{ mes.altas }}</td>
                  <td class="py-2 pr-3 text-right">{{ mes.bajas }}</td>
                  <td class="py-2 pr-3 text-right font-semibold">
                    {{ pesos(mes.deudaClp) }}
                  </td>
                  <td class="py-2 text-right text-muted-foreground">
                    {{ mes.sociosConDeuda }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <div class="mt-4 grid gap-1 text-sm text-muted-foreground">
        <!-- Decir de dónde sale una cifra es lo que permite discutirla. Sin esta línea,
             un club que sabe que perdió cinco socios ve dos y desconfía del reporte
             entero en vez de revisar cómo se registraron esas bajas. -->
        <p>
          <strong>Activos, suspendidos y retirados son de hoy</strong>; las altas y las bajas, del
          período. Una baja es un socio que el club pasó a retirado desde el panel: si a alguien lo
          retiraron cambiando la base a mano, cuenta entre los retirados de hoy pero no como baja
          del mes.
        </p>
        <p>Calculado el {{ enPalabras(datos.calculadoEn) }}.</p>
      </div>

      <div class="mt-4">
        <app-descargar-csv [url]="urlDelCsv()" />
      </div>
    } @else if (reporte.isLoading()) {
      <p class="mt-6 text-muted-foreground">Mirando el padrón…</p>
    }
  `,
})
export class PadronPanel {
  private readonly api = inject(Reportes);

  protected readonly desde = signal(`${hoyEnElClub().slice(0, 5)}01-01`);
  protected readonly hasta = signal(hoyEnElClub());

  protected readonly reporte = resource({
    params: () => ({ desde: this.desde(), hasta: this.hasta() }),
    loader: ({ params }) => this.api.padron(params.desde, params.hasta),
  });

  protected readonly resumen = computed(() => {
    const datos = this.reporte.value();
    if (!datos) return [];

    return [
      { etiqueta: 'Activos hoy', valor: datos.activosHoy },
      { etiqueta: 'Suspendidos hoy', valor: datos.suspendidosHoy },
      { etiqueta: 'Retirados hoy', valor: datos.retiradosHoy },
      { etiqueta: 'Altas del período', valor: datos.altasDelPeriodo },
      { etiqueta: 'Bajas del período', valor: datos.bajasDelPeriodo },
    ];
  });

  protected readonly urlDelCsv = computed(() => this.api.csv('padron', this.desde(), this.hasta()));

  protected readonly pesos = enPesos;

  protected valorDe(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected enPalabras(instante: string): string {
    return diaConAnioEnPalabras(fechaEnElClub(instante));
  }
}
