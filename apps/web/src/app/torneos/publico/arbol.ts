import { Component, computed, input } from '@angular/core';

import {
  diaEnPalabras,
  fechaEnElClub,
  horaEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { PartidoPublico } from '../torneos.service';
import { coincide, esDe } from './busqueda';

/**
 * El árbol de una categoría (T137): la segunda pestaña del cuadro, detrás del orden de
 * juego. Las rondas en columnas, con los ganadores avanzando, y la cancha y la hora bajo
 * cada partido. La búsqueda del modal marca acá lo mismo que en el orden de juego.
 */
@Component({
  selector: 'app-arbol',
  template: `
    <!-- En columnas que se desplazan de lado y no una tabla que se encoge: en 375px una
         tabla de cuatro rondas queda ilegible, y el cuadro se mira sobre todo desde el
         teléfono, en el club. -->
    <div data-cuadro class="flex gap-3 overflow-x-auto pb-2">
      @for (ronda of porRonda(); track ronda.numero) {
        <div data-ronda class="w-52 shrink-0">
          <h3
            class="font-display text-sm font-semibold tracking-wider text-muted-foreground
                   uppercase"
          >
            {{ ronda.nombre }}
          </h3>
          <ul class="mt-2 grid gap-2">
            @for (partido of ronda.partidos; track partido.posicion) {
              <li
                data-partido
                [attr.data-tuyo]="esDe(partido, busqueda()) ? '' : null"
                class="border border-border bg-card text-sm"
                [class.outline-2]="esDe(partido, busqueda())"
                [class.outline-accent-strong]="esDe(partido, busqueda())"
                [class.-outline-offset-1]="esDe(partido, busqueda())"
              >
                <div class="grid gap-1 p-2">
                  @for (jugador of [partido.jugadorA, partido.jugadorB]; track $index) {
                    <p
                      class="break-words"
                      [attr.data-gano]="gano(partido, jugador) ? '' : null"
                      [class.font-bold]="gano(partido, jugador)"
                      [class.text-muted-foreground]="jugador === null"
                    >
                      <span
                        [class.bg-accent-soft]="coincide(jugador, busqueda())"
                        [class.px-1]="coincide(jugador, busqueda())"
                      >
                        {{ jugador ?? vacio(partido) }}
                      </span>
                      @if (gano(partido, jugador)) {
                        <span class="sr-only">, ganó</span>
                      }
                    </p>
                  }
                  @if (partido.marcador) {
                    <p class="font-display font-bold tabular-nums">{{ partido.marcador }}</p>
                  }
                  @if (partido.walkover && perdedor(partido); as ausente) {
                    <p class="text-xs text-muted-foreground">{{ ausente }} no se presentó.</p>
                  }
                </div>
                @if (partido.inicio && partido.cancha) {
                  <p data-cuando class="bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {{ cuando(partido.inicio) }} · {{ partido.cancha }}
                  </p>
                }
              </li>
            }
          </ul>
        </div>
      }
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

  /** "sábado, 5 de diciembre, 10:00". */
  protected cuando(inicio: string): string {
    return `${diaEnPalabras(fechaEnElClub(inicio))}, ${horaEnElClub(inicio)}`;
  }

  /** Un hueco de primera ronda es un bye; en las demás, todavía no se sabe. */
  protected vacio(partido: PartidoPublico): string {
    return partido.ronda === 1 ? 'Bye' : 'Por definir';
  }

  /** Por nombre y no por id: la respuesta pública no trae ids de jugadores, a propósito. */
  protected gano(partido: PartidoPublico, jugador: string | null): boolean {
    return jugador !== null && partido.ganador === jugador;
  }

  /** El que no se presentó, en un walkover: el que no ganó. */
  protected perdedor(partido: PartidoPublico): string | null {
    return (
      [partido.jugadorA, partido.jugadorB].find(
        (jugador) => jugador !== null && jugador !== partido.ganador,
      ) ?? null
    );
  }
}
