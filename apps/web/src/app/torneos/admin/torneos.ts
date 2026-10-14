import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { proveerCampos } from '../../ui/campos';
import { fechaATexto, proveerFechaYHora } from '../../ui/fecha-y-hora';
import { Esqueleto } from '../../ui/esqueleto';

import { diaEnPalabras } from '../../catalogo-canchas/reloj-del-club';
import { SUPERFICIES } from '../../catalogo-canchas/superficies';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import {
  ESTADOS_TORNEO,
  EstadoTorneo,
  Torneo,
  Torneos,
} from '../torneos.service';
import { ElegirNivel, NivelElegido } from './elegir-nivel';

/**
 * Los tres grupos con que el club mira su temporada.
 *
 * **Activo es tres estados y no dos**: el torneo con el cuadro ya armado todavía da
 * trabajo —hay partidos que programar— así que esconderlo sería peor que mostrarlo.
 */
const GRUPOS = [
  {
    id: 'activos' as const,
    nombre: 'Activos',
    estados: ['INSCRIPCION', 'CUADRO_ARMADO', 'EN_CURSO'] as EstadoTorneo[],
  },
  {
    id: 'finalizados' as const,
    nombre: 'Finalizados',
    estados: ['FINALIZADO'] as EstadoTorneo[],
  },
  {
    id: 'cancelados' as const,
    nombre: 'Cancelados',
    estados: ['CANCELADO'] as EstadoTorneo[],
  },
];

type Grupo = (typeof GRUPOS)[number]['id'];

/**
 * El formulario vacío. Función y no constante, para no compartir el objeto. Las fechas, como
 * las entrega el calendario de Material, y a texto recién al crear el torneo (A5, T244).
 */
const enBlanco = () => ({
  nombre: '',
  superficie: '' as string,
  fechaInicio: null as Date | null,
  fechaFin: null as Date | null,
  cierreInscripcion: null as Date | null,
});

/**
 * Los torneos del club. Cuánto vale ganar cada uno lo dice el nivel con que entra a
 * cada tour (T197); la categoría de torneo que se administraba acá se eliminó en T199.
 */
@Component({
  selector: 'app-torneos',
  imports: [
    MatButtonToggleModule,
    MatSelectModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    MatIcon,
    Esqueleto,
    FormsModule,
    RouterLink,
    Aviso,
    EstadoVacio,
    Insignia,
    ElegirNivel,
  ],
  providers: [proveerCampos(), proveerFechaYHora()],
  template: `
    <!-- La cabecera del panel (TV7.1). Su única acción abre el formulario de
         crear; va como secundaria porque la principal es el "Crear torneo" del
         formulario, y con las dos en azul lleno habría dos principales. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Torneos</h1>
        <p class="mt-1 text-muted-foreground">
          Los torneos del club y los tours para los que suman.
        </p>
      </div>

      <!-- **Arriba y junto al título, no al pie de la lista.** Que el formulario de
           crear viviera debajo de todos los torneos era uno de los defectos que este
           rediseño venía a arreglar; dejar ahí su botón lo conservaba entero. -->
      <button
        matButton="outlined"
        type="button"
        [attr.aria-expanded]="creando()"
        (click)="creando.set(!creando())"
      >
        {{ creando() ? 'Cerrar' : 'Crear torneo' }}
      </button>
    </header>

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }
    @if (aviso(); as texto) {
      <app-aviso variante="exito" class="mt-4 block">{{ texto }}</app-aviso>
    }

    @if (creando()) {
    <form
      class="mt-3 rounded-xl border border-border bg-card p-4 shadow-sm"
      (ngSubmit)="crearTorneo()"
    >
      <h2 class="rotulo-seccion">Crear un torneo</h2>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <mat-form-field class="sm:col-span-2">
          <mat-label>Nombre</mat-label>
          <input
            matInput
            name="nombre"
            placeholder="Copa de verano"
            [(ngModel)]="datos.nombre"
          />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Empieza</mat-label>
          <input
            matInput
            id="nuevo-fechaInicio"
            name="fechaInicio"
            placeholder="dd-mm-aaaa"
            autocomplete="off"
            [matDatepicker]="calendarioFechaInicio"
            [(ngModel)]="datos.fechaInicio"
          />
          <mat-datepicker-toggle matIconSuffix [for]="calendarioFechaInicio" />
          <mat-datepicker #calendarioFechaInicio />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Termina</mat-label>
          <input
            matInput
            id="nuevo-fechaFin"
            name="fechaFin"
            placeholder="dd-mm-aaaa"
            autocomplete="off"
            [matDatepicker]="calendarioFechaFin"
            [(ngModel)]="datos.fechaFin"
          />
          <mat-datepicker-toggle matIconSuffix [for]="calendarioFechaFin" />
          <mat-datepicker #calendarioFechaFin />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Cierra la inscripción</mat-label>
          <input
            matInput
            id="nuevo-cierreInscripcion"
            name="cierreInscripcion"
            placeholder="dd-mm-aaaa"
            autocomplete="off"
            [matDatepicker]="calendarioCierreInscripcion"
            [(ngModel)]="datos.cierreInscripcion"
          />
          <mat-datepicker-toggle matIconSuffix [for]="calendarioCierreInscripcion" />
          <mat-datepicker #calendarioCierreInscripcion />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Superficie</mat-label>
          <mat-select name="superficie" [(ngModel)]="datos.superficie">
            <mat-option value="">Sin definir</mat-option>
            @for (superficie of superficies; track superficie[0]) {
              <mat-option [value]="superficie[0]">{{ superficie[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <!-- **El primer tour va en el alta** (D10): un torneo que no suma para nada no
             tiene ranking. Los demás se agregan en Ajustes. -->
        <div class="sm:col-span-2">
          <app-elegir-nivel [(eleccion)]="tour" />
        </div>
      </div>

      <button
        matButton="filled"
        type="submit"
        class="mt-3"
        [attr.aria-busy]="enCurso() === 'crearTorneo'"
        [disabled]="trabajando() || tour().nivelId === null"
      >
        Crear torneo
      </button>
    </form>
    }

    <!-- **El filtro dice lo que esconde antes de que lo toques.** Por defecto solo
         se ven los que dan trabajo hoy; sin el número al lado, el día que alguien
         busque un torneo viejo va a creer que se borró. -->
    <div class="mt-4 flex flex-wrap items-center gap-2">
      <mat-button-toggle-group
        aria-label="Filtrar torneos"
        hideSingleSelectionIndicator
        [value]="grupo_()"
        (change)="grupo_.set($event.value)"
      >
        @for (grupo of GRUPOS; track grupo.id) {
          <mat-button-toggle [value]="grupo.id">
            {{ grupo.nombre }} {{ cuantos(grupo.id) }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>

      <mat-form-field class="chico ms-auto w-28">
        <mat-label>Año</mat-label>
        <mat-select name="anio" [(ngModel)]="anio">
          <mat-option value="">Todos</mat-option>
          @for (uno of anios(); track uno) {
            <mat-option [value]="uno">{{ uno }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    @if (torneos.isLoading()) {
      <app-esqueleto class="mt-4 block" [filas]="4" etiqueta="Cargando los torneos…" />
    } @else if (torneos.error()) {
      <p class="mt-4 text-destructive">
        No se pudieron cargar los torneos. Reintenta en un momento.
      </p>
    } @else if (torneos.value().length === 0) {
      <app-estado-vacio
        class="mt-4 block"
        icono="emoji_events"
        titulo="Todavía no hay torneos"
        detalle="Crea el primero: necesita un tour con al menos un nivel."
      />
    } @else {
      <ul class="mt-4 grid gap-3">
        @for (torneo of visibles(); track torneo.id) {
          <li class="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <a
                class="titulo-tarjeta text-primary"
                [routerLink]="['/administracion/torneos', torneo.id]"
              >
                {{ torneo.nombre }}
              </a>
              <app-insignia
                [variante]="torneo.estado === 'INSCRIPCION' ? 'exito' : 'neutro'"
                icono="flag"
              >
                {{ nombreEstado(torneo.estado) }}
              </app-insignia>
              <span class="text-sm text-muted-foreground">
                {{ enPalabras(torneo.fechaInicio) }} —
                {{ enPalabras(torneo.fechaFin) }}
                @if (torneo.estado === 'INSCRIPCION') {
                  · inscripción hasta {{ enPalabras(torneo.cierreInscripcion) }}
                }
              </span>
            </div>

            <p class="mt-1 text-sm text-muted-foreground">
              @if (torneo.cuadros.length === 0) {
                Todavía no corre ninguna categoría.
              } @else {
                @for (cuadro of torneo.cuadros; track cuadro.id) {
                  <span class="me-2">{{ cuadro.categoria }} ({{ cuadro.cupo }})</span>
                }
              }
            </p>

            <!-- El trabajo pendiente, en la tarjeta: es lo que evita entrar a los
                 tres torneos abiertos para descubrir que dos estaban al día. -->
            @if (torneo.pagosPorRevisar > 0 || torneo.enEspera > 0) {
              <p class="mt-2 flex flex-wrap gap-2">
                @if (torneo.pagosPorRevisar > 0) {
                  <a [routerLink]="['/administracion/torneos', torneo.id]">
                    <app-insignia variante="aviso" icono="receipt_long">
                      {{ torneo.pagosPorRevisar }}
                      {{ torneo.pagosPorRevisar === 1 ? 'pago' : 'pagos' }} por revisar
                    </app-insignia>
                  </a>
                }
                @if (torneo.enEspera > 0) {
                  <app-insignia variante="neutro" icono="hourglass_empty">
                    {{ torneo.enEspera }} en lista de espera
                  </app-insignia>
                }
              </p>
            }
          </li>
        }
      </ul>

      @if (visibles().length === 0) {
        <app-estado-vacio
          class="mt-4 block"
          icono="filter_alt_off"
          titulo="Ningún torneo con ese filtro"
          detalle="Prueba con otro estado o con otro año."
        />
      }

      @if (escondidos() > 0) {
        <p class="mt-3 text-sm text-muted-foreground">
          <mat-icon class="align-middle text-base" aria-hidden="true">
            visibility_off
          </mat-icon>
          {{ escondidos() }}
          {{ escondidos() === 1 ? 'torneo no se está mostrando' : 'torneos no se están mostrando' }}
          con este filtro.
        </p>
      }
    }
  `,
})
export class TorneosPanel {
  private readonly api = inject(Torneos);

  /** La lista compartida del catálogo: una copia acá sería la quinta. */
  protected readonly superficies = Object.entries(SUPERFICIES);

  protected datos = enBlanco();
  /** El tour y el nivel del alta. Señal, porque el selector la escribe con `model`. */
  protected readonly tour = signal<NivelElegido>({ tourId: null, nivelId: null });

  protected readonly trabajando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly torneos = resource({
    params: () => this.version(),
    loader: () => this.api.torneos(),
    defaultValue: [] as Torneo[],
  });

  /** Si el formulario de crear está abierto. Cerrado por omisión: es lo raro. */
  protected readonly creando = signal(false);

  /**
   * Qué grupo de estados se está mirando. **Activos por omisión.**
   *
   * El torneo con el cuadro armado sigue siendo trabajo —hay partidos que programar—,
   * así que "activo" son tres estados y no dos. Los cancelados no están abiertos ni en
   * curso, así que se esconden con los finalizados, pero tienen su propio grupo.
   */
  protected readonly grupo_ = signal<Grupo>('activos');

  /** El año, o todos. Como cadena: es el valor de las opciones de su lista. */
  protected anio = '';

  protected readonly GRUPOS = GRUPOS;

  /** Los años que tienen algún torneo, del más nuevo al más viejo. */
  protected readonly anios = computed(() => [
    ...new Set(this.cargados().map((t) => t.fechaInicio.slice(0, 4))),
  ]);

  /**
   * Lo que se muestra: el grupo elegido y, si se pidió, el año.
   *
   * **Se filtra en el navegador y no en el servidor.** El club hace un puñado de
   * torneos al año: a diez años son unas cincuenta filas, y pedirle al servidor que
   * filtre sería un parámetro más que mantener para ahorrar nada.
   */
  protected readonly visibles = computed(() =>
    this.torneos
      .value()
      .filter((torneo) => this.enElGrupo(torneo, this.grupo_()))
      .filter((torneo) => this.anio === '' || torneo.fechaInicio.startsWith(this.anio)),
  );

  protected readonly escondidos = computed(
    () => this.torneos.value().length - this.visibles().length,
  );

  /** Cuántos hay en un grupo, para decirlo en el botón antes de apretarlo. */
  protected cuantos(grupo: Grupo): number {
    return this.cargados().filter((t) => this.enElGrupo(t, grupo)).length;
  }

  /** Los filtros se pintan aunque la lista no cargue, y `value()` lanzaría. */
  private cargados(): Torneo[] {
    return this.torneos.hasValue() ? this.torneos.value() : [];
  }

  private enElGrupo(torneo: Torneo, grupo: Grupo): boolean {
    return GRUPOS.find((uno) => uno.id === grupo)!.estados.includes(torneo.estado);
  }

  protected recargar(): void {
    this.version.update((veces) => veces + 1);
  }

  protected readonly enPalabras = diaEnPalabras;

  protected nombreEstado(estado: EstadoTorneo): string {
    return ESTADOS_TORNEO[estado] ?? estado;
  }

  protected async crearTorneo(): Promise<void> {
    const { tourId, nivelId } = this.tour();
    if (tourId === null || nivelId === null) return;

    await this.intentar('crearTorneo', async () => {
      const torneo = await this.api.crearTorneo({
        nombre: this.datos.nombre,
        fechaInicio: fechaATexto(this.datos.fechaInicio),
        fechaFin: fechaATexto(this.datos.fechaFin),
        cierreInscripcion: fechaATexto(this.datos.cierreInscripcion),
        superficie: this.datos.superficie || null,
        tours: [{ tourId, nivelId }],
      });

      this.datos = enBlanco();
      this.tour.set({ tourId: null, nivelId: null });
      // **El torneo nace sin cuadros y hay que decirlo**: sin categorías no se puede
      // inscribir a nadie, y un torneo vacío en la lista no explica por qué.
      this.aviso.set(
        `${torneo.nombre} creado. Ábrelo y agrégale las categorías que va a correr.`,
      );
    });
  }

  private async intentar(
    clave: string,
    accion: () => Promise<unknown>,
  ): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: dice si las fechas no cierran o si el nivel no es de ese tour.
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar.'));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
    }
  }
}
