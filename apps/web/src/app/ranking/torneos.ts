import { Component, computed, inject, resource } from '@angular/core';

import { diaConAnioEnPalabras } from '../catalogo-canchas/reloj-del-club';
import { Auth } from '../core/auth/auth';
import { EstadoVacio } from '../ui/estado-vacio';
import { Ranking } from './ranking.service';
import { TablaInterna } from './tabla-interna';

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
  imports: [EstadoVacio, TablaInterna],
  template: `
    <!-- Cabecera en banda de color y sin fotografía: esta pantalla es una tabla
         de posiciones, y lo que se viene a hacer acá es buscar un nombre en una
         lista. Una foto grande arriba solo alejaría la primera fila. -->
    <section
      class="-mx-4 bg-campo px-4 py-8 text-on-campo sm:mx-0 sm:rounded-region sm:px-8"
      aria-labelledby="ranking"
    >
      <h1 id="ranking" class="titular text-5xl sm:text-7xl">Ranking de torneos</h1>
      <p class="mt-2 max-w-prose text-on-campo/90">
        Los puntos de cada jugador según hasta dónde llegó en cada torneo, multiplicados
        por la categoría.
      </p>
    </section>

    @if (tabla.error()) {
      <p class="mt-6 text-destructive">
        No se pudo cargar el ranking. Reintenta en un momento.
      </p>
    } @else if (tabla.value(); as datos) {
      <p class="mt-4 max-w-prose text-sm text-muted-foreground">
        <!-- El punto va pegado al cierre del strong y no en la línea siguiente: si se
             separa, el navegador dibuja "26 de agosto de 2025 ." con un espacio.
             (Y sin comillas invertidas en este comentario: rompen el template.) -->
        Suma los torneos terminados desde el
        <strong>{{ enPalabras(datos.desde) }}</strong
        >. Los puntos duran 52 semanas y después caducan solos, así que la tabla cambia aunque no se
        juegue nada.
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
        <div class="mt-6 overflow-x-auto" data-tabla="torneos">
          <table class="tabla text-sm max-sm:[&_td]:px-2 max-sm:[&_th]:px-2">
            <caption class="sr-only">
              Puntos por jugador en los torneos de las últimas 52 semanas
            </caption>
            <thead>
              <tr>
                <th scope="col">Puesto</th>
                <th scope="col">Jugador</th>
                <th scope="col" class="numero">Puntos</th>
                <th scope="col" class="numero">Torneos</th>
              </tr>
            </thead>
            <tbody>
              @for (fila of datos.posiciones; track fila.jugadorId) {
                <!-- EL PODIO (TV4.5): del puesto 3 para arriba, con empates, el
                     puesto va en un rótulo y el nombre y los puntos en la
                     condensada, como la tabla de una transmisión. Es lo que alguien
                     busca primero, y sin eso las cuarenta filas se leen iguales.
                     **Sin rebote ni overshoot en la entrada**: MASTER.md § Motion
                     lo dice para tabla densa, y D4.4 dejó la pantalla sin foto. -->
                <tr
                  [attr.data-podio]="fila.puesto <= 3 ? '' : null"
                  [class.bg-selected]="fila.puesto <= 3"
                >
                  <td class="font-display font-bold">
                    @if (fila.puesto <= 3) {
                      <span
                        class="inline-grid size-9 place-items-center bg-rotulo text-xl
                               font-extrabold text-on-rotulo"
                      >
                        {{ fila.puesto }}
                      </span>
                    } @else {
                      {{ fila.puesto }}
                    }
                  </td>
                  <!-- El nombre es el encabezado de fila, no el puesto: con empates el
                       puesto se repite, y un encabezado que dice "1" en dos filas no
                       identifica ninguna. Quien escucha la tabla necesita oír de quién
                       son los 650 puntos. -->
                  <th
                    scope="row"
                    [class]="
                      fila.puesto <= 3
                        ? 'font-display text-lg font-bold tracking-wide uppercase'
                        : ''
                    "
                  >
                    {{ fila.nombre }}
                  </th>
                  <td
                    class="numero font-semibold"
                    [class]="fila.puesto <= 3 ? 'font-display text-xl text-primary' : ''"
                  >
                    {{ fila.puntos }}
                  </td>
                  <!-- Sin rellenos a mano: los ponía la tabla vieja en unas celdas y
                       no en otras, y las columnas no alineaban con la primitiva. -->
                  <td class="numero text-muted-foreground">{{ fila.torneos }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (datos.torneos.length > 0) {
        <section class="mt-8">
          <h2 class="font-display text-lg font-bold tracking-wide uppercase">
            Cuadros que está contando
          </h2>
          <ul class="mt-2 grid gap-1 text-sm text-muted-foreground">
            <!-- Cada cuadro con su nivel y con cuánto valía ganarlo (T70): una misma
                 Copa aparece tres veces, una por categoría, y no valen lo mismo. -->
            @for (cuadro of datos.torneos; track cuadro.id) {
              <li>
                {{ cuadro.nombre }} · {{ cuadro.categoria }} · {{ cuadro.valor }} ·
                terminó el {{ enPalabras(cuadro.fechaFin) }}
              </li>
            }
          </ul>
        </section>
      }
    } @else if (tabla.isLoading()) {
      <p class="mt-6 text-muted-foreground">Cargando el ranking…</p>
    }

    <!-- La tabla del club solo para socios: el endpoint la niega a los demás, y una
         sección que carga un 403 es peor que una que no está. Las dos comparten
         pantalla porque comparten vocabulario, pero no comparten público. -->
    @if (esSocio()) {
      <section class="mt-12">
        <h2 class="titular text-4xl sm:text-5xl">Tabla del club</h2>
        <p class="mt-1 max-w-prose text-muted-foreground">
          El orden de juego entre socios, con los amistosos que ustedes mismos cargan.
        </p>
        <app-tabla-interna />
      </section>
    }
  `,
})
export class RankingDeTorneos {
  private readonly api = inject(Ranking);

  protected readonly tabla = resource({ loader: () => this.api.torneos() });

  protected readonly enPalabras = diaConAnioEnPalabras;

  private readonly sesion = inject(Auth);
  protected readonly esSocio = computed(() => this.sesion.usuario()?.socioId != null);
}
