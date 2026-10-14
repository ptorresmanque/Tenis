import { Component, computed, inject, resource } from '@angular/core';
import { MatTableModule } from '@angular/material/table';

import { diaConAnioEnPalabras } from '../catalogo-canchas/reloj-del-club';
import { EstadoVacio } from '../ui/estado-vacio';
import { FilaInterna, Ranking } from './ranking.service';
import { Esqueleto } from '../ui/esqueleto';

/**
 * La tabla interna del club: el Elo de los amistosos entre socios.
 *
 * **Los inactivos van aparte, no mezclados.** Quien no juega hace seis meses sale de la
 * tabla principal con su Elo intacto: un ranking con alguien arriba que no juega hace
 * dos años no lo cree nadie, y ponerlo al fondo de la misma lista lo haría parecer malo
 * en vez de ausente.
 *
 * La pantalla dice dos cosas que evitan la llamada al club: **cuál es el último partido
 * que cuenta** y que **solo cuentan los confirmados**. Las dos preguntas que llegan son
 * "cargué uno y no se movió" y "¿por qué no estoy?".
 */
@Component({
  selector: 'app-tabla-interna',
  imports: [
    EstadoVacio,
    Esqueleto,
    MatTableModule,
  ],
  template: `
    @if (tabla.error()) {
      <p class="mt-4 text-destructive">
        No se pudo cargar la tabla del club. Reintenta en un momento.
      </p>
    } @else if (tabla.value(); as datos) {
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        Solo cuentan los partidos <strong>confirmados</strong> por el rival.
        @if (datos.ultimoPartido; as ultimo) {
          El último que entró es del {{ enPalabras(ultimo) }}.
        }
      </p>

      @if (datos.posiciones.length === 0) {
        <app-estado-vacio
          class="mt-4 block"
          icono="sports_tennis"
          titulo="Todavía no hay partidos confirmados"
          detalle="En cuanto dos socios carguen uno y lo confirmen, la tabla aparece acá."
        />
      } @else {
        <!-- En el teléfono, menos relleno por celda (TV4.5): con el de la primitiva,
             cinco columnas no caben en 296px. -->
        <div class="mt-4 overflow-x-auto" data-tabla="activos">
          <table
            mat-table
            class="text-sm max-sm:[&_td]:px-2 max-sm:[&_th]:px-2"
            [dataSource]="activos()"
          >
            <caption class="sr-only">
              Elo de los socios que jugaron en los últimos seis meses
            </caption>
            <ng-container matColumnDef="puesto">
              <th mat-header-cell *matHeaderCellDef scope="col">Puesto</th>
              <td mat-cell *matCellDef="let fila" class="font-display font-bold">
                {{ fila.puesto }}
              </td>
            </ng-container>
            <!-- El nombre es el encabezado de fila y no el puesto: con empates
                 el puesto se repite, y uno que dice "1" en dos filas no
                 identifica ninguna. -->
            <ng-container matColumnDef="socio">
              <th mat-header-cell *matHeaderCellDef scope="col">Socio</th>
              <th *matCellDef="let fila" scope="row" class="mat-mdc-cell mdc-data-table__cell">
                {{ fila.nombre }}
              </th>
            </ng-container>
            <ng-container matColumnDef="elo">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Elo</th>
              <td mat-cell *matCellDef="let fila" class="numero font-semibold">{{ fila.elo }}</td>
            </ng-container>
            <!-- Sin rellenos a mano: la tabla alinea las columnas (TV4.5). -->
            <ng-container matColumnDef="jugados">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Jugados</th>
              <td mat-cell *matCellDef="let fila" class="numero text-muted-foreground">
                {{ fila.partidos }}
              </td>
            </ng-container>
            <ng-container matColumnDef="ganados">
              <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Ganados</th>
              <td mat-cell *matCellDef="let fila" class="numero text-muted-foreground">
                {{ fila.ganados }}
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="COLUMNAS_ACTIVOS; sticky: true"></tr>
            <tr mat-row *matRowDef="let fila; columns: COLUMNAS_ACTIVOS"></tr>
          </table>
        </div>
      }

      @if (inactivos().length > 0) {
        <section class="mt-8">
          <h3 class="font-display text-base font-bold tracking-wide uppercase">
            Sin jugar hace rato
          </h3>
          <p class="mt-1 max-w-prose text-sm text-muted-foreground">
            No juegan un partido confirmado desde antes del
            {{ enPalabras(datos.inactivosDesde) }}, así que salen de la tabla. Su puntaje los
            espera: vuelven con el mismo.
          </p>

          <div class="mt-3 overflow-x-auto" data-tabla="inactivos">
            <table
              mat-table
              class="text-sm max-sm:[&_td]:px-2 max-sm:[&_th]:px-2"
              [dataSource]="inactivos()"
            >
              <caption class="sr-only">
                Socios fuera de la tabla principal, con su Elo conservado
              </caption>
              <ng-container matColumnDef="socio">
                <th mat-header-cell *matHeaderCellDef scope="col">Socio</th>
                <th *matCellDef="let fila" scope="row" class="mat-mdc-cell mdc-data-table__cell">
                  {{ fila.nombre }}
                </th>
              </ng-container>
              <ng-container matColumnDef="elo">
                <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Elo</th>
                <td mat-cell *matCellDef="let fila" class="numero">{{ fila.elo }}</td>
              </ng-container>
              <ng-container matColumnDef="ultimo">
                <th mat-header-cell *matHeaderCellDef scope="col" class="numero">Último partido</th>
                <td mat-cell *matCellDef="let fila" class="numero text-muted-foreground">
                  {{ enPalabras(fila.ultimoPartido) }}
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="COLUMNAS_INACTIVOS; sticky: true"></tr>
              <tr mat-row *matRowDef="let fila; columns: COLUMNAS_INACTIVOS"></tr>
            </table>
          </div>
        </section>
      }
    } @else if (tabla.isLoading()) {
      <app-esqueleto class="mt-4 block" [filas]="5" etiqueta="Cargando la tabla del club…" />
    }
  `,
})
export class TablaInterna {
  protected readonly COLUMNAS_INACTIVOS = ['socio', 'elo', 'ultimo'];

  protected readonly COLUMNAS_ACTIVOS = ['puesto', 'socio', 'elo', 'jugados', 'ganados'];

  private readonly api = inject(Ranking);

  protected readonly tabla = resource({ loader: () => this.api.interno() });

  protected readonly activos = computed(() => this.deLaTabla(true));
  protected readonly inactivos = computed(() => this.deLaTabla(false));

  protected readonly enPalabras = diaConAnioEnPalabras;

  private deLaTabla(activo: boolean): FilaInterna[] {
    return (this.tabla.value()?.posiciones ?? []).filter((fila) => fila.activo === activo);
  }
}
