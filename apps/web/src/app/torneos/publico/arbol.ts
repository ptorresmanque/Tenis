import { Component, computed, input } from '@angular/core';

import {
  diaCortoEnElClub,
  horaEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { PartidoPublico } from '../torneos.service';
import { coincide, esBye, esDe } from './busqueda';

/** Un lado de un partido, como lo dibuja una fila de la caja. */
interface Lado {
  nombre: string | null;
  siembra: number | null;
  /** 0 es el jugador A y 1 el B: el índice en los sets de `setsDe`. */
  indice: 0 | 1;
}

/**
 * El árbol de una categoría (T137), con el diseño de la opción B: **el cuadro de siempre,
 * como el del mural**. Las rondas en columnas, con una línea de cada caja hacia la ronda
 * siguiente; en cada fila la siembra, el nombre y los sets; y bajo cada partido el día, la
 * hora y la cancha. En el teléfono se desliza hacia el costado.
 *
 * **Sin la franja azul del ganador** de la maqueta: el sitio no marca nada con una franja
 * al costado (design-tokens.spec.ts § Franjas). El ganador va en negrita y el que perdió,
 * en gris, como en el resto de la opción B.
 *
 * La búsqueda del modal marca acá lo mismo que en el orden de juego.
 */
@Component({
  selector: 'app-arbol',
  // La línea hacia la ronda siguiente: cruza el espacio entre columnas (`gap-6`) a la
  // altura del medio de la caja, como en el mural.
  styles: `
    [data-sigue]::after {
      content: '';
      position: absolute;
      top: 50%;
      right: -1.5rem;
      width: 1.5rem;
      border-top: 1px solid
        color-mix(in srgb, var(--color-muted-foreground) 45%, transparent);
    }
  `,
  template: `
    <div data-cuadro class="overflow-x-auto pb-2">
      <div class="flex w-max gap-6">
        @for (ronda of porRonda(); track ronda.numero; let ultima = $last) {
          <div data-ronda class="flex w-49 shrink-0 flex-col">
            <h3
              class="mb-1 font-display text-sm font-bold tracking-wider text-muted-foreground
                     uppercase"
            >
              {{ ronda.nombre }}
            </h3>
            <!-- Repartidas a lo alto: cada caja queda a la altura de las dos que la
                 alimentan, como en el cuadro del mural. -->
            <ul class="flex flex-1 flex-col justify-around">
              @for (partido of ronda.partidos; track partido.posicion) {
                <li
                  data-partido
                  [attr.data-sigue]="ultima ? null : ''"
                  [attr.data-tuyo]="esDe(partido, busqueda()) ? '' : null"
                  class="relative my-1.5 border border-border bg-card"
                  [class.outline-2]="esDe(partido, busqueda())"
                  [class.outline-accent-strong]="esDe(partido, busqueda())"
                  [class.-outline-offset-1]="esDe(partido, busqueda())"
                >
                  <div class="divide-y divide-border">
                    @for (lado of lados(partido); track lado.indice) {
                      <p
                        data-fila
                        [attr.data-gano]="gano(partido, lado) ? '' : null"
                        class="flex items-center gap-2 px-2 py-1.5 text-sm"
                        [class.font-bold]="gano(partido, lado)"
                        [class.text-muted-foreground]="perdio(partido, lado) || !lado.nombre"
                      >
                        <span
                          data-siembra
                          class="grid size-5 shrink-0 place-items-center rounded-control border
                                 border-border bg-card font-display text-xs font-bold
                                 text-muted-foreground"
                        >
                          {{ lado.siembra ?? '' }}
                        </span>
                        <span class="min-w-0 flex-1 truncate">
                          @if (lado.nombre) {
                            <!-- Abreviado, porque en el teléfono no cabe; el lector de
                                 pantalla oye el nombre completo. -->
                            <span
                              aria-hidden="true"
                              [class.bg-accent-soft]="coincide(lado.nombre, busqueda())"
                              [class.px-1]="coincide(lado.nombre, busqueda())"
                            >
                              {{ abreviar(lado.nombre) }}
                            </span>
                            <span class="sr-only">{{ lado.nombre }}</span>
                          } @else {
                            {{ vacio(partido, lado) }}
                          }
                        </span>
                        @if (gano(partido, lado)) {
                          <span class="sr-only">, ganó</span>
                        }
                        @if (setsDe(partido); as sets) {
                          <span class="sr-only">, sets:</span>
                          <span data-sets class="flex gap-1.5 font-display text-base tabular-nums">
                            @for (juegos of sets[lado.indice]; track $index) {
                              <span>{{ juegos }}</span>
                            }
                          </span>
                        }
                        @if (partido.walkover && perdio(partido, lado)) {
                          <span class="font-display text-xs font-bold">W.O.</span>
                          <span class="sr-only">, no se presentó</span>
                        }
                      </p>
                    }
                  </div>
                  <!-- Si no se puede repartir por sets, va tal cual: es lo que el club
                       escribió. -->
                  @if (partido.marcador && !setsDe(partido)) {
                    <p
                      data-marcador
                      class="border-t border-border px-2 py-1 font-display text-sm font-bold
                             tabular-nums"
                    >
                      {{ partido.marcador }}
                    </p>
                  }
                  @if (cuando(partido); as texto) {
                    <p data-cuando class="bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {{ texto }}
                    </p>
                  }
                </li>
              }
            </ul>
          </div>
        }
      </div>
    </div>
  `,
})
export class Arbol {
  readonly partidos = input.required<PartidoPublico[]>();

  /** Lo que se busca en el modal: marca acá lo mismo que en el orden de juego. */
  readonly busqueda = input('');

  protected readonly coincide = coincide;
  protected readonly esDe = esDe;

  protected readonly porRonda = computed(() => {
    const rondas = new Map<number, PartidoPublico[]>();

    for (const partido of this.partidos()) {
      rondas.set(partido.ronda, [...(rondas.get(partido.ronda) ?? []), partido]);
    }

    return [...rondas]
      .sort(([a], [b]) => a - b)
      .map(([numero, suyos]) => ({
        numero,
        nombre: suyos[0].ronda_nombre,
        partidos: [...suyos].sort((a, b) => a.posicion - b.posicion),
      }));
  });

  /** El nombre de cada ronda, para decir de dónde sale el que llega: "Ganador S2". */
  private readonly nombreDeRonda = computed(
    () => new Map(this.porRonda().map((ronda) => [ronda.numero, ronda.nombre])),
  );

  protected lados(partido: PartidoPublico): Lado[] {
    return [
      { nombre: partido.jugadorA, siembra: partido.siembraA, indice: 0 },
      { nombre: partido.jugadorB, siembra: partido.siembraB, indice: 1 },
    ];
  }

  /** Por nombre y no por id: la respuesta pública no trae ids de jugadores, a propósito. */
  protected gano(partido: PartidoPublico, lado: Lado): boolean {
    return lado.nombre !== null && partido.ganador === lado.nombre;
  }

  protected perdio(partido: PartidoPublico, lado: Lado): boolean {
    return lado.nombre !== null && partido.ganador !== null && partido.ganador !== lado.nombre;
  }

  /**
   * Lo que va en un lugar vacío. En primera ronda es un bye; después, el ganador del
   * partido que lo alimenta: "Ganador S2" sale de la segunda semifinal, y "Ganador P3",
   * del tercer partido de una ronda anterior.
   */
  protected vacio(partido: PartidoPublico, lado: Lado): string {
    if (partido.ronda === 1) return 'Bye';

    const anterior = this.nombreDeRonda().get(partido.ronda - 1);
    const codigo = anterior === 'Semifinal' ? 'S' : 'P';

    return `Ganador ${codigo}${partido.posicion * 2 - 1 + lado.indice}`;
  }

  /** "M. Riquelme": la inicial del nombre y el resto completo. */
  protected abreviar(nombre: string): string {
    const [primero, ...resto] = nombre.trim().split(/\s+/);

    return resto.length === 0 ? nombre : `${primero.charAt(0)}. ${resto.join(' ')}`;
  }

  /**
   * Los sets de cada uno, `[delA, delB]`, leídos del marcador con **los games del ganador
   * primero**, como lo pide el campo del panel ("6-4 3-6 7-5").
   *
   * Nulo si no se puede repartir: un texto que no son sets ("6-4 2-0 ret."), o uno que,
   * leído así, diría que el ganador perdió la mayoría. Ahí el marcador va tal cual, en vez
   * de repartirlo al revés.
   */
  protected setsDe(partido: PartidoPublico): [string[], string[]] | null {
    if (!partido.marcador || partido.ganador === null) return null;

    const sets = partido.marcador
      .trim()
      .split(/\s+/)
      .map((set) => /^(\d{1,2})-(\d{1,2})(?:\(\d+\))?$/.exec(set));
    if (sets.some((set) => set === null)) return null;

    const delGanador = sets.map((set) => set![1]);
    const delOtro = sets.map((set) => set![2]);
    const ganados = sets.filter((set) => Number(set![1]) > Number(set![2])).length;
    if (ganados * 2 <= sets.length) return null;

    return partido.ganador === partido.jugadorA ? [delGanador, delOtro] : [delOtro, delGanador];
  }

  /** "Sáb 10:00 · Cancha 1"; "Por programar" si falta; nada si ya se jugó o es un bye. */
  protected cuando(partido: PartidoPublico): string | null {
    if (partido.inicio && partido.cancha) {
      return `${diaCortoEnElClub(partido.inicio)} ${horaEnElClub(partido.inicio)} · ${partido.cancha}`;
    }

    return partido.ganador !== null || esBye(partido) ? null : 'Por programar';
  }
}
