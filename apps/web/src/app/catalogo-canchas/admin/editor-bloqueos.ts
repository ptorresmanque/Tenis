import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatSelectModule } from '@angular/material/select';

import { proveerCampos } from '../../ui/campos';
import {
  fechaATexto,
  horaATexto,
  proveerFechaYHora,
  textoAFecha,
  textoAHora,
} from '../../ui/fecha-y-hora';
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
import { Esqueleto } from '../../ui/esqueleto';
import { LO_HECHO } from '../../ui/material';

const MOTIVOS: { valor: MotivoBloqueo; etiqueta: string }[] = [
  { valor: 'MANTENCION', etiqueta: 'Mantención' },
  { valor: 'TORNEO', etiqueta: 'Torneo' },
  { valor: 'CLASE', etiqueta: 'Clase' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

/** El bloqueo mientras se escribe: las fechas y las horas como las entrega Material (A5, T244). */
interface Formulario {
  fechaDesde: Date | null;
  horaDesde: Date | null;
  fechaHasta: Date | null;
  horaHasta: Date | null;
  motivo: MotivoBloqueo;
  descripcion: string;
}

function enBlanco(): Formulario {
  const hoy = hoyEnElClub();

  return {
    fechaDesde: textoAFecha(hoy),
    horaDesde: textoAHora('10:00'),
    fechaHasta: textoAFecha(hoy),
    horaHasta: textoAHora('12:00'),
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
  imports: [
    MatSelectModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInput,
    MatTimepickerModule,
    MatButton,
    FormsModule,
    Esqueleto,
  ],
  providers: [proveerCampos(), proveerFechaYHora()],
  template: `
    @if (bloqueos.isLoading()) {
      <app-esqueleto compacto etiqueta="Cargando los bloqueos…" />
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
              matButton
              type="button"
              class="peligro chico"
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
      <div class="flex gap-1">
        <mat-form-field class="chico w-40">
          <mat-label>Desde</mat-label>
          <input
            matInput
            [id]="'bd-' + cancha().id"
            [name]="'bloqueo-fecha-desde-' + cancha().id"
            placeholder="dd-mm-aaaa"
            autocomplete="off"
            [matDatepicker]="calendarioBloqueoFechaDesde"
            [(ngModel)]="nueva.fechaDesde"
          />
          <mat-datepicker-toggle matIconSuffix [for]="calendarioBloqueoFechaDesde" />
          <mat-datepicker #calendarioBloqueoFechaDesde>
            <mat-datepicker-actions>
              <button matButton type="button" matDatepickerCancel>Cancelar</button>
              <button matButton type="button" matDatepickerApply>Aplicar</button>
            </mat-datepicker-actions>
          </mat-datepicker>
          <mat-hint>dd-mm-aaaa</mat-hint>
        </mat-form-field>
        <mat-form-field class="chico w-32">
          <input
            matInput
            [id]="'bdh-' + cancha().id"
            [name]="'bloqueo-hora-desde-' + cancha().id"
            placeholder="hh:mm"
            autocomplete="off"
            [matTimepicker]="relojBloqueoHoraDesde"
            aria-label="Hora de inicio del bloqueo"
            [(ngModel)]="nueva.horaDesde"
          />
          <mat-timepicker-toggle
            matIconSuffix
            aria-label="Elegir la hora"
            [for]="relojBloqueoHoraDesde"
          />
          <mat-timepicker #relojBloqueoHoraDesde />
        </mat-form-field>
      </div>

      <div class="flex gap-1">
        <mat-form-field class="chico w-40">
          <mat-label>Hasta</mat-label>
          <input
            matInput
            [id]="'bh-' + cancha().id"
            [name]="'bloqueo-fecha-hasta-' + cancha().id"
            placeholder="dd-mm-aaaa"
            autocomplete="off"
            [matDatepicker]="calendarioBloqueoFechaHasta"
            [(ngModel)]="nueva.fechaHasta"
          />
          <mat-datepicker-toggle matIconSuffix [for]="calendarioBloqueoFechaHasta" />
          <mat-datepicker #calendarioBloqueoFechaHasta>
            <mat-datepicker-actions>
              <button matButton type="button" matDatepickerCancel>Cancelar</button>
              <button matButton type="button" matDatepickerApply>Aplicar</button>
            </mat-datepicker-actions>
          </mat-datepicker>
          <mat-hint>dd-mm-aaaa</mat-hint>
        </mat-form-field>
        <mat-form-field class="chico w-32">
          <input
            matInput
            [id]="'bhh-' + cancha().id"
            [name]="'bloqueo-hora-hasta-' + cancha().id"
            placeholder="hh:mm"
            autocomplete="off"
            [matTimepicker]="relojBloqueoHoraHasta"
            aria-label="Hora de término del bloqueo"
            [(ngModel)]="nueva.horaHasta"
          />
          <mat-timepicker-toggle
            matIconSuffix
            aria-label="Elegir la hora"
            [for]="relojBloqueoHoraHasta"
          />
          <mat-timepicker #relojBloqueoHoraHasta />
        </mat-form-field>
      </div>

      <mat-form-field class="chico">
        <mat-label>Motivo</mat-label>
        <mat-select
          [id]="'bm-' + cancha().id"
          [name]="'bloqueo-motivo-' + cancha().id"
          [attr.name]="'bloqueo-motivo-' + cancha().id"
          [(ngModel)]="nueva.motivo"
        >
          @for (motivo of motivos; track motivo.valor) {
            <mat-option [value]="motivo.valor">{{ motivo.etiqueta }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field class="chico">
        <mat-label>Detalle <span class="text-muted-foreground">(opcional)</span></mat-label>
        <input
          matInput
          [id]="'bx-' + cancha().id"
          [name]="'bloqueo-detalle-' + cancha().id"
          [(ngModel)]="nueva.descripcion"
        />
      </mat-form-field>

      <button
        matButton="outlined"
        type="submit"
        [disabled]="guardando()"
        [attr.aria-busy]="guardando()"
        class="chico"
      >
        Bloquear
      </button>

      <span role="status" aria-live="polite">
        @if (error()) {
          <span class="text-destructive">{{ error() }}</span>
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
            matButton="filled"
            type="button"
            class="peligro chico"
            [disabled]="guardando() || hayPagoEnCurso()"
            [attr.aria-busy]="guardando()"
            (click)="confirmar()"
          >
            Cerrar igual y avisarles
          </button>
          <button
            matButton
            type="button"
            class="chico"
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
  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(AdminCanchas);

  readonly cancha = input.required<CanchaAdmin>();

  protected readonly motivos = MOTIVOS;
  protected readonly nueva: Formulario = enBlanco();
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

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
      this.snackBar.open(
        canceladas.length === 1
          ? 'Cancha cerrada. Avisamos a la persona que tenía esa hora.'
          : `Cancha cerrada. Avisamos a las ${canceladas.length} personas afectadas.`,
        undefined,
        LO_HECHO,
      );
    }
  }

  private formulario(): BloqueoNuevo {
    return {
      canchaId: this.cancha().id,
      fechaDesde: fechaATexto(this.nueva.fechaDesde),
      horaDesde: horaATexto(this.nueva.horaDesde),
      fechaHasta: fechaATexto(this.nueva.fechaHasta),
      horaHasta: horaATexto(this.nueva.horaHasta),
      motivo: this.nueva.motivo,
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
