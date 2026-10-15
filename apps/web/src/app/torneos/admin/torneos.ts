import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatCard } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { MatFabButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { proveerCampos } from '../../ui/campos';
import { Esqueleto } from '../../ui/esqueleto';

import { diaEnPalabras } from '../../catalogo-canchas/reloj-del-club';
import { EstadoVacio } from '../../ui/estado-vacio';
import {
  ESTADOS_TORNEO,
  EstadoTorneo,
  Torneo,
  Torneos,
} from '../torneos.service';
import { NuevoTorneo } from './nuevo-torneo';
import { LO_HECHO } from '../../ui/material';

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
 * Los torneos del club. Cuánto vale ganar cada uno lo dice el nivel con que entra a
 * cada tour (T197); la categoría de torneo que se administraba acá se eliminó en T199.
 */
@Component({
  selector: 'app-torneos',
  // Espacio al final para que el FAB no tape la última tarjeta (A9).
  host: { class: 'block pb-24' },
  imports: [
    MatCard,
    MatButtonToggleModule,
    MatSelectModule,
    MatFormFieldModule,
    MatFabButton,
    MatIcon,
    Esqueleto,
    FormsModule,
    RouterLink,
    EstadoVacio,
    MatChipsModule,
  ],
  providers: [proveerCampos()],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: crear un torneo es el FAB, que abre su
         diálogo (T291). Antes era un botón «Crear torneo / Cerrar» que desplegaba el
         formulario en la página. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Torneos</h1>
        <p class="mt-1 text-muted-foreground">
          Los torneos del club y los tours para los que suman.
        </p>
      </div>
    </header>

    <button matFab extended type="button" class="fab-de-la-pantalla" (click)="crear()">
      <mat-icon aria-hidden="true">add</mat-icon>
      Nuevo torneo
    </button>

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
          <li>
            <mat-card appearance="outlined" class="p-4">
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <a
                  class="titulo-tarjeta text-primary"
                  [routerLink]="['/administracion/torneos', torneo.id]"
                >
                  {{ torneo.nombre }}
                </a>
                <mat-chip-set class="insignias">
                  <mat-chip
                    class="insignia"
                    [class]="torneo.estado === 'INSCRIPCION' ? 'exito' : 'neutro'"
                  >
                    <mat-icon matChipAvatar aria-hidden="true">flag</mat-icon>
                    {{ nombreEstado(torneo.estado) }}
                  </mat-chip>
                </mat-chip-set>
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
                      <mat-chip-set class="insignias">
                        <mat-chip class="insignia aviso">
                          <mat-icon matChipAvatar aria-hidden="true">receipt_long</mat-icon>
                          {{ torneo.pagosPorRevisar }}
                          {{ torneo.pagosPorRevisar === 1 ? 'pago' : 'pagos' }} por revisar
                        </mat-chip>
                      </mat-chip-set>
                    </a>
                  }
                  @if (torneo.enEspera > 0) {
                    <mat-chip-set class="insignias">
                      <mat-chip class="insignia neutro">
                        <mat-icon matChipAvatar aria-hidden="true">hourglass_empty</mat-icon>
                        {{ torneo.enEspera }} en lista de espera
                      </mat-chip>
                    </mat-chip-set>
                  }
                </p>
              }
            </mat-card>
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
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogos = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly api = inject(Torneos);

  private readonly version = signal(0);

  protected readonly torneos = resource({
    params: () => this.version(),
    loader: () => this.api.torneos(),
    defaultValue: [] as Torneo[],
  });

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

  /**
   * Abre el alta (T291). El diálogo crea el torneo y muestra sus errores; acá, lo que sigue:
   * **lleva a su ficha**, porque nace sin categorías y ahí se le agregan.
   */
  protected async crear(): Promise<void> {
    const torneo = await firstValueFrom(
      this.dialogos
        .open<NuevoTorneo, void, Torneo>(NuevoTorneo, { width: '36rem', maxWidth: '92vw' })
        .afterClosed(),
    );
    if (!torneo) return;

    // **El torneo nace sin cuadros y hay que decirlo**: sin categorías no se puede inscribir a
    // nadie, y un torneo vacío no explica por qué.
    this.snackBar.open(
      `${torneo.nombre} creado: agrégale las categorías que va a correr.`,
      undefined,
      LO_HECHO,
    );
    void this.router.navigate(['/administracion/torneos', torneo.id]);
  }
}
