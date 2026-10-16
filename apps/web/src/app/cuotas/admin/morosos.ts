import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';
import { Esqueleto } from '../../ui/esqueleto';

import { enPesos } from '../../catalogo-canchas/reloj-del-club';
import { EstadoVacio } from '../../ui/estado-vacio';
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
  imports: [MatTableModule, Esqueleto, RouterLink, EstadoVacio, MatChipsModule, MatIcon],
  template: `
    <!-- Es una pestaña de Finanzas (T286): el titular va en la pantalla madre. -->
    <p class="max-w-prose text-muted-foreground">
      Ordenados por lo que deben. Se cuenta por cuotas impagas, no por fechas.
    </p>

    @if (morosos.isLoading()) {
      <app-esqueleto class="mt-4 block" [filas]="5" etiqueta="Cargando los socios con deuda…" />
    } @else if (morosos.error()) {
      <p class="mt-4 text-destructive">
        No se pudieron cargar los socios con deuda. Reintenta en un momento.
      </p>
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
        <table mat-table aria-label="Socios con cuotas impagas" [dataSource]="morosos.value()">
          <ng-container matColumnDef="numero">
            <th mat-header-cell *matHeaderCellDef scope="col">Nº</th>
            <td mat-cell *matCellDef="let moroso" class="font-mono text-sm">
              {{ moroso.numeroSocio }}
            </td>
          </ng-container>
          <ng-container matColumnDef="socio">
            <th mat-header-cell *matHeaderCellDef scope="col">Socio</th>
            <td mat-cell *matCellDef="let moroso" class="font-medium">
              {{ moroso.nombre }}
              <a
                [href]="'mailto:' + moroso.email"
                class="block text-sm font-normal text-muted-foreground underline"
              >
                {{ moroso.email }}
              </a>
            </td>
          </ng-container>
          <ng-container matColumnDef="desde">
            <th mat-header-cell *matHeaderCellDef scope="col">Debe desde</th>
            <td mat-cell *matCellDef="let moroso" class="whitespace-nowrap">
              {{ moroso.desdePeriodo }}
            </td>
          </ng-container>
          <ng-container matColumnDef="cuotas">
            <th mat-header-cell *matHeaderCellDef scope="col">Cuotas</th>
            <td mat-cell *matCellDef="let moroso">
              <mat-chip-set class="insignias">
                <mat-chip class="insignia" [class]="moroso.cuotasImpagas > 2 ? 'error' : 'aviso'">
                  <mat-icon matChipAvatar aria-hidden="true">receipt_long</mat-icon>
                  {{ moroso.cuotasImpagas }}
                </mat-chip>
              </mat-chip-set>
            </td>
          </ng-container>
          <ng-container matColumnDef="total">
            <th mat-header-cell *matHeaderCellDef scope="col">Total</th>
            <td mat-cell *matCellDef="let moroso" class="font-semibold whitespace-nowrap">
              {{ pesos(moroso.deudaClp) }}
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="COLUMNAS; sticky: true"></tr>
          <tr mat-row *matRowDef="let moroso; columns: COLUMNAS"></tr>
        </table>
      </div>

      <p class="mt-4 text-sm text-muted-foreground">
        Para cobrar una cuota, ábrela en
        <a routerLink="/administracion/finanzas/cuotas" class="underline">las cuotas del mes</a>.
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

  protected readonly COLUMNAS = ['numero', 'socio', 'desde', 'cuotas', 'total'];

  protected readonly pesos = enPesos;
}
