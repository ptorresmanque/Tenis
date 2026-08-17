import { Component, inject, input, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  diaEnPalabras,
  fechaEnElClub,
  hoyEnElClub,
  horaEnElClub,
} from '../reloj-del-club';
import {
  AdminCanchas,
  CanchaAdmin,
  MotivoBloqueo,
} from './admin-canchas.service';

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
  imports: [FormsModule],
  template: `
    @if (bloqueos.isLoading()) {
      <p class="text-sm text-muted-foreground">Cargando bloqueos…</p>
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
              class="cursor-pointer rounded-md px-2 py-0.5 text-xs font-medium
                     text-destructive transition-colors hover:bg-muted"
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
          <input
            type="date"
            [id]="'bd-' + cancha().id"
            [name]="'bloqueo-fecha-desde-' + cancha().id"
            class="rounded-md border border-border bg-card px-2 py-1"
            [(ngModel)]="nueva.fechaDesde"
          />
          <input
            type="time"
            [attr.aria-label]="'Hora de inicio del bloqueo'"
            [name]="'bloqueo-hora-desde-' + cancha().id"
            class="rounded-md border border-border bg-card px-2 py-1"
            [(ngModel)]="nueva.horaDesde"
          />
        </div>
      </div>

      <div>
        <label [for]="'bh-' + cancha().id" class="block font-medium">Hasta</label>
        <div class="mt-1 flex gap-1">
          <input
            type="date"
            [id]="'bh-' + cancha().id"
            [name]="'bloqueo-fecha-hasta-' + cancha().id"
            class="rounded-md border border-border bg-card px-2 py-1"
            [(ngModel)]="nueva.fechaHasta"
          />
          <input
            type="time"
            [attr.aria-label]="'Hora de término del bloqueo'"
            [name]="'bloqueo-hora-hasta-' + cancha().id"
            class="rounded-md border border-border bg-card px-2 py-1"
            [(ngModel)]="nueva.horaHasta"
          />
        </div>
      </div>

      <div>
        <label [for]="'bm-' + cancha().id" class="block font-medium">Motivo</label>
        <select
          [id]="'bm-' + cancha().id"
          [name]="'bloqueo-motivo-' + cancha().id"
          class="mt-1 rounded-md border border-border bg-card px-2 py-1"
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
          class="mt-1 rounded-md border border-border bg-card px-2 py-1"
          [(ngModel)]="nueva.descripcion"
        />
      </div>

      <button
        type="submit"
        [disabled]="guardando()"
        class="cursor-pointer rounded-md border border-primary px-3 py-1 font-medium
               text-primary transition-colors hover:bg-muted disabled:opacity-60"
      >
        Bloquear
      </button>

      <span role="status" aria-live="polite">
        @if (error()) {
          <span class="text-destructive">{{ error() }}</span>
        }
      </span>
    </form>
  `,
})
export class EditorBloqueos {
  private readonly api = inject(AdminCanchas);

  readonly cancha = input.required<CanchaAdmin>();

  protected readonly motivos = MOTIVOS;
  protected readonly nueva: Formulario = enBlanco();
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

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

  protected async crear(): Promise<void> {
    this.error.set(null);
    this.guardando.set(true);

    try {
      await this.api.crearBloqueo({
        canchaId: this.cancha().id,
        ...this.nueva,
        descripcion: this.nueva.descripcion.trim() || null,
      });

      Object.assign(this.nueva, enBlanco());
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El motivo del servidor: "El bloqueo tiene que terminar después de
      // empezar" dice qué corregir.
      const mensaje = (falla as { error?: { message?: unknown } })?.error
        ?.message;

      this.error.set(
        typeof mensaje === 'string' ? mensaje : 'No se pudo crear el bloqueo.',
      );
    } finally {
      this.guardando.set(false);
    }
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
