import { Component, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { hoyEnElClub, horaEnElClub } from '../reloj-del-club';
import {
  AdminCanchas,
  CanchaAdmin,
  CanchaNueva,
} from './admin-canchas.service';
import { EditorBloqueos } from './editor-bloqueos';
import { EditorFranjas } from './editor-franjas';
import { EditorHorarios } from './editor-horarios';

const DIAS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

const SUPERFICIES = [
  { valor: 'ARCILLA', etiqueta: 'Arcilla' },
  { valor: 'CEMENTO', etiqueta: 'Cemento' },
  { valor: 'PASTO_SINTETICO', etiqueta: 'Pasto sintético' },
] as const;

const CANCHA_EN_BLANCO: CanchaNueva = {
  nombre: '',
  superficie: 'ARCILLA',
  techada: false,
  iluminacion: false,
};

@Component({
  selector: 'app-admin-canchas',
  imports: [FormsModule, EditorHorarios, EditorFranjas, EditorBloqueos],
  template: `
    <h1 class="font-display text-3xl font-bold">Canchas del club</h1>

    @if (advertencias.value().length > 0) {
      <!-- Antes que la lista: es lo único de esta pantalla que cuesta plata si
           nadie lo mira. -->
      <section
        class="mt-4 rounded-xl border border-destructive bg-card p-4"
        aria-labelledby="titulo-advertencias"
      >
        <h2 id="titulo-advertencias" class="font-display font-semibold text-destructive">
          Horas sin tarifa hoy
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Estas horas están abiertas y salen en $0. Casi siempre significa que
          falta una franja, no que el club las regale.
        </p>
        <ul class="mt-2 space-y-1 text-sm">
          @for (aviso of advertencias.value(); track aviso.canchaId) {
            <li>
              <span class="font-medium">{{ aviso.nombre }}</span>:
              {{ horasDe(aviso.sinTarifa) }}
            </li>
          }
        </ul>
      </section>
    }

    <section class="mt-8" aria-labelledby="titulo-nueva">
      <h2 id="titulo-nueva" class="font-display text-xl font-semibold">
        Agregar una cancha
      </h2>

      <form class="mt-3 flex flex-wrap items-end gap-3" (ngSubmit)="crear()">
        <div>
          <label for="nombre" class="block text-sm font-medium">Nombre</label>
          <input
            id="nombre"
            name="nombre"
            required
            class="mt-1 rounded-lg border border-border bg-card px-3 py-2"
            [(ngModel)]="nueva.nombre"
          />
        </div>

        <div>
          <label for="superficie" class="block text-sm font-medium">Superficie</label>
          <select
            id="superficie"
            name="superficie"
            class="mt-1 rounded-lg border border-border bg-card px-3 py-2"
            [(ngModel)]="nueva.superficie"
          >
            @for (opcion of superficies; track opcion.valor) {
              <option [value]="opcion.valor">{{ opcion.etiqueta }}</option>
            }
          </select>
        </div>

        <label class="flex items-center gap-2 py-2 text-sm">
          <input type="checkbox" name="techada" [(ngModel)]="nueva.techada" />
          Techada
        </label>

        <label class="flex items-center gap-2 py-2 text-sm">
          <input
            type="checkbox"
            name="iluminacion"
            [(ngModel)]="nueva.iluminacion"
          />
          Con iluminación
        </label>

        <button
          type="submit"
          [disabled]="guardando()"
          class="cursor-pointer rounded-lg bg-primary px-5 py-2 font-semibold text-on-primary
                 shadow-md transition-[background-color,box-shadow] duration-200
                 hover:bg-secondary hover:shadow-lg disabled:opacity-60"
        >
          Agregar
        </button>
      </form>

      <p role="status" aria-live="polite" class="mt-2 text-sm">
        @if (error()) {
          <span class="text-destructive">{{ error() }}</span>
        } @else if (aviso()) {
          <span class="text-accent-strong">{{ aviso() }}</span>
        }
      </p>
    </section>

    <section class="mt-8" aria-labelledby="titulo-listado">
      <h2 id="titulo-listado" class="font-display text-xl font-semibold">
        Canchas
      </h2>

      @if (canchas.isLoading()) {
        <p class="mt-3 text-muted-foreground">Cargando…</p>
      } @else {
        <ul class="mt-3 space-y-3">
          @for (cancha of canchas.value(); track cancha.id) {
            <li
              class="rounded-xl border border-border bg-card p-4 shadow-sm"
              [class.opacity-60]="!cancha.activa"
            >
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 class="font-display text-lg font-semibold">
                  {{ cancha.nombre }}
                </h3>
                @if (!cancha.activa) {
                  <!-- Con palabras y no solo con la opacidad: apagado es una
                       diferencia de color y no todos la ven. -->
                  <span
                    class="rounded-md border border-muted-foreground px-2 py-0.5 text-xs
                           font-medium text-muted-foreground"
                  >
                    Desactivada
                  </span>
                }

                <button
                  type="button"
                  class="ms-auto cursor-pointer rounded-md border border-primary px-3 py-1
                         text-sm font-medium text-primary transition-colors hover:bg-muted"
                  (click)="alternarActiva(cancha)"
                >
                  {{ cancha.activa ? 'Desactivar' : 'Reactivar' }}
                </button>
              </div>

              <p class="mt-1 text-sm text-muted-foreground">
                {{ nombreSuperficie(cancha.superficie) }}
                @if (cancha.techada) {
                  · Techada
                }
                @if (cancha.iluminacion) {
                  · Con iluminación
                }
              </p>

              <h4 class="mt-3 text-sm font-semibold">Horario de apertura</h4>
              @if (cancha.horarios.length === 0) {
                <p class="text-sm text-muted-foreground">
                  Sin horario propio: vale el general del club.
                </p>
              }
              <app-editor-horarios
                [cancha]="cancha"
                (guardado)="recargar()"
              />

              <h4 class="mt-3 text-sm font-semibold">Tarifas propias</h4>
              <app-editor-franjas [cancha]="cancha" (cambiado)="recargar()" />

              <h4 class="mt-3 text-sm font-semibold">Bloqueos</h4>
              <app-editor-bloqueos [cancha]="cancha" />
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class AdminCanchasPanel {
  private readonly api = inject(AdminCanchas);

  protected readonly superficies = SUPERFICIES;
  protected readonly nueva: CanchaNueva = { ...CANCHA_EN_BLANCO };

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  /** Se recarga al cambiar, que es lo que refresca la lista tras cada acción. */
  private readonly version = signal(0);

  protected readonly canchas = resource({
    params: () => ({ version: this.version() }),
    loader: () => this.api.canchas(),
    defaultValue: [],
  });

  protected readonly advertencias = resource({
    params: () => ({ version: this.version() }),
    loader: () => this.api.advertencias(hoyEnElClub()),
    defaultValue: [],
  });

  protected async crear(): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);

    if (!this.nueva.nombre.trim()) {
      this.error.set('Ponle un nombre a la cancha.');
      return;
    }

    this.guardando.set(true);
    try {
      const creada = await this.api.crear({ ...this.nueva });
      this.aviso.set(`${creada.nombre} ya está en la grilla.`);
      Object.assign(this.nueva, CANCHA_EN_BLANCO);
      this.recargar();
    } catch (falla) {
      this.error.set(this.mensajeDe(falla));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async alternarActiva(cancha: CanchaAdmin): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);

    try {
      await this.api.editar(cancha.id, { activa: !cancha.activa });
      this.aviso.set(
        cancha.activa
          ? `${cancha.nombre} salió de la grilla pública. Sus reservas siguen ahí.`
          : `${cancha.nombre} volvió a la grilla.`,
      );
      this.recargar();
    } catch (falla) {
      this.error.set(this.mensajeDe(falla));
    }
  }

  /** Relee canchas y advertencias: una tarifa nueva puede apagar una advertencia. */
  protected recargar(): void {
    this.version.update((v) => v + 1);
  }

  /**
   * El mensaje del servidor y no uno genérico: "Ya hay una cancha con ese nombre"
   * dice qué arreglar, y "algo salió mal" obliga a adivinar.
   */
  private mensajeDe(falla: unknown): string {
    const cuerpo = (falla as { error?: { message?: unknown } } | null)?.error;
    const mensaje = cuerpo?.message;

    if (typeof mensaje === 'string') {
      return mensaje;
    }
    if (Array.isArray(mensaje) && typeof mensaje[0] === 'string') {
      return mensaje[0];
    }

    return 'No se pudo guardar. Reintenta en un momento.';
  }

  protected nombreDia(dia: number): string {
    return DIAS[dia] ?? `Día ${dia}`;
  }

  protected nombreSuperficie(superficie: string): string {
    return (
      SUPERFICIES.find((s) => s.valor === superficie)?.etiqueta ?? superficie
    );
  }

  /** Las horas de una advertencia, en la hora del club y separadas por comas. */
  protected horasDe(instantes: string[]): string {
    return instantes.map((instante) => horaEnElClub(instante)).join(', ');
  }
}
