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
import {
  CorteDeOcupacion,
  CORTES_DE_OCUPACION,
  FilaDeOcupacion,
  Reportes,
} from './reportes.service';

/**
 * Cuánta cancha se usó y cuánta se desperdició.
 *
 * **Las horas cerradas van en columna propia, ni ocupadas ni libres.** Una cancha
 * cerrada por riego o por un torneo no estuvo a la venta: contarla como disponible
 * castiga al club por mantener la cancha, y contarla como ocupada le inventa un uso que
 * no tuvo. Por eso sale del denominador y la pantalla lo dice.
 *
 * El denominador son las horas que existieron según el horario de apertura de cada
 * día, no un día de veinticuatro horas: la ocupación de un día en que la cancha abrió
 * cuatro horas se mide sobre cuatro.
 */
@Component({
  selector: 'app-ocupacion-panel',
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
    <!-- Es una pestaña de la agenda (T285): el titular va en la pantalla madre. El CSV va con
         la tabla, que es lo que se lleva. -->
    <p class="max-w-prose text-muted-foreground">
      Qué proporción de las horas que el club abrió se ocupó de verdad. Cuenta sobre las horas que
      existieron ese día según el horario de apertura, no sobre el día entero.
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
      <p class="mt-6 text-destructive">
        No se pudo calcular la ocupación. El período puede ser demasiado largo: pruébalo de a un año
        como máximo.
      </p>
    } @else if (reporte.value(); as datos) {
      @if (datos.filas.length === 0) {
        <app-estado-vacio
          class="mt-6 block"
          icono="event_busy"
          titulo="No hubo horas que medir en este período"
          detalle="Ninguna cancha tuvo horario de apertura en el rango que elegiste."
        />
      } @else {
        <div class="mt-6 overflow-x-auto">
          <table mat-table class="text-sm" [dataSource]="datos.filas">
            <caption class="sr-only">
              Ocupación del período, cortada por
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
            <ng-container matColumnDef="ocupados">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Ocupadas</th>
              <td mat-cell *matCellDef="let fila" class="numero">{{ enHoras(fila.ocupados) }}</td>
              <td mat-footer-cell *matFooterCellDef class="numero font-semibold">
                {{ enHoras(datos.ocupados) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="libres">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Libres</th>
              <td
                mat-cell
                *matCellDef="let fila"
                class="py-2 pr-3 text-right text-muted-foreground"
              >
                {{ enHoras(fila.libres) }}
              </td>
              <td mat-footer-cell *matFooterCellDef class="numero">{{ enHoras(datos.libres) }}</td>
            </ng-container>
            <ng-container matColumnDef="cerrados">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Cerradas</th>
              <td
                mat-cell
                *matCellDef="let fila"
                class="py-2 pr-3 text-right text-muted-foreground"
              >
                {{ enHoras(fila.cerrados) }}
              </td>
              <td mat-footer-cell *matFooterCellDef class="numero">
                {{ enHoras(datos.cerrados) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="ocupacion">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Ocupación</th>
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
        <!-- Sin esto, nadie entiende por qué 45 de 60 da 90 %. -->
        <p>
          Las horas cerradas por mantención o por un torneo
          <strong>no entran</strong>
          en el porcentaje: la cancha no estuvo a la venta esas horas. Las clases sí cuentan como
          ocupación.
        </p>
        <p>Calculado el {{ enPalabras(datos.calculadoEn) }}.</p>
      </div>

      <div class="mt-4">
        <app-descargar-csv [url]="urlDelCsv()" />
      </div>
    } @else if (reporte.isLoading()) {
      <app-esqueleto class="mt-6 block" [filas]="4" etiqueta="Midiendo las horas del período…" />
    }
  `,
})
export class OcupacionPanel {
  private readonly api = inject(Reportes);

  protected readonly OPCIONES = (Object.keys(CORTES_DE_OCUPACION) as CorteDeOcupacion[]).map(
    (valor) => ({ valor, etiqueta: CORTES_DE_OCUPACION[valor] }),
  );

  protected readonly desde = signal(textoAFecha(`${hoyEnElClub().slice(0, 7)}-01`));
  protected readonly hasta = signal(textoAFecha(hoyEnElClub()));
  protected readonly corte = signal('condicion');

  protected readonly reporte = resource({
    params: () => ({
      desde: fechaATexto(this.desde()),
      hasta: fechaATexto(this.hasta()),
      corte: this.corte() as CorteDeOcupacion,
    }),
    loader: ({ params }) => this.api.ocupacion(params.desde, params.hasta, params.corte),
  });

  /** El CSV lleva el mismo rango y corte: si no, el club descarga otra cosa. */
  protected readonly urlDelCsv = computed(() =>
    this.api.csv('ocupacion', fechaATexto(this.desde()), fechaATexto(this.hasta()), this.corte()),
  );

  protected readonly COLUMNAS = ['corte', 'ocupados', 'libres', 'cerrados', 'ocupacion'];

  protected nombreDelCorte(corte: CorteDeOcupacion): string {
    return CORTES_DE_OCUPACION[corte] ?? corte;
  }

  /**
   * El porcentaje, o "Sin horas" cuando no hubo ninguna que ofrecer.
   *
   * Un cero se lee como "nadie vino", y lo que pasó fue que la cancha estuvo cerrada
   * todo el período. Son dos cosas distintas y la tabla no puede confundirlas.
   */
  protected enPorcentaje(fila: Pick<FilaDeOcupacion, 'porcentajeOcupacion'>): string {
    return fila.porcentajeOcupacion === null ? 'Sin horas' : `${fila.porcentajeOcupacion} %`;
  }

  /** Las horas con coma decimal: desde T77 se miden medias horas, y acá "1,5" es como se escribe. */
  protected enHoras(horas: number): string {
    return horas.toLocaleString('es-CL');
  }

  /** Pasa por el reloj del club: el ISO llega en UTC y el día puede no coincidir. */
  protected enPalabras(instante: string): string {
    return diaConAnioEnPalabras(fechaEnElClub(instante));
  }
}
