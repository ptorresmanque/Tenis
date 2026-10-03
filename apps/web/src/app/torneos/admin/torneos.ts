import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Esqueleto } from '../../ui/esqueleto';

import { diaEnPalabras } from '../../catalogo-canchas/reloj-del-club';
import { SUPERFICIES } from '../../catalogo-canchas/superficies';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import {
  CategoriaTorneo,
  ESTADOS_TORNEO,
  EstadoTorneo,
  Torneo,
  Torneos,
} from '../torneos.service';

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
 * Los torneos del club y las categorías con que se puntúan.
 *
 * **La categoría es una fila y no un valor fijo del sistema** porque el club inventa
 * categorías: este año hay un "Máster de fin de año" que el año pasado no existía. Por
 * eso se administran acá y no en un archivo de configuración.
 */
@Component({
  selector: 'app-torneos',
  imports: [Esqueleto, FormsModule, RouterLink, Aviso, EstadoVacio, Insignia],
  template: `
    <!-- La cabecera del panel (TV7.1). Su única acción abre el formulario de
         crear; va como secundaria porque la principal es el "Crear torneo" del
         formulario, y con las dos en azul lleno habría dos principales. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Torneos</h1>
        <p class="mt-1 max-w-prose text-muted-foreground">
          Los torneos del club y las categorías con que reparten puntos.
        </p>
      </div>

      <!-- **Arriba y junto al título, no al pie de la lista.** Que el formulario de
           crear viviera debajo de todos los torneos era uno de los defectos que este
           rediseño venía a arreglar; dejar ahí su botón lo conservaba entero. -->
      <button
        type="button"
        class="boton boton-secundario"
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

        <label class="block">
          <span class="text-sm font-medium">Empieza</span>
          <input
            class="campo mt-1"
            type="date"
            name="fechaInicio"
            [(ngModel)]="datos.fechaInicio"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Termina</span>
          <input
            class="campo mt-1"
            type="date"
            name="fechaFin"
            [(ngModel)]="datos.fechaFin"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Cierra la inscripción</span>
          <input
            class="campo mt-1"
            type="date"
            name="cierreInscripcion"
            [(ngModel)]="datos.cierreInscripcion"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Superficie</span>
          <select class="campo mt-1" name="superficie" [(ngModel)]="datos.superficie">
            <option value="">Sin definir</option>
            @for (superficie of superficies; track superficie[0]) {
              <option [value]="superficie[0]">{{ superficie[1] }}</option>
            }
          </select>
        </label>
      </div>

      <button type="submit" class="boton boton-primario mt-3" [disabled]="trabajando()">
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
          class="boton boton-chico"
          [class]="grupo_() === grupo.id ? 'boton-primario' : 'boton-secundario'"
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
    } @else if (torneos.value().length === 0) {
      <app-estado-vacio
        class="mt-4 block"
        icono="emoji_events"
        titulo="Todavía no hay torneos"
        detalle="Crea una categoría y después el primer torneo."
      />
    } @else {
      <ul class="mt-4 grid gap-3">
        @for (torneo of visibles(); track torneo.id) {
          <li class="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <a
                class="font-display text-xl font-bold tracking-wide text-primary uppercase"
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
                  <span class="me-2">
                    {{ cuadro.categoria }} ({{ cuadro.cupo }}) · {{ cuadro.valor }},
                    {{ cuadro.puntosCampeon }} al campeón
                  </span>
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
          <span class="icono align-middle text-base" aria-hidden="true">
            visibility_off
          </span>
          {{ escondidos() }}
          {{ escondidos() === 1 ? 'torneo no se está mostrando' : 'torneos no se están mostrando' }}
          con este filtro.
        </p>
      }
    }


    <h2 class="rotulo-seccion mt-8">Categorías</h2>
    <p class="mt-2 max-w-prose text-muted-foreground">
      De los puntos del campeón salen los de cada ronda.
    </p>

    @if (categorias.value().length > 0) {
      <ul class="mt-3 grid gap-2">
        @for (categoria of categorias.value(); track categoria.id) {
          <li
            class="flex flex-wrap items-center gap-3 rounded-xl border border-border
                   bg-card p-3 shadow-sm"
          >
            <span class="font-medium" [class.line-through]="!categoria.activa">
              {{ categoria.nombre }}
            </span>
            <span class="text-sm text-muted-foreground">
              {{ categoria.puntosCampeon }} puntos al campeón
            </span>
            <button
              type="button"
              class="boton boton-texto boton-chico ms-auto"
              [disabled]="trabajando()"
              (click)="cambiarActividad(categoria)"
            >
              {{ categoria.activa ? 'Desactivar' : 'Reactivar' }}
            </button>
          </li>
        }
      </ul>
    }

    <form
      class="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-border
             bg-card p-4 shadow-sm"
      (ngSubmit)="crearCategoria()"
    >
      <label class="flex-1">
        <span class="text-sm font-medium">Nombre de la categoría</span>
        <input
          class="campo mt-1"
          name="nombreCategoria"
          placeholder="Club 250"
          [(ngModel)]="categoriaNueva.nombre"
        />
      </label>
      <label class="flex-1">
        <span class="text-sm font-medium">Puntos al campeón</span>
        <input
          class="campo mt-1"
          type="number"
          name="puntosCampeon"
          min="1"
          [(ngModel)]="categoriaNueva.puntosCampeon"
        />
      </label>
      <button type="submit" class="boton boton-secundario" [disabled]="trabajando()">
        Agregar categoría
      </button>
    </form>
  `,
})
export class TorneosPanel {
  private readonly api = inject(Torneos);

  /** La lista compartida del catálogo: una copia acá sería la quinta. */
  protected readonly superficies = Object.entries(SUPERFICIES);

  protected datos = enBlanco();
  protected categoriaNueva = { nombre: '', puntosCampeon: 250 };

  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly torneos = resource({
    params: () => this.version(),
    loader: () => this.api.torneos(),
    defaultValue: [] as Torneo[],
  });

  protected readonly categorias = resource({
    params: () => this.version(),
    loader: () => this.api.categorias(),
    defaultValue: [] as CategoriaTorneo[],
  });

  /** Solo las activas para crear: una desactivada es una que el club dejó de usar. */
  protected readonly categoriasActivas = computed(() =>
    this.categorias.value().filter((categoria) => categoria.activa),
  );

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
    ...new Set(this.torneos.value().map((t) => t.fechaInicio.slice(0, 4))),
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
    return this.torneos.value().filter((t) => this.enElGrupo(t, grupo)).length;
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
    await this.intentar(async () => {
      const torneo = await this.api.crearTorneo({
        ...this.datos,
        superficie: this.datos.superficie || null,
      });

      this.datos = enBlanco();
      // **El torneo nace sin cuadros y hay que decirlo**: sin categorías no se puede
      // inscribir a nadie, y un torneo vacío en la lista no explica por qué.
      this.aviso.set(
        `${torneo.nombre} creado. Ábrelo y agrégale las categorías que va a correr.`,
      );
    });
  }

  protected async crearCategoria(): Promise<void> {
    await this.intentar(async () => {
      await this.api.crearCategoria({
        nombre: this.categoriaNueva.nombre,
        puntosCampeon: Number(this.categoriaNueva.puntosCampeon),
      });

      this.categoriaNueva = { nombre: '', puntosCampeon: 250 };
    });
  }

  protected async cambiarActividad(categoria: CategoriaTorneo): Promise<void> {
    await this.intentar(() =>
      this.api.editarCategoria(categoria.id, { activa: !categoria.activa }),
    );
  }

  private async intentar(accion: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.trabajando.set(true);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: dice si las fechas no cierran o si esa categoría ya existe.
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar.'));
    } finally {
      this.trabajando.set(false);
    }
  }
}
