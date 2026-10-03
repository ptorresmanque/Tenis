import { Component, input, signal } from '@angular/core';

/**
 * La cinta de la transmisión: un rótulo fijo y unos mensajes que pasan (TV3.2).
 *
 * **Se detiene de tres maneras**, porque lo que se mueve solo por más de cinco
 * segundos tiene que poder pararse (WCAG 2.2.2): con su botón, con el puntero
 * encima y con el foco adentro. El botón usa `aria-pressed` y no cambia de
 * nombre: "Detener la cinta" apretado dice que está detenida.
 *
 * **Los mensajes van dos veces** para que la vuelta no salte: el carril corre la
 * mitad de su ancho y la copia queda donde estaba el original. La copia lleva
 * `aria-hidden`, así que el lector oye cada mensaje una vez. Por eso los mensajes
 * son un input y no contenido proyectado: Angular proyecta una sola vez.
 *
 * **Con movimiento reducido está quieta, sin copia, en varias líneas y sin botón**:
 * una cinta detenida que corta sus mensajes en el borde los esconde, y una pausa
 * sin nada que pausar sobra. Es CSS y no un `matchMedia`: la plataforma ya lo
 * resuelve.
 *
 * El rótulo es contenido proyectado (en la portada, el enlace a la sección) y
 * se pinta como el del zócalo: el rótulo arriba en el teléfono, al costado y con
 * el corte desde `sm`.
 */
@Component({
  selector: 'app-cinta',
  host: { class: 'block' },
  template: `
    <section [attr.aria-label]="etiqueta()" class="bg-campo text-on-campo sm:flex">
      <div
        class="flex items-center gap-2 bg-rotulo px-4 py-1.5 font-display text-sm font-bold
               tracking-wider text-on-rotulo uppercase sm:shrink-0 sm:ps-5 sm:corte-fin"
      >
        <span class="icono text-base" aria-hidden="true">emoji_events</span>
        <ng-content />
      </div>

      <div class="flex min-w-0 flex-1 items-center">
        <div class="pista min-w-0 flex-1 overflow-hidden py-2.5">
          <div data-carril class="carril" [attr.data-pausada]="pausada() ? '' : null">
            @for (copia of copias; track copia) {
              <ul class="tramo" [attr.aria-hidden]="copia === 'copia' ? 'true' : null">
                @for (mensaje of mensajes(); track $index) {
                  <li
                    class="flex items-center gap-2 font-display text-base font-semibold
                           tracking-wide uppercase"
                  >
                    <span class="icono text-sm text-on-campo/70" aria-hidden="true">
                      sports_tennis
                    </span>
                    {{ mensaje }}
                  </li>
                }
              </ul>
            }
          </div>
        </div>

        <button
          type="button"
          class="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center
                 text-on-campo hover:bg-on-campo/10 focus-visible:outline-on-campo"
          [attr.aria-pressed]="pausada()"
          (click)="pausada.set(!pausada())"
        >
          <span class="icono" aria-hidden="true">{{ pausada() ? 'play_arrow' : 'pause' }}</span>
          <span class="sr-only">Detener la cinta</span>
        </button>
      </div>
    </section>
  `,
  styles: `
    /* El ancho de la pista es la unidad del tramo: cada tramo mide al menos eso,
       así que con pocos mensajes la vuelta tampoco deja un hueco. */
    .pista {
      container-type: inline-size;
    }

    .carril {
      display: flex;
      width: max-content;
      animation: correr var(--duracion-cinta) linear infinite;
    }

    .tramo {
      display: flex;
      min-width: 100cqw;
      gap: 2.5rem;
      padding-inline: 1rem 1.5rem;
      white-space: nowrap;
    }

    .carril[data-pausada],
    :host(:focus-within) .carril {
      animation-play-state: paused;
    }

    /* Solo con un puntero que se posa: en una pantalla táctil el "hover" queda
       pegado después de tocar y la cinta no volvería a andar. */
    @media (hover: hover) {
      :host(:hover) .carril {
        animation-play-state: paused;
      }
    }

    @keyframes correr {
      to {
        transform: translateX(-50%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .carril {
        animation: none;
        width: auto;
      }

      .tramo {
        min-width: 0;
        flex-wrap: wrap;
        row-gap: 0.25rem;
        white-space: normal;
      }

      .tramo[aria-hidden] {
        display: none;
      }

      /* Sin movimiento no hay nada que detener, y un botón que no hace nada
         confunde más de lo que ayuda. */
      button {
        display: none;
      }
    }
  `,
})
export class Cinta {
  /** El nombre de la región, para quien navega por regiones. */
  readonly etiqueta = input.required<string>();
  readonly mensajes = input.required<readonly string[]>();

  protected readonly pausada = signal(false);
  protected readonly copias = ['original', 'copia'] as const;
}
