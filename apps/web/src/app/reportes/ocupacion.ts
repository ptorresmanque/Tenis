import { Component, inject, resource, signal } from '@angular/core';

import {
  diaConAnioEnPalabras,
  fechaEnElClub,
  hoyEnElClub,
} from '../catalogo-canchas/reloj-del-club';
import { EstadoVacio } from '../ui/estado-vacio';
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
 * El denominador son los bloques que existieron según el horario de apertura de cada
 * día, no un día de veinticuatro horas: la ocupación de un día en que la cancha abrió
 * cuatro horas se mide sobre cuatro.
 */
@Component({
  selector: 'app-ocupacion-panel',
  imports: [EstadoVacio],
  template: `
    <h1 class="font-display text-2xl font-bold">Ocupación de cancha</h1>
    <p class="mt-2 max-w-prose text-sm text-muted-foreground">
      Qué proporción de las horas que el club abrió se ocupó de verdad. Cuenta sobre los bloques que
      existieron ese día según el horario de apertura, no sobre el día entero.
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
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">
              Ocupación del período, cortada por
              {{
                nombreDelCorte(datos.corte)
              }}
            </caption>
            <thead>
              <tr class="border-b border-border text-left text-muted-foreground">
                <th scope="col" class="py-2 pr-3 font-medium">Corte</th>
                <th scope="col" class="py-2 pr-3 text-right font-medium">Ocupadas</th>
                <th scope="col" class="py-2 pr-3 text-right font-medium">Libres</th>
                <th scope="col" class="py-2 pr-3 text-right font-medium">Cerradas</th>
                <th scope="col" class="py-2 text-right font-medium">Ocupación</th>
              </tr>
            </thead>
            <tbody>
              @for (fila of datos.filas; track fila.etiqueta) {
                <tr class="border-b border-border">
                  <th scope="row" class="py-2 pr-3 text-left font-normal">
                    {{ fila.etiqueta }}
                  </th>
                  <td class="py-2 pr-3 text-right">{{ fila.ocupados }}</td>
                  <td class="py-2 pr-3 text-right text-muted-foreground">
                    {{ fila.libres }}
                  </td>
                  <td class="py-2 pr-3 text-right text-muted-foreground">
                    {{ fila.cerrados }}
                  </td>
                  <td class="py-2 text-right font-semibold">
                    {{ enPorcentaje(fila) }}
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" class="py-2 pr-3 text-left font-semibold">Total</th>
                <td class="py-2 pr-3 text-right font-semibold">{{ datos.ocupados }}</td>
                <td class="py-2 pr-3 text-right">{{ datos.libres }}</td>
                <td class="py-2 pr-3 text-right">{{ datos.cerrados }}</td>
                <td class="py-2 text-right font-semibold">
                  {{ enPorcentaje(datos) }}
                </td>
              </tr>
            </tfoot>
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
    } @else if (reporte.isLoading()) {
      <p class="mt-6 text-muted-foreground">Midiendo las horas del período…</p>
    }
  `,
})
export class OcupacionPanel {
  private readonly api = inject(Reportes);

  protected readonly OPCIONES = (Object.keys(CORTES_DE_OCUPACION) as CorteDeOcupacion[]).map(
    (valor) => ({ valor, etiqueta: CORTES_DE_OCUPACION[valor] }),
  );

  protected readonly desde = signal(`${hoyEnElClub().slice(0, 7)}-01`);
  protected readonly hasta = signal(hoyEnElClub());
  protected readonly corte = signal('condicion');

  protected readonly reporte = resource({
    params: () => ({
      desde: this.desde(),
      hasta: this.hasta(),
      corte: this.corte() as CorteDeOcupacion,
    }),
    loader: ({ params }) => this.api.ocupacion(params.desde, params.hasta, params.corte),
  });

  protected valorDe(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }

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

  /** Pasa por el reloj del club: el ISO llega en UTC y el día puede no coincidir. */
  protected enPalabras(instante: string): string {
    return diaConAnioEnPalabras(fechaEnElClub(instante));
  }
}
