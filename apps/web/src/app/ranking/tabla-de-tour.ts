import { Component, inject, input, output, resource } from '@angular/core';

import { diaConAnioEnPalabras } from '../catalogo-canchas/reloj-del-club';
import { Esqueleto } from '../ui/esqueleto';
import { EstadoVacio } from '../ui/estado-vacio';
import { Ranking, TablaDeTorneos } from './ranking.service';

/**
 * La tabla de un tour en una temporada y una categoría de juego (T200, `SPEC-ranking.md`
 * § La pantalla). La usan `/ranking` y la página de cada tour.
 *
 * **Dice qué está contando**: la temporada con sus fechas y los cuadros con su nivel, para
 * que quien mira pueda ver de dónde salieron sus puntos. **El selector de categoría vive
 * acá** porque solo esta tabla sabe cuáles tienen resultados; la página decide qué hacer
 * con la elegida (ponerla en la dirección).
 *
 * De las personas sale el nombre y el puntaje: lo mismo que ya está en el mural.
 */
@Component({
  selector: 'app-tabla-de-tour',
  imports: [EstadoVacio, Esqueleto],
  template: `
    @if (tabla.error()) {
      <p class="mt-6 text-destructive">No se pudo cargar el ranking. Reintenta en un momento.</p>
    } @else if (tabla.value(); as datos) {
      <p class="mt-4 max-w-prose text-sm text-muted-foreground">
        Temporada {{ datos.temporada.nombre }}: del {{ enPalabras(datos.temporada.fechaInicio) }} al
        {{ enPalabras(datos.temporada.fechaFin) }}. Suman sus torneos terminados, cada uno con la
        tabla de su nivel.
      </p>

      @if (datos.categorias.length === 0) {
        <app-estado-vacio
          class="mt-6 block"
          icono="leaderboard"
          titulo="Esta temporada todavía no tiene torneos terminados."
          detalle="Cuando termine uno, sus puntos aparecen acá sin que nadie los cargue."
        />
      } @else {
        <!-- Solo las que tienen resultados: una lista con categorías vacías obliga a
             probar una por una. -->
        <label class="mt-4 block w-fit">
          <span class="text-sm font-medium">Categoría</span>
          <select
            class="campo mt-1"
            name="categoria"
            [value]="datos.categoriaJuegoId"
            (change)="elegir($event)"
          >
            <!-- Una categoría pedida que no tiene filas —un enlace viejo— no está en la
                 lista: sin esta opción, el selector mostraría la primera con la tabla
                 de otra. -->
            @if (!tieneFilas(datos)) {
              <option value="" disabled selected>Elige una categoría</option>
            }
            @for (una of datos.categorias; track una.id) {
              <option [value]="una.id" [selected]="una.id === datos.categoriaJuegoId">
                {{ una.nombre }}
              </option>
            }
          </select>
        </label>

        @if (datos.posiciones.length === 0) {
          <p class="mt-6 text-muted-foreground">Nadie suma puntos en esta categoría todavía.</p>
        } @else {
          <!-- Una tabla de verdad, al revés que el cuadro: acá las filas son
               comparables entre sí y las columnas significan lo mismo en todas. -->
          <div class="mt-6 overflow-x-auto" data-tabla="torneos">
            <table class="tabla text-sm max-sm:[&_td]:px-2 max-sm:[&_th]:px-2">
              <caption class="sr-only">
                Puntos por jugador en la temporada
                {{
                  datos.temporada.nombre
                }}
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
                  <!-- EL PODIO (TV4.5): del puesto 3 para arriba, con empates, el puesto
                       va en un rótulo y el nombre y los puntos en la condensada. Es lo
                       que alguien busca primero. -->
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
                         puesto se repite y no identifica a nadie. -->
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
              @for (cuadro of datos.torneos; track cuadro.id) {
                <li>
                  {{ cuadro.nombre }} · {{ cuadro.categoria }} · Nivel {{ cuadro.nivel }} · terminó
                  el {{ enPalabras(cuadro.fechaFin) }}
                </li>
              }
            </ul>
          </section>
        }
      }
    } @else if (tabla.isLoading()) {
      <app-esqueleto class="mt-6 block" [filas]="6" etiqueta="Cargando el ranking…" />
    }
  `,
})
export class TablaDeTour {
  private readonly api = inject(Ranking);

  readonly temporadaId = input.required<number>();
  /** La categoría de juego pedida, o nula: entonces el servidor sirve la más alta. */
  readonly categoriaId = input<number | null>(null);
  /** La que eligió quien mira. La página la pone en la dirección. */
  readonly categoria = output<number>();

  protected readonly tabla = resource({
    params: () => ({ temporada: this.temporadaId(), categoria: this.categoriaId() }),
    loader: ({ params }) => this.api.torneos(params.temporada, params.categoria),
  });

  /** Con el año: la pregunta es justamente de qué temporada. */
  protected readonly enPalabras = diaConAnioEnPalabras;

  protected tieneFilas(datos: TablaDeTorneos): boolean {
    return datos.categorias.some((una) => una.id === datos.categoriaJuegoId);
  }

  protected elegir(evento: Event): void {
    this.categoria.emit(Number((evento.target as HTMLSelectElement).value));
  }
}
