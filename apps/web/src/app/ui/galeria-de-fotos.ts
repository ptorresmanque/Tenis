import {
  afterNextRender,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import {
  Gallery,
  GalleryCounter,
  GalleryImage,
  GalleryItemDef,
  GalleryNav,
  GalleryThumbClick,
  GalleryThumbs,
  provideGalleryA11yOptions,
} from 'ng-gallery';
import { Lightbox, LightboxCloseButton } from 'ng-gallery/lightbox';

/** Lo que necesita la galería de una foto: las dos versiones y lo que se ve en ella. */
export interface FotoParaGaleria {
  imagen: string;
  miniatura: string;
  descripcion: string | null;
}

/**
 * La puerta a la galería de fotos del sitio (T309, SPEC-sitio.md D1, A5 y A11).
 *
 * **El visor es el de ng-gallery**, no uno propio: este componente le pasa las fotos, la deja
 * en español y la abre en la foto tocada. No dibuja nada hasta que se pide: quien lo usa pone
 * sus miniaturas, y cada una llama a `abrir(indice)`.
 *
 * **La librería llega diferida** (`@defer`): baja cuando el navegador queda libre, o al tocar
 * una foto si alguien se adelanta. En ese caso, la galería se abre apenas llega.
 */
@Component({
  selector: 'app-galeria-de-fotos',
  imports: [
    Gallery,
    GalleryCounter,
    GalleryImage,
    GalleryItemDef,
    GalleryNav,
    GalleryThumbClick,
    GalleryThumbs,
    Lightbox,
    LightboxCloseButton,
    MatIcon,
    MatIconButton,
  ],
  providers: [
    provideGalleryA11yOptions({
      containerLabel: 'Galería de fotos',
      containerRoleDescription: 'galería',
      itemRoleDescription: 'foto',
      itemLabel: (indice, total) => `Foto ${indice + 1} de ${total}`,
      rangeLabel: (desde, hasta, total) => `Fotos ${desde} a ${hasta} de ${total}`,
      thumbContainerLabel: 'Miniaturas',
      thumbLabel: (indice, total) => `Ver la foto ${indice + 1} de ${total}`,
      prevItemLabel: 'Foto anterior',
      nextItemLabel: 'Foto siguiente',
      firstItemLabel: 'Es la primera foto',
      lastItemLabel: 'Es la última foto',
      lightboxLabel: 'Galería de fotos',
      lightboxCloseButtonLabel: 'Cerrar la galería',
    }),
  ],
  template: `
    @defer (on idle; when pedida() !== null) {
      <ng-template lightbox #lightbox="lightbox" [ariaLabel]="etiqueta()">
        <gallery [items]="items()">
          <img *galleryItemDef="let item" galleryImage [src]="item.src" [alt]="item.alt" />
          <gallery-thumbs>
            <button *galleryItemDef="let item" type="button" class="cursor-pointer" galleryThumbClick>
              <img galleryImage [src]="item.thumb" alt="" />
            </button>
          </gallery-thumbs>
          <gallery-nav />
          <gallery-counter />
        </gallery>
        <!-- El botón propio y no el de la librería: el suyo toma su texto de un inyector que no
             ve el español de este componente, y decía «Close gallery». -->
        <button
          matIconButton
          type="button"
          lightboxCloseButton
          class="cerrar-galeria"
          aria-label="Cerrar la galería"
        >
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </ng-template>
    }
  `,
  styles: `
    /* Donde la librería pone el suyo: arriba, al final de la línea, sobre la foto. */
    .cerrar-galeria {
      position: absolute;
      top: 1rem;
      inset-inline-end: 1rem;
      z-index: 10;
    }
  `,
})
export class GaleriaDeFotos {
  readonly fotos = input.required<FotoParaGaleria[]>();

  /** El nombre del diálogo para el lector de pantalla: «Fotos del torneo», «Fotos del tour». */
  readonly etiqueta = input('Galería de fotos');

  private readonly lightbox = viewChild<Lightbox>('lightbox');

  /** La foto que se pidió y todavía no se mostró, mientras la librería llega. */
  protected readonly pedida = signal<number | null>(null);

  /** Una foto sin descripción se nombra por su lugar, para que el lector no la salte. */
  protected readonly items = computed(() =>
    this.fotos().map((foto, i, todas) => ({
      src: foto.imagen,
      thumb: foto.miniatura,
      alt: foto.descripcion || `Foto ${i + 1} de ${todas.length}`,
    })),
  );

  private readonly injector = inject(Injector);

  constructor() {
    effect(() => {
      const lightbox = this.lightbox();
      const indice = this.pedida();
      if (!lightbox || indice === null) return;
      untracked(() => {
        this.pedida.set(null);
        // Después del render y no en el acto: recién llegada la librería, la directiva todavía no
        // tiene sus entradas, y el diálogo salía sin su nombre.
        afterNextRender(() => lightbox.showModal(indice), { injector: this.injector });
      });
    });
  }

  /** Abre la galería en esa foto. */
  abrir(indice: number): void {
    this.pedida.set(indice);
  }
}
