import { Component, computed, input, signal } from '@angular/core';

import { Foto, Momento } from '../torneos.service';

/** El orden en que se cuenta el torneo, y cómo se titula cada tramo. */
const TRAMOS: { momento: Momento; titulo: string }[] = [
  { momento: 'ANTES', titulo: 'Antes del torneo' },
  { momento: 'DURANTE', titulo: 'Durante el torneo' },
  { momento: 'DESPUES', titulo: 'Después del torneo' },
];

/**
 * Las fotos del torneo.
 *
 * **La grilla carga solo miniaturas.** La versión grande se pide recién al abrir una
 * foto, y es la diferencia entre 240 MB y unos pocos para quien abre esto con datos
 * móviles parado en la cancha, que es exactamente dónde y cuándo se va a abrir.
 *
 * Sin diálogo modal a medida: la foto abierta se muestra en el mismo flujo, debajo del
 * título. Un modal habría que hacerlo accesible con foco y tecla de escape, y acá no
 * agrega nada que la página no haga sola.
 */
@Component({
  selector: 'app-galeria',
  template: `
    @if (fotos().length > 0) {
      <div class="mt-3">
        <h3 class="subtitulo">Fotos</h3>

        @if (abierta(); as foto) {
          <figure class="mt-2">
            <img
              class="max-h-[70vh] w-full rounded-lg object-contain"
              [src]="foto.imagen"
              [alt]="textoAlternativo(foto)"
            />
            <figcaption
              class="mt-1 flex flex-wrap items-center gap-3 text-sm
                     text-muted-foreground"
            >
              @if (foto.descripcion) {
                <span>{{ foto.descripcion }}</span>
              }
              <button
                type="button"
                class="boton boton-secundario boton-chico"
                (click)="cerrar()"
              >
                Cerrar la foto
              </button>
            </figcaption>
          </figure>
        }

        @for (tramo of tramos(); track tramo.momento) {
          <h4
            class="mt-3 font-display text-sm font-semibold tracking-wider text-muted-foreground
                   uppercase"
          >
            {{ tramo.titulo }}
          </h4>
          <ul class="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
            @for (foto of tramo.fotos; track foto.id) {
              <li>
                <button
                  type="button"
                  class="block w-full cursor-pointer overflow-hidden rounded-lg"
                  (click)="abrir(foto)"
                >
                  <!-- Carga diferida: sesenta miniaturas no se piden todas al abrir la página,
                       se piden a medida que se baja. -->
                  <img
                    class="aspect-square w-full object-cover transition-opacity
                           hover:opacity-80"
                    [src]="foto.miniatura"
                    [alt]="textoAlternativo(foto)"
                    loading="lazy"
                  />
                </button>
              </li>
            }
          </ul>
        }
      </div>
    }
  `,
})
export class Galeria {
  readonly fotos = input.required<Foto[]>();

  protected readonly abierta = signal<Foto | null>(null);

  /** Solo los tramos que tienen alguna foto: un título vacío no dice nada. */
  protected readonly tramos = computed(() =>
    TRAMOS.map((tramo) => ({
      ...tramo,
      fotos: this.fotos().filter((foto) => foto.momento === tramo.momento),
    })).filter((tramo) => tramo.fotos.length > 0),
  );

  protected abrir(foto: Foto): void {
    this.abierta.set(foto);
  }

  protected cerrar(): void {
    this.abierta.set(null);
  }

  /**
   * Qué dice el lector de pantalla.
   *
   * El pie de foto si lo hay; si no, **no un `alt` vacío ni el nombre del archivo**:
   * "Foto del torneo" es poco, pero es cierto y no obliga a nadie a escuchar un UUID.
   */
  protected textoAlternativo(foto: Foto): string {
    return foto.descripcion ?? 'Foto del torneo';
  }
}
