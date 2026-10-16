import { Component, computed, input } from '@angular/core';

import { GaleriaDeFotos } from '../../ui/galeria-de-fotos';
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
 * Las fotos del torneo, y las de la tienda, la cafetería y el gimnasio.
 *
 * **La grilla carga solo miniaturas.** La versión grande se pide recién al abrir una
 * foto, y es la diferencia entre 240 MB y unos pocos para quien abre esto con datos
 * móviles parado en la cancha, que es exactamente dónde y cuándo se va a abrir.
 *
 * **Tocar una miniatura abre la galería del sitio** (`app-galeria-de-fotos`, T310,
 * SPEC-sitio.md D8): el lightbox de ng-gallery, en esa foto y con las de la grilla en el mismo
 * orden. Hasta T310 era un visor propio en el flujo de la página.
 */
@Component({
  selector: 'app-galeria',
  imports: [GaleriaDeFotos],
  template: `
    @if (fotos().length > 0) {
      <div class="mt-3">
        @if (titulo()) {
          <h3 class="subtitulo">{{ titulo() }}</h3>
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
                  [attr.aria-label]="'Ver la foto: ' + textoAlternativo(foto)"
                  (click)="visor.abrir(enLaGaleria().indexOf(foto))"
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
        <app-galeria-de-fotos #visor [fotos]="enLaGaleria()" [etiqueta]="titulo() || porOmision()" />
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

  /** Las fotos en el orden de la grilla, que es el que se recorre en la galería. */
  protected readonly enLaGaleria = computed(() => this.tramos().flatMap((tramo) => tramo.fotos));

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
