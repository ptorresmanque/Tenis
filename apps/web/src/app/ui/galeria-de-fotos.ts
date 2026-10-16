import {
  afterNextRender,
  Component,
  computed,
  createEnvironmentInjector,
  DestroyRef,
  DOCUMENT,
  effect,
  EnvironmentInjector,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import {
  Gallery,
  GalleryCounter,
  GalleryImage,
  GalleryItemDef,
  GalleryNav,
  GalleryThumbClick,
  GalleryThumbs,
} from 'ng-gallery';
import { Lightbox, LightboxCloseButton } from 'ng-gallery/lightbox';

import { proveerGaleriaEnEspanol } from './galeria-en-espanol';

/** Lo que necesita la galería de una foto: las dos versiones y lo que se ve en ella. */
export interface FotoParaGaleria {
  imagen: string;
  miniatura: string;
  descripcion: string | null;
}

/**
 * La puerta a la galería de fotos del sitio (T309, SPEC-sitio.md D1, A5 y A11).
 *
 * **El visor es el de ng-gallery**, no uno propio: este componente le pasa las fotos y la abre
 * en la foto tocada, con sus textos en español (`proveerGaleriaEnEspanol`). No dibuja nada hasta que se pide: quien lo usa pone
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
  ],
  providers: [
    // El lightbox arma su diálogo con el EnvironmentInjector que encuentra desde acá, y no ve
    // los proveedores de este componente: con el de la raíz, las flechas decían «Go to first
    // slide». Se le da uno propio con los textos en español. En la raíz de la aplicación no
    // sirve: arrastraba la librería entera al arranque (67 kB).
    {
      provide: EnvironmentInjector,
      useFactory: () => {
        const propio = createEnvironmentInjector(
          [proveerGaleriaEnEspanol()],
          inject(EnvironmentInjector, { skipSelf: true }),
        );
        inject(DestroyRef).onDestroy(() => propio.destroy());
        return propio;
      },
    },
  ],
  template: `
    @defer (on idle; when pedida() !== null) {
      <ng-template lightbox #lightbox="lightbox" [ariaLabel]="etiqueta()">
        <!-- Las miniaturas, enteras como la foto grande (T322): con el cover de la librería, en su
             caja apaisada, un afiche perdía arriba y abajo. -->
        <gallery [items]="items()" style="--g-thumb-image-size: contain">
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
             ve el español de este componente, y decía «Close gallery». Sin matIconButton: con
             él, el módulo entero de botones de Material entraba al arranque (12,7 kB), y
             lightboxCloseButton ya le da la forma y el color del de la librería. -->
        <button
          type="button"
          lightboxCloseButton
          class="cerrar-galeria cursor-pointer"
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
  private readonly documento = inject(DOCUMENT);

  constructor() {
    effect(() => {
      const lightbox = this.lightbox();
      const indice = this.pedida();
      if (!lightbox || indice === null) return;
      untracked(() => {
        this.pedida.set(null);
        // Después del render y no en el acto: recién llegada la librería, la directiva todavía no
        // tiene sus entradas, y el diálogo salía sin su nombre.
        afterNextRender(
          () => {
            // El navegador devuelve el foco al cerrar un diálogo nativo, pero la librería lo saca del
            // documento en el mismo cierre, y el foco quedaba en ninguna parte: vuelve a mano a
            // la miniatura que se tocó.
            const disparador = this.documento.activeElement;
            lightbox.showModal(indice);
            const dialogo = lightbox.lightboxRef?.instance.dialogElement;
            dialogo?.addEventListener('close', () => (disparador as HTMLElement | null)?.focus(), {
              once: true,
            });
            // El Esc lo atiende el propio diálogo. Si sigue hasta el body, Material lo toma y
            // cierra también el diálogo de abajo: la galería del cuadro cerraba el cuadro.
            dialogo?.addEventListener('keydown', (evento) => {
              if (evento.key === 'Escape') evento.stopPropagation();
            });
            // ng-gallery no escucha las flechas: su carril se desplaza con ellas solo si tiene el
            // foco, y el diálogo abría con el foco en sí mismo. Se le da al carril cuando ya está
            // dibujado (T320).
            afterNextRender(
              () => dialogo?.querySelector<HTMLElement>('g-slider')?.focus({ preventScroll: true }),
              { injector: this.injector },
            );
          },
          { injector: this.injector },
        );
      });
    });
  }

  /** Abre la galería en esa foto. */
  abrir(indice: number): void {
    this.pedida.set(indice);
  }
}
