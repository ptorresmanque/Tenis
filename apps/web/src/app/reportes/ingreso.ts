import { Component, computed, inject, resource, signal } from '@angular/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import {
  diaConAnioEnPalabras,
  enPesos,
  fechaEnElClub,
  hoyEnElClub,
} from '../catalogo-canchas/reloj-del-club';
import { proveerCampos } from '../ui/campos';
import { Esqueleto } from '../ui/esqueleto';
import { EstadoVacio } from '../ui/estado-vacio';
import { fechaATexto, proveerFechaYHora, textoAFecha } from '../ui/fecha-y-hora';
import { DescargarCsv } from './descargar-csv';
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
  imports: [
    MatSelectModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInput,
    MatTableModule,
    EstadoVacio,
    DescargarCsv,
    Esqueleto,
  ],
  providers: [proveerCampos(), proveerFechaYHora()],
  template: `
    <!-- Es una pestaña de Finanzas (T286): el titular va en la pantalla madre. El CSV va
         con la tabla, que es lo que se lleva. -->
    <p class="max-w-prose text-muted-foreground">
      Lo que entró en el período, puesto en la fecha en que se jugó la hora y no en la que se pagó.
      Las cuotas van a su mes, no al día en que el socio se puso al día.
    </p>

    <div class="mt-4 grid gap-3 sm:grid-cols-3">
      <mat-form-field>
        <mat-label>Desde</mat-label>
        <input
          matInput
          name="desde"
          placeholder="dd-mm-aaaa"
          autocomplete="off"
          [matDatepicker]="calendarioDesde"
          [value]="desde()"
          (dateChange)="desde.set($event.value)"
        />
        <mat-datepicker-toggle matIconSuffix [for]="calendarioDesde" />
        <mat-datepicker #calendarioDesde />
      </mat-form-field>

      <mat-form-field>
        <mat-label>Hasta</mat-label>
        <input
          matInput
          name="hasta"
          placeholder="dd-mm-aaaa"
          autocomplete="off"
          [matDatepicker]="calendarioHasta"
          [value]="hasta()"
          (dateChange)="hasta.set($event.value)"
        />
        <mat-datepicker-toggle matIconSuffix [for]="calendarioHasta" />
        <mat-datepicker #calendarioHasta />
      </mat-form-field>

      <mat-form-field>
        <mat-label>Cortado por</mat-label>
        <mat-select
          name="corte"
          [value]="corte()"
          (selectionChange)="corte.set($event.value)"
        >
          @for (opcion of OPCIONES; track opcion.valor) {
            <mat-option [value]="opcion.valor">{{ opcion.etiqueta }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    @if (reporte.error()) {
      <p class="mt-6 text-destructive">No se pudo calcular el ingreso. Reintenta en un momento.</p>
    } @else if (reporte.value(); as datos) {
      @if (datos.filas.length === 0) {
        <app-estado-vacio
          class="mt-6 block"
          icono="payments"
          titulo="No hubo ingresos en este período"
          detalle="Ni arriendos cobrados ni cuotas pagadas con fecha dentro del rango."
        />
      } @else {
        <div class="mt-6 overflow-x-auto">
          <table mat-table class="text-sm" [dataSource]="datos.filas">
            <caption class="sr-only">
              Ingreso del período, cortado por
              {{
                nombreDelCorte(datos.corte)
              }}
            </caption>
            <ng-container matColumnDef="corte">
              <th mat-header-cell *matHeaderCellDef scope="col">Corte</th>
              <th *matCellDef="let fila" scope="row" class="mat-mdc-cell mdc-data-table__cell">
                {{ fila.etiqueta }}
              </th>
              <th
                *matFooterCellDef
                scope="row"
                class="mat-mdc-footer-cell mdc-data-table__cell font-semibold"
              >
                Total
              </th>
            </ng-container>
            <ng-container matColumnDef="ingreso">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Ingreso</th>
              <td mat-cell *matCellDef="let fila" class="numero">{{ pesos(fila.montoClp) }}</td>
              <td mat-footer-cell *matFooterCellDef class="numero font-semibold">
                {{ pesos(datos.totalClp) }}
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="COLUMNAS; sticky: true"></tr>
            <tr mat-row *matRowDef="let fila; columns: COLUMNAS"></tr>
            <tr mat-footer-row *matFooterRowDef="COLUMNAS"></tr>
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

      <div class="mt-4">
        <app-descargar-csv [url]="urlDelCsv()" />
      </div>
    } @else if (reporte.isLoading()) {
      <app-esqueleto class="mt-6 block" [filas]="4" etiqueta="Sumando el período…" />
    }
  `,
})
export class IngresoPanel {
  private readonly api = inject(Reportes);

  protected readonly OPCIONES = (Object.keys(CORTES_DE_INGRESO) as CorteDeIngreso[]).map(
    (valor) => ({ valor, etiqueta: CORTES_DE_INGRESO[valor] }),
  );

  /** El mes corriente: es lo que el club mira al entrar. */
  protected readonly desde = signal(textoAFecha(`${hoyEnElClub().slice(0, 7)}-01`));
  protected readonly hasta = signal(textoAFecha(hoyEnElClub()));

  /** Por condición, que es la pregunta que motivó el módulo. */
  protected readonly corte = signal('condicion');

  protected readonly reporte = resource({
    params: () => ({
      desde: fechaATexto(this.desde()),
      hasta: fechaATexto(this.hasta()),
      corte: this.corte() as CorteDeIngreso,
    }),
    loader: ({ params }) => this.api.ingreso(params.desde, params.hasta, params.corte),
  });

  protected readonly pesos = enPesos;

  protected readonly COLUMNAS = ['corte', 'ingreso'];

  /** El CSV lleva el mismo rango y corte: si no, el club descarga otra cosa. */
  protected readonly urlDelCsv = computed(() =>
    this.api.csv('ingreso', fechaATexto(this.desde()), fechaATexto(this.hasta()), this.corte()),
  );

  protected nombreDelCorte(corte: CorteDeIngreso): string {
    return CORTES_DE_INGRESO[corte] ?? corte;
  }

  /**
   * El instante en que se calculó, en palabras.
   *
   * Pasa por el reloj del club antes de recortarse: llega como ISO en UTC, y a las
   * 02:00Z de un 26 en el club todavía es 25. Recortar los diez primeros caracteres
   * hacía que el reporte dijera que se calculó mañana.
   */
  protected enPalabras(instante: string): string {
    return diaConAnioEnPalabras(fechaEnElClub(instante));
  }
}
