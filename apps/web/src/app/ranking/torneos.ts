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
      <h1 id="ranking" class="font-display text-4xl font-black tracking-tight sm:text-5xl">
        Ranking de torneos
      </h1>
      <p class="mt-2 max-w-prose text-on-campo/90">
        Los puntos de cada jugador según hasta dónde llegó en cada torneo, multiplicados
        por la categoría.
      </p>
    </section>

    @if (tabla.value(); as datos) {
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
          <table class="tabla text-sm">
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
                <!-- Los tres primeros con el puesto en grande: es lo que alguien
                     busca primero cuando abre una tabla de posiciones, y sin eso
                     las cuarenta filas se leen todas iguales. **Sin rebote ni
                     overshoot en la entrada**: MASTER.md § Motion lo dice para
                     tabla densa, donde el movimiento elástico se lee como
                     descuido y no como intención. -->
                <tr
                  class="border-b border-border last:border-0"
                  [class.bg-selected]="fila.puesto <= 3"
                >
                  <td
                    class="py-2 pr-3 font-display font-bold"
                    [class.text-xl]="fila.puesto <= 3"
                    [class.text-primary]="fila.puesto <= 3"
                  >
                    {{ fila.puesto }}
                  </td>
                  <!-- El nombre es el encabezado de fila, no el puesto: con empates el
                       puesto se repite, y un encabezado que dice "1" en dos filas no
                       identifica ninguna. Quien escucha la tabla necesita oír de quién
                       son los 650 puntos. -->
                  <th scope="row">
                    {{ fila.nombre }}
                  </th>
                  <td class="numero font-semibold">{{ fila.puntos }}</td>
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
          <h2 class="font-display text-lg font-semibold">Cuadros que está contando</h2>
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
        <h2 class="font-display text-2xl font-bold">Tabla del club</h2>
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
