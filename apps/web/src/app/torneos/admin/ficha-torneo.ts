import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { diaEnPalabras } from '../../catalogo-canchas/reloj-del-club';
import { SUPERFICIES } from '../../catalogo-canchas/superficies';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { CuadroDelTorneo } from './cuadro';
import { CuadrosDelTorneo } from './cuadros-del-torneo';
import { FotosDelTorneo } from './fotos';
import { InscritosDelTorneo } from './inscritos';
import { TransmisionesDelTorneo } from './transmisiones';
import { ESTADOS_TORNEO, EstadoTorneo, Torneos } from '../torneos.service';

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
    FormsModule,
    RouterLink,
    Aviso,
    EstadoVacio,
    Insignia,
    InscritosDelTorneo,
    CuadroDelTorneo,
    CuadrosDelTorneo,
    TransmisionesDelTorneo,
    FotosDelTorneo,
  ],
  template: `
    <a routerLink="/administracion/torneos" class="text-sm font-semibold text-primary">
      <span class="icono align-middle text-base" aria-hidden="true">arrow_back</span>
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
            <app-insignia
              [variante]="suyo.estado === 'INSCRIPCION' ? 'exito' : 'neutro'"
              icono="flag"
            >
              {{ nombreEstado(suyo.estado) }}
            </app-insignia>
          </div>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ enPalabras(suyo.fechaInicio) }} — {{ enPalabras(suyo.fechaFin) }} ·
            inscripción hasta {{ enPalabras(suyo.cierreInscripcion) }}
          </p>
        </div>
      </header>

      <!-- Pestañas y no enlaces: cambian lo que se muestra sin cambiar de página, y
           el lector de pantalla tiene que oír cuál está activa. -->
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
            <span class="icono align-middle text-base" aria-hidden="true">
              {{ pestana.icono }}
            </span>
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
      </div>

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
            <span class="text-sm font-medium">Cuadro:</span>
            @for (cuadro of suyo.cuadros; track cuadro.id) {
              <button
                type="button"
                class="boton boton-chico"
                [class]="
                  elegido() === cuadro.id ? 'boton-primario' : 'boton-secundario'
                "
                [attr.aria-pressed]="elegido() === cuadro.id"
                (click)="elegido.set(cuadro.id)"
              >
                {{ cuadro.categoria }}
              </button>
            }
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
             mirando. Después sus cuadros, y al final lo destructivo. -->
        <form
          class="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm"
          (ngSubmit)="guardar(suyo.id)"
        >
          <h2 class="rotulo-seccion">Datos del torneo</h2>

          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <label class="block sm:col-span-2">
              <span class="text-sm font-medium">Nombre</span>
              <input
                class="campo mt-1"
                name="nombre"
                maxlength="120"
                [(ngModel)]="datos().nombre"
              />
            </label>

            <label class="block">
              <span class="text-sm font-medium">Empieza</span>
              <input
                class="campo mt-1"
                type="date"
                name="fechaInicio"
                [(ngModel)]="datos().fechaInicio"
              />
            </label>

            <label class="block">
              <span class="text-sm font-medium">Termina</span>
              <input
                class="campo mt-1"
                type="date"
                name="fechaFin"
                [(ngModel)]="datos().fechaFin"
              />
            </label>

            <label class="block">
              <span class="text-sm font-medium">Cierra la inscripción</span>
              <input
                class="campo mt-1"
                type="date"
                name="cierreInscripcion"
                [(ngModel)]="datos().cierreInscripcion"
              />
            </label>

            <label class="block">
              <span class="text-sm font-medium">Superficie</span>
              <select
                class="campo mt-1"
                name="superficie"
                [(ngModel)]="datos().superficie"
              >
                <option value="">Sin definir</option>
                @for (superficie of superficies; track superficie[0]) {
                  <option [value]="superficie[0]">{{ superficie[1] }}</option>
                }
              </select>
            </label>
          </div>

          <button
            type="submit"
            class="boton boton-primario mt-3"
            [disabled]="trabajando()"
          >
            Guardar cambios
          </button>

          @if (guardado()) {
            <app-aviso variante="exito" class="mt-3 block">
              Listo: los datos del torneo quedaron guardados.
            </app-aviso>
          }
        </form>

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
              type="button"
              class="boton boton-secundario mt-3"
              [disabled]="trabajando()"
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
                  type="button"
                  class="boton boton-secundario"
                  [disabled]="trabajando()"
                  (click)="cancelar(suyo.id)"
                >
                  Sí, cancelar el torneo
                </button>
                <button
                  type="button"
                  class="boton boton-texto"
                  (click)="confirmando.set(false)"
                >
                  Mejor no
                </button>
              </div>
            } @else {
              <button
                type="button"
                class="boton boton-secundario mt-3"
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
  private readonly api = inject(Torneos);

  /** Llega de la ruta por `withComponentInputBinding`. */
  readonly id = input.required<string>();

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
   * Qué cuadro se está mirando: el primero, hasta que se elija otro.
   *
   * `linkedSignal` y no `signal`: al cambiar de torneo tiene que volver al primero del
   * torneo nuevo. Con una señal suelta se arrastraba el cuadro del anterior, que era
   * el defecto de la pantalla vieja.
   */
  protected readonly elegido = linkedSignal<number | null>(
    () => this.torneo()?.cuadros[0]?.id ?? null,
  );

  protected readonly enPalabras = diaEnPalabras;

  /** La lista compartida del catálogo: una copia acá sería la sexta. */
  protected readonly superficies = Object.entries(SUPERFICIES);

  /**
   * El formulario, **relleno con lo que el torneo ya tiene**.
   *
   * `linkedSignal` y no un objeto suelto: los datos llegan cuando responde el servidor,
   * así que el formulario tiene que rellenarse solo al cargar y volver a rellenarse si
   * se guarda o se cambia de torneo. Un formulario vacío obligaría a reescribir las
   * cinco cosas para corregir una.
   */
  protected readonly datos = linkedSignal(() => ({
    nombre: this.torneo()?.nombre ?? '',
    superficie: this.torneo()?.superficie ?? '',
    fechaInicio: this.torneo()?.fechaInicio ?? '',
    fechaFin: this.torneo()?.fechaFin ?? '',
    cierreInscripcion: this.torneo()?.cierreInscripcion ?? '',
  }));

  protected readonly guardado = signal(false);

  /**
   * Guarda los datos del torneo.
   *
   * **Las tres fechas viajan siempre juntas**, aunque solo se haya tocado una: es lo
   * que exige el servidor, porque comprobar una contra las guardadas deja llegar a un
   * torneo que termina antes de empezar en dos pasos que por separado se ven bien.
   */
  protected async guardar(id: number): Promise<void> {
    this.guardado.set(false);

    await this.intentar(async () => {
      await this.api.editarTorneo(id, {
        ...this.datos(),
        superficie: this.datos().superficie || null,
      });
      this.guardado.set(true);
    });
  }

  /** El paso intermedio de cancelar: un clic no basta para esconder un torneo. */
  protected readonly confirmando = signal(false);
  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async cancelar(id: number): Promise<void> {
    await this.intentar(() => this.api.cancelarTorneo(id));
  }

  protected async reactivar(id: number): Promise<void> {
    await this.intentar(() => this.api.reactivarTorneo(id));
  }

  private async intentar(accion: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);

    try {
      await accion();
      this.confirmando.set(false);
      this.torneos.reload();
    } catch (falla) {
      // El del servidor: dice si ya se jugó o si no estaba cancelado.
      this.error.set(mensajeDelServidor(falla, 'No se pudo cancelar el torneo.'));
    } finally {
      this.trabajando.set(false);
    }
  }

  protected nombreEstado(estado: EstadoTorneo): string {
    return ESTADOS_TORNEO[estado] ?? estado;
  }
}
