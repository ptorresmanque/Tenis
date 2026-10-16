import { Component, computed, inject, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
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
  imports: [
    MatButton,
    MatTableModule,MatDatepickerModule, MatFormFieldModule, MatInput, EstadoVacio, DescargarCsv, Esqueleto],
  providers: [proveerCampos(), proveerFechaYHora()],
  template: `
    <!-- Es una pestaña de Finanzas (T286): el titular va en la pantalla madre. El CSV va
         con la tabla, que es lo que se lleva. -->
    <p class="max-w-prose text-muted-foreground">
      Cómo se mueve el padrón y cuánto se debe, mes a mes. La deuda de un mes son sus cuotas
      emitidas que siguen sin cobrarse, así que baja sola cuando alguien se pone al día.
    </p>

    <div class="mt-4 grid gap-3 sm:grid-cols-2">
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
        <mat-datepicker #calendarioDesde>
          <mat-datepicker-actions>
            <button matButton type="button" matDatepickerCancel>Cancelar</button>
            <button matButton type="button" matDatepickerApply>Aplicar</button>
          </mat-datepicker-actions>
        </mat-datepicker>
        <mat-hint>dd-mm-aaaa</mat-hint>
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
        <mat-datepicker #calendarioHasta>
          <mat-datepicker-actions>
            <button matButton type="button" matDatepickerCancel>Cancelar</button>
            <button matButton type="button" matDatepickerApply>Aplicar</button>
          </mat-datepicker-actions>
        </mat-datepicker>
        <mat-hint>dd-mm-aaaa</mat-hint>
      </mat-form-field>
    </div>

    @if (reporte.error()) {
      <p class="mt-6 text-destructive">No se pudo calcular el padrón. Reintenta en un momento.</p>
    } @else if (reporte.value(); as datos) {
      <dl class="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        @for (dato of resumen(); track dato.etiqueta) {
          <div>
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
          <table mat-table aria-label="Altas, bajas y deuda por mes" class="text-sm" [dataSource]="datos.meses">
            <ng-container matColumnDef="mes">
              <th mat-header-cell *matHeaderCellDef scope="col">Mes</th>
              <th *matCellDef="let mes" scope="row" class="mat-mdc-cell mdc-data-table__cell">
                {{ mes.periodo }}
              </th>
            </ng-container>
            <ng-container matColumnDef="altas">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Altas</th>
              <td mat-cell *matCellDef="let mes" class="numero">{{ mes.altas }}</td>
            </ng-container>
            <ng-container matColumnDef="bajas">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Bajas</th>
              <td mat-cell *matCellDef="let mes" class="numero">{{ mes.bajas }}</td>
            </ng-container>
            <ng-container matColumnDef="deuda">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Deuda</th>
              <td mat-cell *matCellDef="let mes" class="numero font-semibold">
                {{ pesos(mes.deudaClp) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="conDeuda">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Socios con deuda</th>
              <td mat-cell *matCellDef="let mes" class="py-2 text-right text-muted-foreground">
                {{ mes.sociosConDeuda }}
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="COLUMNAS; sticky: true"></tr>
            <tr mat-row *matRowDef="let mes; columns: COLUMNAS"></tr>
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
      <app-esqueleto class="mt-6 block" [filas]="5" etiqueta="Mirando el padrón…" />
    }
  `,
})
export class PadronPanel {
  private readonly api = inject(Reportes);

  protected readonly desde = signal(textoAFecha(`${hoyEnElClub().slice(0, 5)}01-01`));
  protected readonly hasta = signal(textoAFecha(hoyEnElClub()));

  protected readonly reporte = resource({
    params: () => ({ desde: fechaATexto(this.desde()), hasta: fechaATexto(this.hasta()) }),
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

  protected readonly urlDelCsv = computed(() =>
    this.api.csv('padron', fechaATexto(this.desde()), fechaATexto(this.hasta())),
  );

  protected readonly COLUMNAS = ['mes', 'altas', 'bajas', 'deuda', 'conDeuda'];

  protected readonly pesos = enPesos;

  protected enPalabras(instante: string): string {
    return diaConAnioEnPalabras(fechaEnElClub(instante));
  }
}
