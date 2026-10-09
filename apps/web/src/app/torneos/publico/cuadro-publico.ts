import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  resource,
  viewChild,
} from '@angular/core';

import { Insignia } from '../../ui/insignia';
import { CuadroPublico, Foto, Torneos, Transmision } from '../torneos.service';
import { Arbol } from './arbol';
import { esBye, esDe } from './busqueda';
import { Galeria } from './galeria';
import { OrdenDeJuego } from './orden-de-juego';
import { Reproductor } from './reproductor';

type Vista = 'dia' | 'arbol';

/** Las dos formas de mirar un cuadro armado (opción C): por día y el árbol. */
const PESTANAS: { id: Vista; nombre: string }[] = [
  { id: 'dia', nombre: 'Por día' },
  { id: 'arbol', nombre: 'El árbol' },
];

/**
 * Una categoría de un torneo, en un modal (T135, decisión 6 de la sexta parte).
 *
 * **Antes de armar, quiénes juegan**: en el orden en que se inscribieron y con el estado
 * del pago, que es lo único que se publica de cada uno. **Después, el cuadro.** Debajo,
 * las fotos y los lives del torneo, que antes se abrían bajo la categoría.
 *
 * Es un `<dialog>` con `showModal()`: el navegador atrapa el foco, vuelve inerte el resto
 * y cierra con Escape. Lo abre la página, que es la que sabe de `?cuadro=<id>`; este
 * componente solo sigue a `cuadroId` y avisa cuando se cierra.
 */
@Component({
  selector: 'app-cuadro-publico',
  imports: [Arbol, Galeria, Insignia, OrdenDeJuego, Reproductor],
  template: `
    <!-- A pantalla completa en el teléfono, que es donde más se mira, en el club. -->
    <dialog
      #dialogo
      closedby="any"
      aria-labelledby="titulo-cuadro-publico"
      class="m-auto max-h-[90dvh] w-[min(56rem,94vw)] overflow-y-auto rounded-2xl bg-card
             p-0 shadow-xl backdrop:bg-foreground/50 max-sm:m-0 max-sm:h-dvh
             max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none"
      (close)="alCerrar()"
    >
      <header
        class="sticky top-0 z-10 flex items-start justify-between gap-3 border-b
               border-border bg-card px-5 py-4"
      >
        <div>
          @if (detalle(); as cuadro) {
            <p class="text-sm text-muted-foreground">{{ cuadro.nombre }}</p>
          }
          <h2 id="titulo-cuadro-publico" class="titular text-2xl">{{ titulo() }}</h2>
        </div>
        <button
          #botonCerrar
          type="button"
          class="boton boton-secundario boton-chico shrink-0"
          (click)="dialogo.close()"
        >
          Cerrar
        </button>
      </header>

      <div class="px-5 py-4">
        @if (detalle(); as cuadro) {
          @if (cuadro.partidos.length === 0) {
            @if (cuadro.inscritos.length === 0) {
              <p class="text-sm text-muted-foreground">Todavía no hay inscritos.</p>
            } @else {
              <!-- En el orden en que se inscribieron (T134) y con el estado del pago
                   (decisión 4): es lo único que se publica de cada uno. -->
              <ol class="divide-y divide-border">
                @for (inscrito of cuadro.inscritos; track $index) {
                  <li class="flex items-center justify-between gap-3 py-2.5">
                    <span class="flex items-baseline gap-3">
                      <span
                        class="w-6 text-right font-display text-sm text-muted-foreground
                               tabular-nums"
                      >
                        {{ $index + 1 }}
                      </span>
                      <span>{{ inscrito.nombre }}</span>
                    </span>
                    @if (inscrito.pago === 'PAGADO') {
                      <app-insignia variante="exito">Pagado</app-insignia>
                    } @else if (inscrito.pago === 'PENDIENTE') {
                      <app-insignia variante="aviso">Pago pendiente</app-insignia>
                    }
                  </li>
                }
              </ol>
            }
          } @else {
            <!-- Un buscador para las dos pestañas (T137): marca lo mismo en el orden de
                 juego y en el árbol. -->
            <div class="relative">
              <label for="buscar-jugador" class="sr-only">Buscar a un jugador</label>
              <span
                class="icono pointer-events-none absolute top-1/2 left-3 -translate-y-1/2
                       text-lg text-muted-foreground"
                aria-hidden="true"
              >
                search
              </span>
              <input
                id="buscar-jugador"
                type="search"
                class="campo ps-9"
                placeholder="Busca tu nombre o apellido"
                autocomplete="off"
                [value]="busqueda()"
                (input)="busqueda.set(valorDe($event))"
              />
            </div>
            <!-- Cuántos encontró, para el lector de pantalla; el "nadie" también se ve. -->
            <p class="sr-only" aria-live="polite">{{ resumen() }}</p>
            @if (busqueda().trim() !== '' && encontrados() === 0) {
              <p class="mt-2 text-sm text-muted-foreground">
                Nadie con ese nombre en esta categoría.
              </p>
            }

            <!-- El patrón de pestañas de ARIA: las flechas mueven la pestaña y el foco, y
                 solo la elegida entra en el orden del tabulador. -->
            <div
              role="tablist"
              aria-label="Cómo ver el cuadro"
              class="mt-3 flex gap-5 border-b border-border"
            >
              @for (pestana of PESTANAS; track pestana.id) {
                <button
                  type="button"
                  role="tab"
                  [id]="'pestana-' + pestana.id"
                  [attr.aria-controls]="'panel-' + pestana.id"
                  [attr.aria-selected]="vista() === pestana.id"
                  [tabIndex]="vista() === pestana.id ? 0 : -1"
                  class="-mb-px cursor-pointer border-b-2 py-2 font-display text-sm font-bold
                         tracking-wide uppercase"
                  [class]="
                    vista() === pestana.id
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground'
                  "
                  (click)="vista.set(pestana.id)"
                  (keydown)="moverPestana($event)"
                >
                  {{ pestana.nombre }}
                </button>
              }
            </div>

            <!-- **Primero cuándo y dónde se juega** (T136, opción C); el árbol, al lado. -->
            <div
              role="tabpanel"
              id="panel-dia"
              aria-labelledby="pestana-dia"
              tabindex="0"
              class="mt-3"
              [hidden]="vista() !== 'dia'"
            >
              <app-orden-de-juego [partidos]="cuadro.partidos" [busqueda]="busqueda()" />
            </div>
            <div
              role="tabpanel"
              id="panel-arbol"
              aria-labelledby="pestana-arbol"
              tabindex="0"
              class="mt-3"
              [hidden]="vista() !== 'arbol'"
            >
              <app-arbol [partidos]="cuadro.partidos" [busqueda]="busqueda()" />
            </div>
          }

          <!-- Del torneo y no de la categoría: la entrega de premios y el live de la
               cancha son de todo el fin de semana. El reproductor no carga nada de
               Google hasta que alguien aprieta play. -->
          @if (fotos.hasValue()) {
            <app-galeria [fotos]="fotos.value()" />
          }
          @if (transmisiones.hasValue() && transmisiones.value().length > 0) {
            <div class="mt-4">
              <h3 class="subtitulo">En vivo</h3>
              <div class="grid gap-3 sm:grid-cols-2">
                @for (transmision of transmisiones.value(); track transmision.id) {
                  <app-reproductor [transmision]="transmision" />
                }
              </div>
            </div>
          }
        } @else if (consulta.error()) {
          <p class="text-sm text-destructive">
            No se pudo cargar el cuadro. Reintenta en un momento.
          </p>
        } @else {
          <p class="text-sm text-muted-foreground">Cargando…</p>
        }
      </div>
    </dialog>
  `,
})
export class CuadroPublicoModal {
  private readonly api = inject(Torneos);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** El cuadro que se mira, o nulo con el modal cerrado. */
  readonly cuadroId = input<number | null>(null);

  /** Se cerró: con Escape, con un clic en el fondo o con el botón. */
  readonly cerrar = output<void>();

  private readonly dialogo =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly botonCerrar =
    viewChild.required<ElementRef<HTMLButtonElement>>('botonCerrar');

  /** Quién lo abrió: al cerrar, el foco vuelve ahí y no al principio de la página. */
  private abridor: HTMLElement | null = null;

  protected readonly consulta = resource({
    params: () => this.cuadroId() ?? undefined,
    loader: ({ params }) => this.api.cuadroPublico(params),
  });

  /**
   * El cuadro, **solo si es el que se pidió**. Al cambiar de categoría el `resource`
   * conserva el anterior hasta que llega el nuevo, y sin esto se dibujaba el de la
   * categoría anterior con el título de la nueva.
   */
  protected readonly detalle = computed((): CuadroPublico | null => {
    const cuadro = this.consulta.hasValue() ? this.consulta.value() : undefined;

    return cuadro && cuadro.id === this.cuadroId() ? cuadro : null;
  });

  private readonly torneoId = computed(() => this.detalle()?.torneoId);

  /** Lo que se busca, en las dos pestañas. Cada categoría empieza sin búsqueda. */
  protected readonly busqueda = linkedSignal(() => {
    this.cuadroId();
    return '';
  });

  protected readonly PESTANAS = PESTANAS;

  /** La pestaña a la vista. Cada categoría empieza en "Por día". */
  protected readonly vista = linkedSignal<Vista>(() => {
    this.cuadroId();
    return 'dia';
  });

  /** Los partidos del que se busca, sin los byes: lo que el resumen cuenta. */
  protected readonly encontrados = computed(
    () =>
      (this.detalle()?.partidos ?? []).filter(
        (partido) => !esBye(partido) && esDe(partido, this.busqueda()),
      ).length,
  );

  protected readonly resumen = computed(() => {
    const buscado = this.busqueda().trim();
    if (buscado === '') return '';

    const cuantos = this.encontrados();
    return cuantos === 0
      ? 'Nadie con ese nombre en esta categoría.'
      : `${cuantos} ${cuantos === 1 ? 'partido' : 'partidos'} de "${buscado}".`;
  });

  protected readonly fotos = resource({
    params: () => this.torneoId(),
    loader: ({ params }) => this.api.fotos(params),
    defaultValue: [] as Foto[],
  });

  protected readonly transmisiones = resource({
    params: () => this.torneoId(),
    loader: ({ params }) => this.api.transmisionesPublicas(params),
    defaultValue: [] as Transmision[],
  });

  protected readonly titulo = computed(() => {
    const cuadro = this.detalle();

    if (!cuadro) return 'Cargando…';

    return cuadro.partidos.length > 0
      ? `Cuadro de ${cuadro.categoria}`
      : `Quiénes juegan en ${cuadro.categoria}`;
  });

  constructor() {
    // Abrir y cerrar sigue a `cuadroId`: así Escape, el fondo y el botón —que terminan
    // todos en el evento `close`— y un cambio de la dirección dejan el mismo estado.
    effect(() => {
      const abierto = this.cuadroId() !== null;
      const dialogo = this.dialogo().nativeElement;

      if (abierto && !dialogo.open) {
        this.abridor = document.activeElement as HTMLElement | null;
        dialogo.showModal();
        // El primer control del modal; el navegador hace lo mismo, y así no depende de él.
        this.botonCerrar().nativeElement.focus();
      }

      if (!abierto && dialogo.open) dialogo.close();
    });
  }

  protected alCerrar(): void {
    this.cerrar.emit();
    this.abridor?.focus();
    this.abridor = null;
  }

  /**
   * Las flechas, Inicio y Fin mueven la pestaña y el foco (patrón de pestañas de ARIA).
   * Al final da la vuelta.
   */
  protected moverPestana(evento: KeyboardEvent): void {
    const ids = PESTANAS.map((pestana) => pestana.id);
    const actual = ids.indexOf(this.vista());
    const destino: Record<string, number> = {
      ArrowRight: (actual + 1) % ids.length,
      ArrowLeft: (actual - 1 + ids.length) % ids.length,
      Home: 0,
      End: ids.length - 1,
    };
    const siguiente = destino[evento.key];
    if (siguiente === undefined) return;

    evento.preventDefault();
    this.vista.set(ids[siguiente]);
    this.host.nativeElement
      .querySelector<HTMLElement>(`#pestana-${ids[siguiente]}`)
      ?.focus();
  }

  protected valorDe(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }
}
