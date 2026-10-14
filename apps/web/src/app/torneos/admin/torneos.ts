import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
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
import { CampoFecha } from '../../ui/campo-fecha';
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

/** El formulario vacío. Función y no constante, para no compartir el objeto. */
const enBlanco = () => ({
  nombre: '',
  superficie: '' as string,
  fechaInicio: '',
  fechaFin: '',
  cierreInscripcion: '',
});

/**
 * Los torneos del club. Cuánto vale ganar cada uno lo dice el nivel con que entra a
 * cada tour (T197); la categoría de torneo que se administraba acá se eliminó en T199.
 */
@Component({
  selector: 'app-torneos',
  imports: [
    MatButton,
    MatIcon,
    Esqueleto,
    FormsModule,
    RouterLink,
    Aviso,
    EstadoVacio,
    Insignia,
    CampoFecha,
    ElegirNivel,
  ],
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
        <label class="block sm:col-span-2">
          <span class="text-sm font-medium">Nombre</span>
          <input
            class="campo mt-1"
            name="nombre"
            placeholder="Copa de verano"
            [(ngModel)]="datos.nombre"
          />
        </label>

        <div class="grid gap-1">
          <label class="text-sm font-medium" for="nuevo-fechaInicio">Empieza</label>
          <app-campo-fecha
            inputId="nuevo-fechaInicio"
            name="fechaInicio"
            [(ngModel)]="datos.fechaInicio"
          />
        </div>

        <div class="grid gap-1">
          <label class="text-sm font-medium" for="nuevo-fechaFin">Termina</label>
          <app-campo-fecha
            inputId="nuevo-fechaFin"
            name="fechaFin"
            [(ngModel)]="datos.fechaFin"
          />
        </div>

        <div class="grid gap-1">
          <label class="text-sm font-medium" for="nuevo-cierreInscripcion">Cierra la inscripción</label>
          <app-campo-fecha
            inputId="nuevo-cierreInscripcion"
            name="cierreInscripcion"
            [(ngModel)]="datos.cierreInscripcion"
          />
        </div>

        <label class="block">
          <span class="text-sm font-medium">Superficie</span>
          <select class="campo mt-1" name="superficie" [(ngModel)]="datos.superficie">
            <option value="">Sin definir</option>
            @for (superficie of superficies; track superficie[0]) {
              <option [value]="superficie[0]">{{ superficie[1] }}</option>
            }
          </select>
        </label>

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
      @for (grupo of GRUPOS; track grupo.id) {
        <button
          type="button"
          [matButton]="grupo_() === grupo.id ? 'filled' : 'outlined'"
          class="chico"
          [attr.aria-pressed]="grupo_() === grupo.id"
          (click)="grupo_.set(grupo.id)"
        >
          {{ grupo.nombre }} {{ cuantos(grupo.id) }}
        </button>
      }

      <label class="ms-auto flex items-center gap-2 text-sm">
        <span class="text-muted-foreground">Año</span>
        <select class="campo campo-chico" name="anio" [(ngModel)]="anio">
          <option value="">Todos</option>
          @for (uno of anios(); track uno) {
            <option [value]="uno">{{ uno }}</option>
          }
        </select>
      </label>
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

  /** El año, o todos. Como cadena: sale de un `<select>`. */
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
        ...this.datos,
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
