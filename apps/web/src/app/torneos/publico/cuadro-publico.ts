import { BreakpointObserver } from '@angular/cdk/layout';
import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  resource,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButton } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';

import { dialogoSegun } from '../../ui/dialogo';
import { proveerCampos } from '../../ui/campos';
import { CuadroPublico, Foto, Torneos, Transmision } from '../torneos.service';
import { Arbol } from './arbol';
import { esBye, esDe } from './busqueda';
import { Galeria } from './galeria';
import { OrdenDeJuego } from './orden-de-juego';
import { Reproductor } from './reproductor';
import { Esqueleto } from '../../ui/esqueleto';

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
 * Es un MatDialog (T252): atrapa el foco, vuelve inerte el resto, cierra con Escape y
 * devuelve el foco a quien lo abrió. Lo abre la página, que es la que sabe de
 * `?cuadro=<id>`; este componente solo sigue a `cuadroId` y avisa cuando se cierra.
 */
@Component({
  selector: 'app-cuadro-publico',
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    MatIcon,
    Arbol,
    Esqueleto,
    Galeria,
    OrdenDeJuego,
    Reproductor,
    MatChipsModule,
    MatTabsModule,
  ],
  providers: [proveerCampos()],
  template: `
    <!-- A pantalla completa en el teléfono, que es donde más se mira, en el club. La
         cabecera queda fija y el resto se desplaza debajo, por eso no lleva
         mat-dialog-content, que se desplaza por su cuenta. -->
    <ng-template #dialogo>
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
        <button matButton="outlined" type="button" class="chico shrink-0" mat-dialog-close>
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
                      <mat-chip-set class="insignias">
                        <mat-chip class="insignia exito">
                          <mat-icon matChipAvatar aria-hidden="true">check_circle</mat-icon>
                          Pagado
                        </mat-chip>
                      </mat-chip-set>
                    } @else if (inscrito.pago === 'PENDIENTE') {
                      <mat-chip-set class="insignias">
                        <mat-chip class="insignia aviso">
                          <mat-icon matChipAvatar aria-hidden="true">schedule</mat-icon>
                          Pago pendiente
                        </mat-chip>
                      </mat-chip-set>
                    }
                  </li>
                }
              </ol>
            }
          } @else {
            <!-- Un buscador para las dos pestañas (T137): marca lo mismo en el orden de
                 juego y en el árbol. -->
            <!-- Sin etiqueta a la vista, como antes: la lupa y el texto de ayuda dicen qué es, y
                 el lector oye el nombre del campo. -->
            <mat-form-field class="w-full">
              <mat-icon matIconPrefix class="text-lg text-muted-foreground" aria-hidden="true">
                search
              </mat-icon>
              <input
                matInput
                id="buscar-jugador"
                type="search"
                aria-label="Buscar a un jugador"
                placeholder="Busca tu nombre o apellido"
                autocomplete="off"
                [value]="busqueda()"
                (input)="busqueda.set(valorDe($event))"
              />
            </mat-form-field>
            <!-- Cuántos encontró, para el lector de pantalla; el "nadie" también se ve. -->
            <p class="sr-only" aria-live="polite">{{ resumen() }}</p>
            @if (busqueda().trim() !== '' && encontrados() === 0) {
              <p class="mt-2 text-sm text-muted-foreground">
                Nadie con ese nombre en esta categoría.
              </p>
            }

            <!-- Las pestañas de Material (T262): las flechas recorren las pestañas, Enter o
                 Espacio eligen, y solo la elegida entra en el orden del tabulador. Cada
                 categoría empieza en "Por día". -->
            <mat-tab-group
              class="mt-3"
              aria-label="Cómo ver el cuadro"
              mat-stretch-tabs="false"
              mat-align-tabs="start"
              [selectedIndex]="indiceDeLaVista()"
              (selectedIndexChange)="vista.set(PESTANAS[$event].id)"
            >
              <!-- **Primero cuándo y dónde se juega** (T136, opción C); el árbol, al lado. -->
              <mat-tab [label]="PESTANAS[0].nombre">
                <app-orden-de-juego
                  class="mt-3 block"
                  [partidos]="cuadro.partidos"
                  [busqueda]="busqueda()"
                />
              </mat-tab>
              <mat-tab [label]="PESTANAS[1].nombre">
                <app-arbol class="mt-3 block" [partidos]="cuadro.partidos" [busqueda]="busqueda()" />
              </mat-tab>
            </mat-tab-group>
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
          <app-esqueleto [filas]="4" etiqueta="Cargando el cuadro…" />
        }
      </div>
    </ng-template>
  `,
})
export class CuadroPublicoModal {
  private readonly api = inject(Torneos);

  /** El cuadro que se mira, o nulo con el modal cerrado. */
  readonly cuadroId = input<number | null>(null);

  /** Se cerró: con Escape, con un clic en el fondo o con el botón. */
  readonly cerrar = output<void>();

  private readonly dialogo = viewChild.required<TemplateRef<unknown>>('dialogo');

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

  /** La vista como índice de `mat-tab-group`, que cuenta las pestañas desde cero. */
  protected readonly indiceDeLaVista = computed(() =>
    PESTANAS.findIndex((pestana) => pestana.id === this.vista()),
  );

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
    // Abrir y cerrar sigue a `cuadroId`: así Escape, el fondo, el botón y un cambio de la
    // dirección dejan el mismo estado. El foco entra al botón de cerrar —el primero que se
    // puede tocar— y al cerrarse vuelve a quien lo abrió: los dos los hace MatDialog.
    const telefono = inject(BreakpointObserver).isMatched('(max-width: 639px)');
    dialogoSegun(
      () => this.cuadroId() !== null,
      this.dialogo,
      () => this.cerrar.emit(),
      {
        ariaLabelledBy: 'titulo-cuadro-publico',
        autoFocus: 'button[mat-dialog-close]',
        ...(telefono
          ? { width: '100vw', maxWidth: '100vw', height: '100dvh', maxHeight: '100dvh' }
          : { width: '56rem', maxWidth: '94vw', maxHeight: '90dvh' }),
      },
    );
  }

  protected valorDe(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }
}
