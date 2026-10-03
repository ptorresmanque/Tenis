import { Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { Transmision } from '../torneos.service';

/**
 * El reproductor de una transmisión, **detrás de una fachada**.
 *
 * La página muestra la miniatura y un botón; el `iframe` se crea recién al hacer clic.
 *
 * **Sin eso, cada visitante que abre el calendario del torneo carga scripts de Google y
 * queda identificado por mirar una página del club**, aunque no toque nada. Es el mismo
 * criterio que ya tomaron el teléfono oculto de los jugadores y el token del QR de la
 * reserva: lo público entrega lo necesario para el propósito, no más. Como efecto
 * secundario, el calendario carga rápido en un celular en la cancha, que es donde se va
 * a mirar.
 *
 * La URL viene armada por el servidor y apunta a `youtube-nocookie.com`; acá no se
 * construye ni se concatena nada.
 */
@Component({
  selector: 'app-reproductor',
  template: `
    <figure class="mt-3">
      @if (encendido()) {
        <div class="aspect-video overflow-hidden rounded-lg bg-black">
          <iframe
            class="h-full w-full"
            [src]="fuente()"
            title="Transmisión del club"
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowfullscreen
            referrerpolicy="no-referrer"
          ></iframe>
        </div>
      } @else {
        <button
          type="button"
          class="group relative block w-full cursor-pointer overflow-hidden
                 rounded-lg bg-black"
          (click)="encender()"
        >
          <img
            class="aspect-video w-full object-cover opacity-80 transition-opacity
                   group-hover:opacity-100"
            [src]="transmision().miniatura"
            alt=""
            loading="lazy"
          />
          <span
            class="absolute inset-0 flex items-center justify-center text-white"
            aria-hidden="true"
          >
            <span class="icono text-6xl drop-shadow" aria-hidden="true">
              play_circle
            </span>
          </span>
          <!-- El rótulo de la transmisión (TV4.3): acá es literal, porque es una
               transmisión de verdad. Con aria-hidden, porque el botón ya nombra la
               cancha y el lector la oiría dos veces. -->
          <span
            data-rotulo
            class="absolute top-3 left-0 flex items-center gap-1.5 bg-rotulo py-1 ps-3
                   font-display text-sm font-bold tracking-wider text-on-rotulo uppercase
                   corte-fin"
            aria-hidden="true"
          >
            <span class="icono text-base" aria-hidden="true">videocam</span>
            {{ transmision().cancha }}
          </span>
          <span class="sr-only">
            Ver la transmisión de {{ transmision().cancha }}
          </span>
        </button>
      }

      <figcaption class="mt-2 text-sm text-muted-foreground">
        <!-- **Dice de qué cancha es y no promete un partido.** El live va corrido: si
             el anterior se alargó, lo que sale en pantalla es ese otro, y anunciarlo
             como "tu partido" sería mentir. -->
        Transmisión de {{ transmision().cancha }}{{
          transmision().titulo ? ' · ' + transmision().titulo : ''
        }}. Va corrida: puede estar saliendo el partido anterior.
      </figcaption>
    </figure>
  `,
})
export class Reproductor {
  private readonly sanitizador = inject(DomSanitizer);

  readonly transmision = input.required<Transmision>();

  protected readonly encendido = signal(false);

  protected encender(): void {
    this.encendido.set(true);
  }

  /**
   * La URL, marcada como confiable para que Angular la deje en un `iframe`.
   *
   * **Solo se marca lo que armó el servidor.** El id se validó contra
   * `[A-Za-z0-9_-]{11}` y la URL la construyó `urlDelReproductor` con el dominio sin
   * cookies: acá no se concatena nada de lo que escribió el admin.
   *
   * **`computed` y no un método**: `bypassSecurityTrustResourceUrl` devuelve un objeto
   * nuevo cada vez, así que llamarlo desde la plantilla le daba a Angular un valor
   * distinto en cada detección de cambios, reescribía el `src` del `iframe` y **el
   * partido volvía al segundo cero** — bastaba con abrir otra categoría mientras se
   * miraba. Así la referencia solo cambia cuando cambia la transmisión.
   */
  protected readonly fuente = computed<SafeResourceUrl>(() =>
    this.sanitizador.bypassSecurityTrustResourceUrl(this.transmision().url),
  );
}
