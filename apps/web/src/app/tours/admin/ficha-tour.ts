import {
  Component,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { proveerCampos } from '../../ui/campos';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Esqueleto } from '../../ui/esqueleto';
import { FichaDeTour, Tours } from '../tours.service';
import { GaleriaDelTour } from './galeria-del-tour';
import { TemporadasDelTour } from './temporadas-del-tour';

/** Lo que se le hace a un tour. */
type Pestana = 'datos' | 'temporadas' | 'galeria';

const PESTANAS: { id: Pestana; nombre: string; icono: string }[] = [
  { id: 'datos', nombre: 'Datos', icono: 'edit_note' },
  { id: 'temporadas', nombre: 'Temporadas', icono: 'event_repeat' },
  { id: 'galeria', nombre: 'Galería', icono: 'photo_library' },
];

const LARGO_DEL_NOMBRE = 80;
const LARGO_DE_LA_DESCRIPCION = 2000;

/**
 * Un tour del panel (T191), con su trabajo repartido en pestañas, como la ficha del
 * torneo. Esta tarea hace la de **Datos**: el nombre, la descripción y la imagen
 * representativa, más borrar el tour.
 */
@Component({
  selector: 'app-ficha-tour',
  imports: [
    MatFormFieldModule,
    MatInput,
    MatButton,
    MatIcon,
    FormsModule,
    RouterLink,
    Aviso,
    Esqueleto,
    TemporadasDelTour,
    GaleriaDelTour,
  ],
  providers: [proveerCampos()],
  template: `
    <a routerLink="/administracion/tours" class="text-sm font-semibold text-primary">
      <mat-icon class="align-middle text-base" aria-hidden="true">arrow_back</mat-icon>
      Tours
    </a>

    @if (ficha.error()) {
      <p class="mt-4 text-destructive">No se pudo cargar el tour. Reintenta en un momento.</p>
    } @else if (ficha.isLoading() && !ficha.hasValue()) {
      <app-esqueleto class="mt-4 block" [filas]="4" etiqueta="Cargando el tour…" />
    } @else if (ficha.hasValue()) {
      @let tour = ficha.value();

      <!-- La cabecera del panel (TV7.1), sin acción: cada pestaña trae las suyas. -->
      <header class="cabecera-panel mt-1">
        <div>
          <h1 class="titular text-4xl">{{ tour.nombre }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            Lo que se ve en su página pública: nombre, descripción, imagen y galería.
          </p>
        </div>
      </header>

      <!-- Pestañas y no enlaces, como en la ficha del torneo: cambian lo que se muestra
           sin cambiar de página, y el lector de pantalla oye cuál está activa. -->
      <div class="mt-4 flex flex-wrap gap-1 border-b border-border" role="tablist">
        @for (pestana of PESTANAS; track pestana.id) {
          <button
            type="button"
            role="tab"
            class="-mb-px cursor-pointer border-b-2 px-3 py-2 font-display text-sm font-bold
                   tracking-wide uppercase"
            [class]="
              activa() === pestana.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground'
            "
            [attr.aria-selected]="activa() === pestana.id"
            (click)="activa.set(pestana.id)"
          >
            <mat-icon class="align-middle text-base" aria-hidden="true">{{ pestana.icono }}</mat-icon>
            {{ pestana.nombre }}
          </button>
        }
      </div>

      @if (activa() === 'temporadas') {
        <app-temporadas-del-tour [tour]="tour" (cambio)="ficha.reload()" />
      } @else if (activa() === 'galeria') {
        <app-galeria-del-tour [tour]="tour" (cambio)="ficha.reload()" />
      } @else {
        @if (error(); as falla) {
          <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
        } @else if (aviso(); as texto) {
          <app-aviso variante="exito" class="mt-4 block">{{ texto }}</app-aviso>
        }

        <div class="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
          <form class="grid max-w-xl gap-4" (ngSubmit)="guardar()">
            <mat-form-field>
              <mat-label>Nombre <span aria-hidden="true">*</span></mat-label>
              <input
                matInput
                name="nombre"
                [maxlength]="LARGO_DEL_NOMBRE"
                [ngModel]="editado().nombre ?? tour.nombre"
                (ngModelChange)="escribir('nombre', $event)"
              />
            </mat-form-field>

            <!-- La cuenta va en la ayuda, que el lector lee al entrar al campo, y no en una
               región viva que hablaría con cada letra. -->
            <mat-form-field>
              <mat-label>Descripción</mat-label>
              <textarea
                matInput
                name="descripcion"
                rows="8"
                [maxlength]="LARGO_DE_LA_DESCRIPCION"
                [ngModel]="editado().descripcion ?? tour.descripcion"
                (ngModelChange)="escribir('descripcion', $event)"
              ></textarea>
              <mat-hint>
                {{ 'Texto plano: los saltos de línea se respetan. ' + quedan(editado().descripcion ?? tour.descripcion) }}
              </mat-hint>
            </mat-form-field>

            <div>
              <!-- Los datos, la imagen y el diálogo son secciones distintas.
                   mat-guidelines-ignore: multiples-filled -->
              <button
                matButton="filled"
                type="submit"
                [disabled]="enCurso() !== null"
                [attr.aria-busy]="enCurso() === 'guardar'"
              >
                {{ enCurso() === 'guardar' ? 'Guardando…' : 'Guardar los datos' }}
              </button>
            </div>
          </form>

          <section aria-labelledby="titulo-imagen">
            <h2 id="titulo-imagen" class="subtitulo">Imagen representativa</h2>
            @if (tour.imagen; as imagen) {
              <img
                class="mt-2 aspect-[4/3] w-full bg-muted object-cover"
                [src]="imagen.miniatura + '?v=' + version()"
                [alt]="'Imagen de ' + tour.nombre"
              />
            } @else {
              <p class="mt-2 text-sm text-muted-foreground">
                Todavía no tiene imagen. Es la portada de su tarjeta y de su página.
              </p>
            }
            <label class="mt-3 block">
              <span class="text-sm font-medium">
                {{ tour.imagen ? 'Reemplazar la imagen' : 'Subir la imagen' }}
              </span>
              <input
                class="campo mt-1"
                type="file"
                accept="image/jpeg,image/png"
                [disabled]="enCurso() !== null"
                [attr.aria-busy]="enCurso() === 'imagen'"
                (change)="subirImagen($event)"
              />
            </label>
          </section>
        </div>

        <section class="mt-10 border-t border-border pt-4" aria-labelledby="titulo-borrar">
          <h2 id="titulo-borrar" class="subtitulo">Borrar el tour</h2>
          <p class="mt-1 max-w-prose text-sm text-muted-foreground">
            Se borran sus temporadas, sus niveles y su galería. Un tour con torneos no se puede
            borrar.
          </p>
          <button
            matButton="filled"
            type="button"
            class="peligro chico mt-3"
            [disabled]="enCurso() !== null"
            (click)="confirmando.set(true)"
          >
            Borrar el tour
          </button>
        </section>
      }
    }

    <!-- Se abre con showModal y no con el atributo open: es lo único que vuelve inerte el
         resto de la página y atrapa el foco, como en la confirmación de los pagos. -->
    <dialog
      #confirmacion
      closedby="any"
      class="m-auto w-[min(28rem,92vw)] rounded-2xl bg-card p-6 shadow-xl backdrop:bg-foreground/50"
      aria-labelledby="titulo-confirmar-borrado"
      (close)="confirmando.set(false)"
    >
      <h2 id="titulo-confirmar-borrado" class="titular text-2xl">Borrar el tour</h2>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        {{ ficha.hasValue() ? ficha.value().nombre : 'El tour' }} se borra con sus temporadas, sus
        niveles y su galería. Esto no se puede deshacer.
      </p>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <button matButton type="button" (click)="confirmando.set(false)">
          Mejor no
        </button>
        <button
          matButton="filled"
          type="button"
          class="peligro"
          [disabled]="enCurso() !== null"
          [attr.aria-busy]="enCurso() === 'borrar'"
          (click)="borrar()"
        >
          Sí, borrar
        </button>
      </div>
    </dialog>
  `,
})
export class FichaTour {
  private readonly api = inject(Tours);
  private readonly router = inject(Router);

  /** Llega de la ruta por `withComponentInputBinding`. */
  readonly id = input.required<string>();

  protected readonly PESTANAS = PESTANAS;
  protected readonly LARGO_DEL_NOMBRE = LARGO_DEL_NOMBRE;
  protected readonly LARGO_DE_LA_DESCRIPCION = LARGO_DE_LA_DESCRIPCION;

  protected readonly activa = signal<Pestana>('datos');

  protected readonly ficha = resource({
    params: () => Number(this.id()),
    loader: ({ params }): Promise<FichaDeTour> => this.api.ficha(params),
  });

  /**
   * Lo que hay en los campos. Arranca de lo guardado y no se sincroniza después: si se
   * recargara solo, pisaría lo que la persona está escribiendo.
   *
   * `linkedSignal` del id y no `signal`: Angular reutiliza esta ficha al pasar de un tour
   * a otro, y lo escrito en el anterior aparecía en los campos del nuevo.
   */
  protected readonly editado = linkedSignal<string, { nombre?: string; descripcion?: string }>({
    source: this.id,
    computation: () => ({}),
  });

  /**
   * La versión de la imagen en la dirección. La API la sirve siempre en la misma, así que
   * sin esto el `<img>` seguiría mostrando la anterior después de reemplazarla.
   */
  protected readonly version = signal(0);

  protected readonly confirmando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T153). */
  protected readonly enCurso = signal<'guardar' | 'imagen' | 'borrar' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  private readonly confirmacion = viewChild.required<ElementRef<HTMLDialogElement>>('confirmacion');

  constructor() {
    // Abrir y cerrar el `<dialog>` sigue a la señal, como en los pagos: así la tecla Esc,
    // el clic en el fondo y "Mejor no" terminan todos en el mismo estado.
    effect(() => {
      const abierto = this.confirmando();
      const elemento = this.confirmacion().nativeElement;

      if (abierto && !elemento.open) elemento.showModal();
      if (!abierto && elemento.open) elemento.close();
    });
  }

  protected quedan(texto: string): string {
    const quedan = LARGO_DE_LA_DESCRIPCION - texto.length;

    return quedan === 1 ? 'Queda 1 carácter.' : `Quedan ${quedan} caracteres.`;
  }

  protected escribir(campo: 'nombre' | 'descripcion', valor: string): void {
    this.editado.update((actual) => ({ ...actual, [campo]: valor }));
    this.aviso.set(null);
  }

  protected async guardar(): Promise<void> {
    // `hasValue()` antes que `value()`, que lanza si la ficha no cargó.
    const tour = this.ficha.hasValue() ? this.ficha.value() : undefined;
    if (!tour) return;

    await this.intentar('guardar', async () => {
      await this.api.editar(tour.id, {
        nombre: this.editado().nombre ?? tour.nombre,
        descripcion: this.editado().descripcion ?? tour.descripcion,
      });
      this.editado.set({});
      this.ficha.reload();
      this.aviso.set('Guardado.');
    });
  }

  protected async subirImagen(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    // `hasValue()` antes que `value()`, que lanza si la ficha no cargó.
    const tour = this.ficha.hasValue() ? this.ficha.value() : undefined;
    if (!archivo || !tour) return;

    await this.intentar('imagen', async () => {
      await this.api.subirImagen(tour.id, archivo);
      this.version.set(Date.now());
      this.ficha.reload();
      this.aviso.set('Imagen guardada.');
    });
    entrada.value = '';
  }

  protected async borrar(): Promise<void> {
    // `hasValue()` antes que `value()`, que lanza si la ficha no cargó.
    const tour = this.ficha.hasValue() ? this.ficha.value() : undefined;
    if (!tour) return;

    await this.intentar('borrar', async () => {
      await this.api.borrar(tour.id);
      this.confirmando.set(false);
      await this.router.navigate(['/administracion/tours']);
    });
    // Con torneos, la API dice cuántos: se cierra la pregunta y el mensaje queda arriba.
    this.confirmando.set(false);
  }

  private async intentar(
    clave: 'guardar' | 'imagen' | 'borrar',
    accion: () => Promise<void>,
  ): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.enCurso.set(clave);

    try {
      await accion();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar.'));
    } finally {
      this.enCurso.set(null);
    }
  }
}
