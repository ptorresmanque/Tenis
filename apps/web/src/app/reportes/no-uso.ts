import { Component, computed, inject, resource, signal } from '@angular/core';

import {
  diaConAnioEnPalabras,
  fechaEnElClub,
  hoyEnElClub,
} from '../catalogo-canchas/reloj-del-club';
import { EstadoVacio } from '../ui/estado-vacio';
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
  imports: [EstadoVacio, DescargarCsv],
  template: `
    <h1 class="font-display text-2xl font-bold">Horas reservadas y no usadas</h1>
    <p class="mt-2 max-w-prose text-sm text-muted-foreground">
      Horas que alguien tomó y dejó vacías, sobre el total reservado del período. Solo cuentan las
      que el club <strong>confirmó</strong> al resolver el reporte: uno pendiente es una acusación
      que nadie miró todavía.
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
          icono="event_available"
          titulo="No hubo reservas en este período"
          detalle="Sin horas reservadas no hay nada que comparar."
        />
      } @else {
        <div class="mt-6 overflow-x-auto">
          <table class="tabla text-sm">
            <caption class="sr-only">
              Horas no usadas del período, cortadas por
              {{
                nombreDelCorte(datos.corte)
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">Corte</th>
                <th scope="col" class="numero">No usadas</th>
                <th scope="col" class="numero">Reservadas</th>
                <th scope="col" class="numero">Proporción</th>
              </tr>
            </thead>
            <tbody>
              @for (fila of datos.filas; track fila.etiqueta) {
                <tr>
                  <th scope="row">
                    {{ fila.etiqueta }}
                  </th>
                  <td class="numero">{{ fila.noUsadas }}</td>
                  <td class="py-2 pr-3 text-right text-muted-foreground">
                    {{ fila.reservadas }}
                  </td>
                  <td class="numero font-semibold">
                    {{ enPorcentaje(fila) }}
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" class="py-2 pr-3 text-left font-semibold">Total</th>
                <td class="numero font-semibold">{{ datos.noUsadas }}</td>
                <td class="numero">{{ datos.reservadas }}</td>
                <td class="numero font-semibold">
                  {{ enPorcentaje(datos) }}
                </td>
              </tr>
            </tfoot>
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
      <p class="mt-6 text-muted-foreground">Contando las horas del período…</p>
    }
  `,
})
export class NoUsoPanel {
  private readonly api = inject(Reportes);

  protected readonly OPCIONES = (Object.keys(CORTES_DE_NO_USO) as CorteDeNoUso[]).map((valor) => ({
    valor,
    etiqueta: CORTES_DE_NO_USO[valor],
  }));

  protected readonly desde = signal(`${hoyEnElClub().slice(0, 7)}-01`);
  protected readonly hasta = signal(hoyEnElClub());
  protected readonly corte = signal('mes');

  protected readonly reporte = resource({
    params: () => ({
      desde: this.desde(),
      hasta: this.hasta(),
      corte: this.corte() as CorteDeNoUso,
    }),
    loader: ({ params }) => this.api.noUso(params.desde, params.hasta, params.corte),
  });

  /** El CSV lleva el mismo rango y corte: si no, el club descarga otra cosa. */
  protected readonly urlDelCsv = computed(() =>
    this.api.csv('no-uso', this.desde(), this.hasta(), this.corte()),
  );

  protected valorDe(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }

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
