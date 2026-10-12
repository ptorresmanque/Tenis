import { Component, computed, input, signal } from '@angular/core';

import { Momento } from '../torneos.service';

/**
 * Lo que la galería necesita de una foto. Las de los torneos traen además su momento; las
 * de la tienda y la cafetería (T186), no.
 */
export interface FotoDeGaleria {
  id: number;
  descripcion: string | null;
  miniatura: string;
  imagen: string;
  momento?: Momento;
}

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
        @if (titulo()) {
          <h3 class="subtitulo">{{ titulo() }}</h3>
        }

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
          @if (tramo.titulo) {
            <h4
              class="mt-3 font-display text-sm font-semibold tracking-wider text-muted-foreground
                     uppercase"
            >
              {{ tramo.titulo }}
            </h4>
          }
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
  readonly fotos = input.required<FotoDeGaleria[]>();
  /** El encabezado. Vacío, no hay: lo pone quien la usa, como «El club» con su rótulo. */
  readonly titulo = input('Fotos');
  /** El texto alternativo de una foto sin pie. */
  readonly porOmision = input('Foto del torneo');

  protected readonly abierta = signal<FotoDeGaleria | null>(null);

  /**
   * Solo los tramos que tienen alguna foto: un título vacío no dice nada.
   *
   * **Sin momento, un solo tramo sin título**: las fotos de la tienda y la cafetería no
   * tienen un antes ni un después (T186).
   */
  protected readonly tramos = computed(() => {
    if (this.fotos().every((foto) => foto.momento === undefined)) {
      return [{ momento: 'SIN_MOMENTO', titulo: null, fotos: this.fotos() }];
    }

    return TRAMOS.map((tramo) => ({
      ...tramo,
      fotos: this.fotos().filter((foto) => foto.momento === tramo.momento),
    })).filter((tramo) => tramo.fotos.length > 0);
  });

  protected abrir(foto: FotoDeGaleria): void {
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
  protected textoAlternativo(foto: FotoDeGaleria): string {
    return foto.descripcion ?? this.porOmision();
  }
}
