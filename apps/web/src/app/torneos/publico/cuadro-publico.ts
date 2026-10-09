import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  resource,
  viewChild,
} from '@angular/core';

import { Insignia } from '../../ui/insignia';
import {
  CuadroPublico,
  Foto,
  PartidoPublico,
  Torneos,
  Transmision,
} from '../torneos.service';
import { Galeria } from './galeria';
import { Reproductor } from './reproductor';

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
  imports: [Galeria, Insignia, Reproductor],
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
            <!-- En columnas que se desplazan de lado y no una tabla que se encoge: en
                 375px una tabla de cuatro rondas queda ilegible. -->
            <div data-cuadro class="flex gap-3 overflow-x-auto pb-2">
              @for (ronda of porRonda(); track ronda.numero) {
                <div class="min-w-48 shrink-0">
                  <h3
                    class="font-display text-sm font-semibold tracking-wider
                           text-muted-foreground uppercase"
                  >
                    {{ ronda.nombre }}
                  </h3>
                  <ul class="mt-2 grid gap-2">
                    @for (partido of ronda.partidos; track partido.posicion) {
                      <li class="rounded-lg border border-border bg-background p-2 text-sm">
                        <p [class.font-semibold]="ganoEl(partido, partido.jugadorA)">
                          {{ partido.jugadorA ?? vacio(partido) }}
                        </p>
                        <p [class.font-semibold]="ganoEl(partido, partido.jugadorB)">
                          {{ partido.jugadorB ?? vacio(partido) }}
                        </p>
                        @if (partido.marcador) {
                          <p class="text-xs text-muted-foreground">{{ partido.marcador }}</p>
                        }
                        @if (partido.walkover) {
                          <p class="text-xs text-muted-foreground">No se presentó</p>
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
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

  protected readonly porRonda = computed(() => {
    const rondas = new Map<number, PartidoPublico[]>();

    for (const partido of this.detalle()?.partidos ?? []) {
      rondas.set(partido.ronda, [...(rondas.get(partido.ronda) ?? []), partido]);
    }

    return [...rondas].map(([numero, suyos]) => ({
      numero,
      nombre: suyos[0].ronda_nombre,
      partidos: suyos,
    }));
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

  /** Un hueco de primera ronda es un bye; en las demás, todavía no se sabe. */
  protected vacio(partido: PartidoPublico): string {
    return partido.ronda === 1 ? 'Bye' : 'Por definir';
  }

  /**
   * Si ese jugador ganó el partido. Por nombre y no por id: la respuesta pública no trae
   * ids de jugadores, a propósito.
   */
  protected ganoEl(partido: PartidoPublico, jugador: string | null): boolean {
    return jugador !== null && partido.ganador === jugador;
  }
}
