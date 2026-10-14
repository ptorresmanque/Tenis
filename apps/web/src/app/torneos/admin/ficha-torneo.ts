import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';

import { proveerCampos } from '../../ui/campos';
import { fechaATexto, proveerFechaYHora, textoAFecha } from '../../ui/fecha-y-hora';
import { diaEnPalabras } from '../../catalogo-canchas/reloj-del-club';
import { SUPERFICIES } from '../../catalogo-canchas/superficies';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { CuadroDelTorneo } from './cuadro';
import { CuadrosDelTorneo } from './cuadros-del-torneo';
import { FotosDelTorneo } from './fotos';
import { InscritosDelTorneo } from './inscritos';
import { ToursDelTorneo } from './tours-del-torneo';
import { TransmisionesDelTorneo } from './transmisiones';
import { ESTADOS_TORNEO, EstadoTorneo, Torneos } from '../torneos.service';
import { LO_HECHO } from '../../ui/material';

/** Las cuatro cosas que se le hacen a un torneo, y en el orden en que se hacen. */
type Pestana = 'inscritos' | 'cuadro' | 'multimedia' | 'ajustes';

const PESTANAS: { id: Pestana; nombre: string; icono: string }[] = [
  { id: 'inscritos', nombre: 'Inscritos', icono: 'group' },
  { id: 'cuadro', nombre: 'Cuadro', icono: 'account_tree' },
  { id: 'multimedia', nombre: 'Multimedia', icono: 'photo_library' },
  { id: 'ajustes', nombre: 'Ajustes', icono: 'tune' },
];

/**
 * Un torneo del panel, con su trabajo repartido en pestañas.
 *
 * **Reemplaza el acordeón.** Todo esto vivía dentro de un `<li>` de la lista de
 * torneos, anidado cuatro niveles: para llegar a los inscritos de Honor había que
 * abrir el torneo, bajar pasando transmisiones y fotos, elegir el cuadro en una fila
 * de botones a media página, y seguir bajando. Con una ruta por torneo, cada tarea
 * tiene su lugar y el cuadro se elige **una vez, arriba**.
 *
 * **Programar los partidos no es una pestaña**, aunque el diseño la dibujaba: se
 * programa desde el cuadro —cada partido tiene su botón y el formulario aparece
 * debajo—, así que separarla obligaba a duplicar el cuadro o a dar una lista de
 * partidos sin el contexto del cruce.
 */
@Component({
  selector: 'app-ficha-torneo',
  imports: [
    MatButtonToggleModule,
    MatSelectModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    MatIcon,
    FormsModule,
    RouterLink,
    Aviso,
    EstadoVacio,
    InscritosDelTorneo,
    CuadroDelTorneo,
    CuadrosDelTorneo,
    TransmisionesDelTorneo,
    FotosDelTorneo,
    ToursDelTorneo,
    MatChipsModule,
    MatTabsModule,
  ],
  providers: [proveerCampos(), proveerFechaYHora()],
  template: `
    <a routerLink="/administracion/torneos" class="text-sm font-semibold text-primary">
      <mat-icon class="align-middle text-base" aria-hidden="true">arrow_back</mat-icon>
      Torneos
    </a>

    @if (torneos.error()) {
      <p class="mt-4 text-destructive">
        No se pudo cargar el torneo. Reintenta en un momento.
      </p>
    } @else if (torneo(); as suyo) {
      <!-- La cabecera del panel (TV7.1), sin acción: cada pestaña trae las suyas,
           y las pestañas van debajo. -->
      <header class="cabecera-panel mt-1">
        <div>
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="titular text-4xl">{{ suyo.nombre }}</h1>
            <mat-chip-set class="insignias">
              <mat-chip
                class="insignia"
                [class]="suyo.estado === 'INSCRIPCION' ? 'exito' : 'neutro'"
              >
                <mat-icon matChipAvatar aria-hidden="true">flag</mat-icon>
                {{ nombreEstado(suyo.estado) }}
              </mat-chip>
            </mat-chip-set>
          </div>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ enPalabras(suyo.fechaInicio) }} — {{ enPalabras(suyo.fechaFin) }} ·
            inscripción hasta {{ enPalabras(suyo.cierreInscripcion) }}
          </p>
        </div>
      </header>

      <!-- Pestañas y no enlaces: cambian lo que se muestra sin cambiar de página. Son de
           Material (T262): el lector de pantalla oye cuál está activa, y las flechas las
           recorren. El panel es uno para las cuatro: el cuadro elegido vale para dos. -->
      <nav
        mat-tab-nav-bar
        class="envuelve compacta mt-4"
        disablePagination
        mat-stretch-tabs="false"
        aria-label="Secciones del torneo"
        [tabPanel]="panelDelTorneo"
      >
        @for (pestana of PESTANAS; track pestana.id) {
          <button
            mat-tab-link
            type="button"
            [active]="activa() === pestana.id"
            (click)="activa.set(pestana.id)"
          >
            <mat-icon class="me-2 text-base" aria-hidden="true">{{ pestana.icono }}</mat-icon>
            {{ pestana.nombre }}
            @if (pestana.id === 'inscritos' && suyo.pagosPorRevisar > 0) {
              <span
                class="ms-1 rounded-control bg-warning-soft px-2 text-xs
                       text-warning-strong"
              >
                {{ suyo.pagosPorRevisar }}
              </span>
            }
          </button>
        }
      </nav>

      <mat-tab-nav-panel #panelDelTorneo>
        @if (suyo.cuadros.length === 0) {
          <app-estado-vacio
            class="mt-4 block"
            icono="category"
            titulo="Este torneo todavía no corre ninguna categoría"
            detalle="Agrégale una en Ajustes: el cupo y el precio son de cada cuadro."
          />
        } @else {
          <!-- **El cuadro se elige una vez y vale para todas las pestañas.** Antes se
               elegía a media página y el elegido se arrastraba de un torneo a otro. -->
          @if (activa() !== 'ajustes' && activa() !== 'multimedia') {
            <div class="mt-4 flex flex-wrap items-center gap-2">
              <span id="cuadro-de-la-ficha" class="text-sm font-medium">Cuadro:</span>
              <mat-button-toggle-group
                aria-labelledby="cuadro-de-la-ficha"
                hideSingleSelectionIndicator
                [value]="elegido()"
                (change)="elegido.set($event.value)"
              >
                @for (cuadro of suyo.cuadros; track cuadro.id) {
                  <mat-button-toggle [value]="cuadro.id">{{ cuadro.categoria }}</mat-button-toggle>
                }
              </mat-button-toggle-group>
            </div>
          }

          @if (activa() === 'inscritos' && elegido(); as cuadroId) {
            <app-inscritos-torneo [cuadroId]="cuadroId" />
          }

          @if (activa() === 'cuadro' && elegido(); as cuadroId) {
            <app-cuadro-torneo [cuadroId]="cuadroId" />
          }
        }

        @if (activa() === 'multimedia') {
          <app-transmisiones-del-torneo [torneoId]="suyo.id" />
          <app-fotos-del-torneo [torneoId]="suyo.id" />
        }

        @if (activa() === 'ajustes') {
          <!-- **Los datos del torneo primero**: es lo que identifica lo que se está
               mirando. Después sus tours y sus cuadros, y al final lo destructivo. -->
          <form
            class="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm"
            (ngSubmit)="guardar(suyo.id)"
          >
            <h2 class="rotulo-seccion">Datos del torneo</h2>

            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <mat-form-field class="sm:col-span-2">
                <mat-label>Nombre</mat-label>
                <input
                  matInput
                  name="nombre"
                  maxlength="120"
                  [(ngModel)]="datos().nombre"
                />
              </mat-form-field>

              <mat-form-field>
                <mat-label>Empieza</mat-label>
                <input
                  matInput
                  id="ficha-fechaInicio"
                  name="fechaInicio"
                  placeholder="dd-mm-aaaa"
                  autocomplete="off"
                  [matDatepicker]="calendarioFechaInicio"
                  [(ngModel)]="datos().fechaInicio"
                />
                <mat-datepicker-toggle matIconSuffix [for]="calendarioFechaInicio" />
                <mat-datepicker #calendarioFechaInicio />
              </mat-form-field>

              <mat-form-field>
                <mat-label>Termina</mat-label>
                <input
                  matInput
                  id="ficha-fechaFin"
                  name="fechaFin"
                  placeholder="dd-mm-aaaa"
                  autocomplete="off"
                  [matDatepicker]="calendarioFechaFin"
                  [(ngModel)]="datos().fechaFin"
                />
                <mat-datepicker-toggle matIconSuffix [for]="calendarioFechaFin" />
                <mat-datepicker #calendarioFechaFin />
              </mat-form-field>

              <mat-form-field>
                <mat-label>Cierra la inscripción</mat-label>
                <input
                  matInput
                  id="ficha-cierreInscripcion"
                  name="cierreInscripcion"
                  placeholder="dd-mm-aaaa"
                  autocomplete="off"
                  [matDatepicker]="calendarioCierreInscripcion"
                  [(ngModel)]="datos().cierreInscripcion"
                />
                <mat-datepicker-toggle matIconSuffix [for]="calendarioCierreInscripcion" />
                <mat-datepicker #calendarioCierreInscripcion />
              </mat-form-field>

              <mat-form-field>
                <mat-label>Superficie</mat-label>
                <mat-select
                  name="superficie"
                  [(ngModel)]="datos().superficie"
                >
                  <mat-option value="">Sin definir</mat-option>
                  @for (superficie of superficies; track superficie[0]) {
                    <mat-option [value]="superficie[0]">{{ superficie[1] }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>

            <button
              matButton="filled"
              type="submit"
              class="mt-3"
              [disabled]="trabajando()"
              [attr.aria-busy]="enCurso() === 'guardar-' + suyo.id"
            >
              Guardar cambios
            </button>
          </form>

          <app-tours-del-torneo [torneo]="suyo" (cambiaron)="torneos.reload()" />

          <app-cuadros-del-torneo [torneoId]="suyo.id" (cambiaron)="torneos.reload()" />

          <!-- **Cancelar es lo último de la pantalla y lo único destructivo.** Va con su
               borde rojo, separado del resto, y diciendo antes lo que no hace: el
               sistema no le devuelve la plata a nadie. -->
          <section
            class="mt-6 rounded-xl border border-destructive/30 bg-card p-4"
            aria-labelledby="titulo-cancelar"
          >
            <!-- En rojo, como la alarma de las canchas: es la zona que no tiene
                 vuelta atrás para los inscritos. -->
            <h2 id="titulo-cancelar" class="rotulo-seccion bg-destructive text-on-primary">
              {{ suyo.estado === 'CANCELADO' ? 'Torneo cancelado' : 'Cancelar el torneo' }}
            </h2>

            @if (suyo.estado === 'CANCELADO') {
              <p class="mt-1 max-w-prose text-sm text-muted-foreground">
                No aparece en el calendario público y no acepta inscripciones. Sus
                inscritos, cuadros y partidos siguen guardados: reactivarlo lo devuelve a
                donde estaba.
              </p>

              <button
                matButton="outlined"
                type="button"
                class="mt-3"
                [disabled]="trabajando()"
                [attr.aria-busy]="enCurso() === 'reactivar-' + suyo.id"
                (click)="reactivar(suyo.id)"
              >
                Reactivar el torneo
              </button>
            } @else if (suyo.estado === 'FINALIZADO') {
              <p class="mt-1 max-w-prose text-sm text-muted-foreground">
                Este torneo ya se jugó: sus puntos están en el ranking y sus partidos en
                el historial, así que no se cancela.
              </p>
            } @else {
              <p class="mt-1 max-w-prose text-sm text-muted-foreground">
                Desaparece del calendario público y deja de aceptar inscripciones. No se
                borra nada y se puede deshacer.
                <strong>El sistema no devuelve el dinero de las inscripciones pagadas</strong>:
                eso lo resuelve el club por su cuenta.
              </p>

              @if (confirmando()) {
                <div class="mt-3 flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium">
                    ¿Seguro? {{ suyo.nombre }} sale del calendario.
                  </span>
                  <button
                    matButton="outlined"
                    type="button"
                    [disabled]="trabajando()"
                    [attr.aria-busy]="enCurso() === 'cancelar-' + suyo.id"
                    (click)="cancelar(suyo.id)"
                  >
                    Sí, cancelar el torneo
                  </button>
                  <button
                    matButton
                    type="button"
                    (click)="confirmando.set(false)"
                  >
                    Mejor no
                  </button>
                </div>
              } @else {
                <button
                  matButton="outlined"
                  type="button"
                  class="mt-3"
                  (click)="confirmando.set(true)"
                >
                  Cancelar el torneo
                </button>
              }
            }

            @if (error(); as falla) {
              <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
            }
          </section>
        }
      </mat-tab-nav-panel>
    } @else if (!torneos.isLoading()) {
      <app-estado-vacio
        class="mt-4 block"
        icono="search_off"
        titulo="No encontramos ese torneo"
        detalle="Puede que lo hayan borrado."
      />
    }
  `,
})
export class FichaDeTorneo {
  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(Torneos);

  /** Llega de la ruta por `withComponentInputBinding`. */
  readonly id = input.required<string>();

  /**
   * `?cuadro=<id>`: el enlace del correo de un comprobante (T130) abre los inscritos de
   * esa categoría. Llega por el mismo `withComponentInputBinding`.
   */
  readonly cuadro = input<string>();

  protected readonly PESTANAS = PESTANAS;
  protected readonly activa = signal<Pestana>('inscritos');

  protected readonly torneos = resource({
    loader: () => this.api.torneos(),
    defaultValue: [],
  });

  /**
   * El torneo se saca de la lista y no de un endpoint propio.
   *
   * El club tiene un puñado de torneos, así que pedir la lista entera cuesta lo mismo
   * que pedir uno y ahorra un endpoint que habría que escribir, probar y mantener.
   */
  protected readonly torneo = computed(() =>
    this.torneos.value().find((torneo) => torneo.id === Number(this.id())),
  );

  /**
   * Qué cuadro se está mirando: el del enlace o el primero, hasta que se elija otro.
   *
   * `linkedSignal` y no `signal`: al cambiar de torneo tiene que volver al primero del
   * torneo nuevo. Con una señal suelta se arrastraba el cuadro del anterior, que era
   * el defecto de la pantalla vieja.
   */
  protected readonly elegido = linkedSignal<number | null>(() => {
    const cuadros = this.torneo()?.cuadros ?? [];
    const pedido = cuadros.find((cuadro) => cuadro.id === Number(this.cuadro()));

    // Uno de otro torneo, o un número inventado, se ignora: abre el primero.
    return (pedido ?? cuadros[0])?.id ?? null;
  });

  protected readonly enPalabras = diaEnPalabras;

  /** La lista compartida del catálogo: una copia acá sería la sexta. */
  protected readonly superficies = Object.entries(SUPERFICIES);

  /**
   * El formulario, **relleno con lo que el torneo ya tiene**.
   *
   * `linkedSignal` y no un objeto suelto: los datos llegan cuando responde el servidor,
   * así que el formulario tiene que rellenarse solo al cargar y volver a rellenarse si
   * se guarda o se cambia de torneo. Un formulario vacío obligaría a reescribir las
   * cinco cosas para corregir una. Las fechas, como las entrega el calendario de Material,
   * y a texto recién al guardar (A5, T244).
   */
  protected readonly datos = linkedSignal(() => ({
    nombre: this.torneo()?.nombre ?? '',
    superficie: this.torneo()?.superficie ?? '',
    fechaInicio: textoAFecha(this.torneo()?.fechaInicio),
    fechaFin: textoAFecha(this.torneo()?.fechaFin),
    cierreInscripcion: textoAFecha(this.torneo()?.cierreInscripcion),
  }));

  /**
   * Guarda los datos del torneo.
   *
   * **Las tres fechas viajan siempre juntas**, aunque solo se haya tocado una: es lo
   * que exige el servidor, porque comprobar una contra las guardadas deja llegar a un
   * torneo que termina antes de empezar en dos pasos que por separado se ven bien.
   */
  protected async guardar(id: number): Promise<void> {
    await this.intentar(`guardar-${id}`, async () => {
      const datos = this.datos();
      await this.api.editarTorneo(id, {
        nombre: datos.nombre,
        fechaInicio: fechaATexto(datos.fechaInicio),
        fechaFin: fechaATexto(datos.fechaFin),
        cierreInscripcion: fechaATexto(datos.cierreInscripcion),
        superficie: datos.superficie || null,
      });
      this.snackBar.open('Listo: los datos del torneo quedaron guardados.', undefined, LO_HECHO);
    });
  }

  /** El paso intermedio de cancelar: un clic no basta para esconder un torneo. */
  protected readonly confirmando = signal(false);
  protected readonly trabajando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async cancelar(id: number): Promise<void> {
    await this.intentar(`cancelar-${id}`, () => this.api.cancelarTorneo(id));
  }

  protected async reactivar(id: number): Promise<void> {
    await this.intentar(`reactivar-${id}`, () => this.api.reactivarTorneo(id));
  }

  private async intentar(
    clave: string,
    accion: () => Promise<unknown>,
  ): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
      this.confirmando.set(false);
      this.torneos.reload();
    } catch (falla) {
      // El del servidor: dice si ya se jugó o si no estaba cancelado.
      this.error.set(mensajeDelServidor(falla, 'No se pudo cancelar el torneo.'));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
    }
  }

  protected nombreEstado(estado: EstadoTorneo): string {
    return ESTADOS_TORNEO[estado] ?? estado;
  }
}
