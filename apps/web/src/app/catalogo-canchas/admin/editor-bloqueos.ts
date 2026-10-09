import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  diaEnPalabras,
  fechaEnElClub,
  hoyEnElClub,
  horaEnElClub,
} from '../reloj-del-club';
import {
  AdminCanchas,
  BloqueoNuevo,
  CanchaAdmin,
  HoraAfectada,
  MotivoBloqueo,
} from './admin-canchas.service';
import { CampoFecha } from '../../ui/campo-fecha';
import { CampoHora } from '../../ui/campo-hora';

const MOTIVOS: { valor: MotivoBloqueo; etiqueta: string }[] = [
  { valor: 'MANTENCION', etiqueta: 'Mantención' },
  { valor: 'TORNEO', etiqueta: 'Torneo' },
  { valor: 'CLASE', etiqueta: 'Clase' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

interface Formulario {
  fechaDesde: string;
  horaDesde: string;
  fechaHasta: string;
  horaHasta: string;
  motivo: MotivoBloqueo;
  descripcion: string;
}

function enBlanco(): Formulario {
  const hoy = hoyEnElClub();

  return {
    fechaDesde: hoy,
    horaDesde: '10:00',
    fechaHasta: hoy,
    horaHasta: '12:00',
    motivo: 'MANTENCION',
    descripcion: '',
  };
}

/**
 * Los bloqueos de una cancha: cerrarla por mantención, torneo o clase.
 *
 * El rango se escribe en hora del club y viaja así. La conversión a instantes la
 * hace el servidor, donde está probada contra los dos domingos en que Chile
 * cambia la hora; hacerla acá sería tener dos versiones del mismo cálculo.
 */
@Component({
  selector: 'app-editor-bloqueos',
  imports: [FormsModule, CampoFecha, CampoHora],
  template: `
    @if (bloqueos.isLoading()) {
      <p class="text-sm text-muted-foreground">Cargando bloqueos…</p>
    } @else if (bloqueos.error()) {
      <p class="text-sm text-destructive">
        No se pudieron cargar los bloqueos. Reintenta en un momento.
      </p>
    } @else if (bloqueos.value().length === 0) {
      <!-- "Próximos" y no "bloqueos": los que ya terminaron no se listan, y decir
           "sin bloqueos" haría dudar de si el de la semana pasada se guardó. -->
      <p class="text-sm text-muted-foreground">Sin bloqueos próximos.</p>
    } @else {
      <ul class="text-sm text-muted-foreground">
        @for (bloqueo of bloqueos.value(); track bloqueo.id) {
          <li class="flex flex-wrap items-center gap-2 py-0.5">
            <span>
              {{ cuando(bloqueo.inicio) }} {{ hora(bloqueo.inicio) }} –
              {{ cuando(bloqueo.fin) }} {{ hora(bloqueo.fin) }}:
              {{ nombreMotivo(bloqueo.motivo) }}
              @if (bloqueo.descripcion) {
                ({{ bloqueo.descripcion }})
              }
            </span>
            <button
              type="button"
              class="boton boton-texto boton-chico text-destructive"
              (click)="borrar(bloqueo.id)"
            >
              Quitar
              <span class="sr-only">
                el bloqueo del {{ cuando(bloqueo.inicio) }}
              </span>
            </button>
          </li>
        }
      </ul>
    }

    <form class="mt-2 flex flex-wrap items-end gap-2 text-sm" (ngSubmit)="crear()">
      <div>
        <label [for]="'bd-' + cancha().id" class="block font-medium">Desde</label>
        <div class="mt-1 flex gap-1">
          <app-campo-fecha
            [inputId]="'bd-' + cancha().id"
            [name]="'bloqueo-fecha-desde-' + cancha().id"
            claseCampo="campo-chico w-32"
            [(ngModel)]="nueva.fechaDesde"
          />
          <app-campo-hora
            [inputId]="'bdh-' + cancha().id"
            etiquetaAccesible="Hora de inicio del bloqueo"
            [name]="'bloqueo-hora-desde-' + cancha().id"
            claseCampo="campo-chico w-24"
            [(ngModel)]="nueva.horaDesde"
          />
        </div>
      </div>

      <div>
        <label [for]="'bh-' + cancha().id" class="block font-medium">Hasta</label>
        <div class="mt-1 flex gap-1">
          <app-campo-fecha
            [inputId]="'bh-' + cancha().id"
            [name]="'bloqueo-fecha-hasta-' + cancha().id"
            claseCampo="campo-chico w-32"
            [(ngModel)]="nueva.fechaHasta"
          />
          <app-campo-hora
            [inputId]="'bhh-' + cancha().id"
            etiquetaAccesible="Hora de término del bloqueo"
            [name]="'bloqueo-hora-hasta-' + cancha().id"
            claseCampo="campo-chico w-24"
            [(ngModel)]="nueva.horaHasta"
          />
        </div>
      </div>

      <div>
        <label [for]="'bm-' + cancha().id" class="block font-medium">Motivo</label>
        <select
          [id]="'bm-' + cancha().id"
          [name]="'bloqueo-motivo-' + cancha().id"
          class="campo campo-chico mt-1"
          [(ngModel)]="nueva.motivo"
        >
          @for (motivo of motivos; track motivo.valor) {
            <option [value]="motivo.valor">{{ motivo.etiqueta }}</option>
          }
        </select>
      </div>

      <div>
        <label [for]="'bx-' + cancha().id" class="block font-medium">
          Detalle <span class="text-muted-foreground">(opcional)</span>
        </label>
        <input
          [id]="'bx-' + cancha().id"
          [name]="'bloqueo-detalle-' + cancha().id"
          class="campo campo-chico mt-1"
          [(ngModel)]="nueva.descripcion"
        />
      </div>

      <button
        type="submit"
        [disabled]="guardando()"
        class="boton boton-secundario boton-chico"
      >
        Bloquear
      </button>

      <span role="status" aria-live="polite">
        @if (error()) {
          <span class="text-destructive">{{ error() }}</span>
        }
        @if (aviso()) {
          <span class="text-accent-strong">{{ aviso() }}</span>
        }
      </span>
    </form>

    <!-- El segundo paso, y solo cuando hay algo que perder: bloquear una hora libre
         no pregunta nada. Lo que se confirma no es "¿seguro?", es esta lista. -->
    @if (porConfirmar(); as afectadas) {
      <div
        role="alertdialog"
        aria-labelledby="titulo-cierre"
        class="mt-3 rounded-xl border border-destructive bg-card p-4 text-sm"
      >
        <h4 id="titulo-cierre" class="font-display font-semibold text-destructive">
          Hay {{ afectadas.length }}
          {{ afectadas.length === 1 ? 'hora tomada' : 'horas tomadas' }} en ese rango
        </h4>
        <p class="mt-1 text-muted-foreground">
          Si cierras, se cancelan y avisamos por correo. A quien pagó se le devuelve
          todo. <strong>Quitar el bloqueo después no las devuelve.</strong>
        </p>

        <ul class="mt-2 grid gap-1">
          @for (tomada of afectadas; track tomada.id) {
            <li>
              <span class="font-medium">{{ cuando(tomada.inicio) }}</span>,
              {{ hora(tomada.inicio) }}–{{ hora(tomada.fin) }} ·
              {{ tomada.nombre }}
              @if (tomada.pagoEnCurso) {
                <!-- El servidor rechaza el cierre mientras esté así, y con razón:
                     cancelarla dejaría a esa persona sin cancha y sin su plata. -->
                <span class="text-destructive">
                  (pagándose ahora, no se puede cerrar todavía)
                </span>
              } @else if (tomada.pagada) {
                <span class="text-destructive">(pagada, se devuelve)</span>
              } @else if (tomada.esSocio) {
                <span class="text-muted-foreground">(socio, recupera su cupo)</span>
              }
            </li>
          }
        </ul>

        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="boton boton-destructivo boton-chico"
            [disabled]="guardando() || hayPagoEnCurso()"
            (click)="confirmar()"
          >
            Cerrar igual y avisarles
          </button>
          <button
            type="button"
            class="boton boton-texto boton-chico"
            (click)="porConfirmar.set(null)"
          >
            Mejor no
          </button>
        </div>
      </div>
    }
  `,
})
export class EditorBloqueos {
  private readonly api = inject(AdminCanchas);

  readonly cancha = input.required<CanchaAdmin>();

  protected readonly motivos = MOTIVOS;
  protected readonly nueva: Formulario = enBlanco();
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  /** Las horas que el cierre se llevaría, mientras el admin decide. */
  protected readonly porConfirmar = signal<HoraAfectada[] | null>(null);

  /**
   * Con alguien a mitad de pagar el servidor rechaza el cierre, así que el botón se
   * apaga en vez de ofrecer algo que va a fallar. La regla real vive allá.
   */
  protected readonly hayPagoEnCurso = computed(() =>
    (this.porConfirmar() ?? []).some((hora) => hora.pagoEnCurso),
  );

  private readonly version = signal(0);

  protected readonly bloqueos = resource({
    params: () => ({ cancha: this.cancha().id, version: this.version() }),
    loader: ({ params }) => this.api.bloqueos(params.cancha),
    defaultValue: [],
  });

  protected readonly hora = horaEnElClub;

  /**
   * "lunes, 17 de agosto" del instante, en el día del club.
   *
   * Con `fechaEnElClub` y no cortando el ISO: un bloqueo que empieza a las 22:00
   * de un lunes en Santiago llega como `2026-08-18T02:00:00Z` y el corte diría
   * martes, un día después del que el admin escribió.
   */
  protected cuando(instante: string): string {
    return diaEnPalabras(fechaEnElClub(instante));
  }

  protected nombreMotivo(motivo: MotivoBloqueo): string {
    return MOTIVOS.find((m) => m.valor === motivo)?.etiqueta ?? motivo;
  }

  /**
   * Primer paso: preguntar a quién afecta.
   *
   * **Nunca cierra directo, ni siquiera cuando no hay nadie debajo.** El servidor es
   * el que sabe qué horas hay tomadas —esta pantalla no tiene la agenda— y hacer que
   * el camino con reservas sea distinto del sin reservas obligaría a decidirlo acá.
   */
  protected async crear(): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.guardando.set(true);

    try {
      const { afectadas } = await this.api.simularCierre(this.formulario());

      // Sin nadie debajo, cerrar es lo que era antes: no hay nada que confirmar y
      // preguntar por preguntar entrena a la gente a apretar sin leer.
      if (afectadas.length === 0) {
        await this.cerrar();
        return;
      }

      this.porConfirmar.set(afectadas);
    } catch (falla) {
      this.mostrar(falla, 'No se pudo crear el bloqueo.');
    } finally {
      this.guardando.set(false);
    }
  }

  /** Segundo paso: el admin ya vio a quién deja sin hora. */
  protected async confirmar(): Promise<void> {
    this.guardando.set(true);

    try {
      await this.cerrar();
    } catch (falla) {
      this.mostrar(falla, 'No se pudo cerrar la cancha.');
    } finally {
      this.guardando.set(false);
    }
  }

  private async cerrar(): Promise<void> {
    const { canceladas } = await this.api.cerrar(this.formulario());

    this.porConfirmar.set(null);
    Object.assign(this.nueva, enBlanco());
    this.version.update((v) => v + 1);

    if (canceladas.length > 0) {
      this.aviso.set(
        canceladas.length === 1
          ? 'Cancha cerrada. Avisamos a la persona que tenía esa hora.'
          : `Cancha cerrada. Avisamos a las ${canceladas.length} personas afectadas.`,
      );
    }
  }

  private formulario(): BloqueoNuevo {
    return {
      canchaId: this.cancha().id,
      ...this.nueva,
      descripcion: this.nueva.descripcion.trim() || null,
    };
  }

  private mostrar(falla: unknown, porDefecto: string): void {
    // El motivo del servidor: "El bloqueo tiene que terminar después de empezar"
    // dice qué corregir.
    const mensaje = (falla as { error?: { message?: unknown } })?.error?.message;

    this.error.set(typeof mensaje === 'string' ? mensaje : porDefecto);
  }

  protected async borrar(id: number): Promise<void> {
    this.error.set(null);

    try {
      await this.api.borrarBloqueo(id);
      this.version.update((v) => v + 1);
    } catch {
      this.error.set('No se pudo quitar el bloqueo.');
    }
  }
}
