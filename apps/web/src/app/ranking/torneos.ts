import { Component, inject, resource } from '@angular/core';

import { diaConAnioEnPalabras } from '../catalogo-canchas/reloj-del-club';
import { EstadoVacio } from '../ui/estado-vacio';
import { Ranking } from './ranking.service';

/**
 * El ranking de torneos del club.
 *
 * **La pantalla dice qué está contando.** No es un adorno: los puntos caducan a las 52
 * semanas y nadie los borra, así que un lunes cualquiera un jugador baja tres puestos
 * sin que haya pasado nada. Una tabla que no muestra su corte ni los torneos que suma
 * es una llamada al club esa misma tarde.
 *
 * De las personas sale el nombre y el puntaje. Es lo mismo que ya está a la vista de
 * cualquiera que mire el mural.
 */
@Component({
  selector: 'app-ranking-torneos',
  imports: [EstadoVacio],
  template: `
    <h1 class="font-display text-4xl font-bold">Ranking de torneos</h1>
    <p class="mt-2 max-w-prose text-lg text-muted-foreground">
      Los puntos de cada jugador según hasta dónde llegó en cada torneo, multiplicados por la
      categoría.
    </p>

    @if (tabla.value(); as datos) {
      <p class="mt-4 max-w-prose text-sm text-muted-foreground">
        <!-- El punto va pegado al cierre del strong y no en la línea siguiente: si se
             separa, el navegador dibuja "26 de agosto de 2025 ." con un espacio.
             (Y sin comillas invertidas en este comentario: rompen el template.) -->
        Suma los torneos terminados desde el
        <strong>{{ enPalabras(datos.desde) }}</strong
        >. Los puntos duran 52 semanas y después caducan solos, así que la tabla
        cambia aunque no se juegue nada.
      </p>

      @if (datos.posiciones.length === 0) {
        <app-estado-vacio
          class="mt-6 block"
          icono="leaderboard"
          titulo="Todavía no hay puntos en la ventana"
          detalle="Cuando termine un torneo, sus puntos aparecen acá sin que nadie los cargue."
        />
      } @else {
        <!-- Una tabla de verdad, al revés que el cuadro: acá las filas son
             comparables entre sí y las columnas significan lo mismo en todas. Sin
             encabezados, un lector de pantalla lee cuatro números sueltos por fila. -->
        <div class="mt-6 overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">
              Puntos por jugador en los torneos de las últimas 52 semanas
            </caption>
            <thead>
              <tr class="border-b border-border text-left text-muted-foreground">
                <th scope="col" class="py-2 pr-3 font-medium">Puesto</th>
                <th scope="col" class="py-2 pr-3 font-medium">Jugador</th>
                <th scope="col" class="py-2 pr-3 text-right font-medium">Puntos</th>
                <th scope="col" class="py-2 text-right font-medium">Torneos</th>
              </tr>
            </thead>
            <tbody>
              @for (fila of datos.posiciones; track fila.jugadorId) {
                <tr class="border-b border-border last:border-0">
                  <td class="py-2 pr-3 font-semibold">{{ fila.puesto }}</td>
                  <!-- El nombre es el encabezado de fila, no el puesto: con empates el
                       puesto se repite, y un encabezado que dice "1" en dos filas no
                       identifica ninguna. Quien escucha la tabla necesita oír de quién
                       son los 650 puntos. -->
                  <th scope="row" class="py-2 pr-3 text-left font-normal">
                    {{ fila.nombre }}
                  </th>
                  <td class="py-2 pr-3 text-right font-semibold">{{ fila.puntos }}</td>
                  <td class="py-2 text-right text-muted-foreground">
                    {{ fila.torneos }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (datos.torneos.length > 0) {
        <section class="mt-8">
          <h2 class="font-display text-lg font-semibold">Torneos que está contando</h2>
          <ul class="mt-2 grid gap-1 text-sm text-muted-foreground">
            @for (torneo of datos.torneos; track torneo.id) {
              <li>
                {{ torneo.nombre }} · {{ torneo.categoria }} · terminó el
                {{ enPalabras(torneo.fechaFin) }}
              </li>
            }
          </ul>
        </section>
      }
    } @else if (tabla.isLoading()) {
      <p class="mt-6 text-muted-foreground">Cargando el ranking…</p>
    }
  `,
})
export class RankingDeTorneos {
  private readonly api = inject(Ranking);

  protected readonly tabla = resource({ loader: () => this.api.torneos() });

  protected readonly enPalabras = diaConAnioEnPalabras;
}
