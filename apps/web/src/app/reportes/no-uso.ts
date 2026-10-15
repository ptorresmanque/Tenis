import { Component, computed, inject, resource, signal } from '@angular/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import {
  diaConAnioEnPalabras,
  fechaEnElClub,
  hoyEnElClub,
} from '../catalogo-canchas/reloj-del-club';
import { proveerCampos } from '../ui/campos';
import { Esqueleto } from '../ui/esqueleto';
import { EstadoVacio } from '../ui/estado-vacio';
import { fechaATexto, proveerFechaYHora, textoAFecha } from '../ui/fecha-y-hora';
import { DescargarCsv } from './descargar-csv';
import { CorteDeNoUso, CORTES_DE_NO_USO, FilaDeNoUso, Reportes } from './reportes.service';

/**
 * Las horas que alguien reservó y no usó.
 *
 * Es el indicador que el objetivo específico 4 del perfil compara antes y después del
 * sistema, así que tiene que poder mirarse por período sin contar a mano.
 *
 * **La pantalla dice cuántos reportes están sin revisar**, y no es un detalle: un 6 %
 * se lee como que el club anda bien, cuando lo que puede estar pasando es que nadie
 * miró la bandeja. Un indicador que depende de la diligencia del admin tiene que
 * mostrar esa dependencia.
 */
@Component({
  selector: 'app-no-uso-panel',
  imports: [
    MatTableModule,
    MatSelectModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInput,
    EstadoVacio,
    DescargarCsv,
    Esqueleto,
  ],
  providers: [proveerCampos(), proveerFechaYHora()],
  template: `
    <!-- Es la pestaña «Período» de Horas no usadas (T287): el titular va en la pantalla madre.
         El CSV va con la tabla, que es lo que se lleva. -->
    <p class="max-w-prose text-muted-foreground">
      Horas que alguien tomó y dejó vacías, sobre el total reservado del período. Solo cuentan las
      que el club <strong>confirmó</strong> al resolver el reporte: uno pendiente es una acusación
      que nadie miró todavía.
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
      <p class="mt-6 text-destructive">No se pudieron contar las horas no usadas. Reintenta en un momento.</p>
    } @else if (reporte.value(); as datos) {
      @if (datos.filas.length === 0) {
        <app-estado-vacio
          class="mt-6 block"
          icono="event_available"
          titulo="No hubo reservas en este período"
          detalle="Sin horas reservadas no hay nada que comparar."
        />
      } @else {
        <div class="mt-6 overflow-x-auto">
          <table mat-table class="text-sm" [dataSource]="datos.filas">
            <caption class="sr-only">
              Horas no usadas del período, cortadas por
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
            <ng-container matColumnDef="noUsadas">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">No usadas</th>
              <td mat-cell *matCellDef="let fila" class="numero">{{ fila.noUsadas }}</td>
              <td mat-footer-cell *matFooterCellDef class="numero font-semibold">
                {{ datos.noUsadas }}
              </td>
            </ng-container>
            <ng-container matColumnDef="reservadas">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Reservadas</th>
              <td
                mat-cell
                *matCellDef="let fila"
                class="py-2 pr-3 text-right text-muted-foreground"
              >
                {{ fila.reservadas }}
              </td>
              <td mat-footer-cell *matFooterCellDef class="numero">{{ datos.reservadas }}</td>
            </ng-container>
            <ng-container matColumnDef="proporcion">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Proporción</th>
              <td mat-cell *matCellDef="let fila" class="numero font-semibold">
                {{ enPorcentaje(fila) }}
              </td>
              <td mat-footer-cell *matFooterCellDef class="numero font-semibold">
                {{ enPorcentaje(datos) }}
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="COLUMNAS; sticky: true"></tr>
            <tr mat-row *matRowDef="let fila; columns: COLUMNAS"></tr>
            <tr mat-footer-row *matFooterRowDef="COLUMNAS"></tr>
          </table>
        </div>
      }

      <div class="mt-4 grid gap-1 text-sm text-muted-foreground">
        @if (datos.sinResolver > 0) {
          <!-- Un indicador que depende de la diligencia del admin tiene que mostrar
               esa dependencia, o un número bajo se lee como una buena noticia. -->
          <p>
            Hay <strong>{{ datos.sinResolver }}</strong> reportes <strong>sin revisar</strong> en
            este período. Cuando el club los resuelva, los que confirme se suman acá.
          </p>
        }
        <p>Calculado el {{ enPalabras(datos.calculadoEn) }}.</p>
      </div>

      <div class="mt-4">
        <app-descargar-csv [url]="urlDelCsv()" />
      </div>
    } @else if (reporte.isLoading()) {
      <app-esqueleto class="mt-6 block" [filas]="4" etiqueta="Contando las horas del período…" />
    }
  `,
})
export class NoUsoPanel {
  private readonly api = inject(Reportes);

  protected readonly OPCIONES = (Object.keys(CORTES_DE_NO_USO) as CorteDeNoUso[]).map((valor) => ({
    valor,
    etiqueta: CORTES_DE_NO_USO[valor],
  }));

  protected readonly desde = signal(textoAFecha(`${hoyEnElClub().slice(0, 7)}-01`));
  protected readonly hasta = signal(textoAFecha(hoyEnElClub()));
  protected readonly corte = signal('mes');

  protected readonly reporte = resource({
    params: () => ({
      desde: fechaATexto(this.desde()),
      hasta: fechaATexto(this.hasta()),
      corte: this.corte() as CorteDeNoUso,
    }),
    loader: ({ params }) => this.api.noUso(params.desde, params.hasta, params.corte),
  });

  /** El CSV lleva el mismo rango y corte: si no, el club descarga otra cosa. */
  protected readonly urlDelCsv = computed(() =>
    this.api.csv('no-uso', fechaATexto(this.desde()), fechaATexto(this.hasta()), this.corte()),
  );

  protected readonly COLUMNAS = ['corte', 'noUsadas', 'reservadas', 'proporcion'];

  protected nombreDelCorte(corte: CorteDeNoUso): string {
    return CORTES_DE_NO_USO[corte] ?? corte;
  }

  /** Cero por ciento de nada no es una buena noticia: es que no hubo nada. */
  protected enPorcentaje(fila: Pick<FilaDeNoUso, 'porcentaje'>): string {
    return fila.porcentaje === null ? 'Sin reservas' : `${fila.porcentaje} %`;
  }

  protected enPalabras(instante: string): string {
    return diaConAnioEnPalabras(fechaEnElClub(instante));
  }
}
