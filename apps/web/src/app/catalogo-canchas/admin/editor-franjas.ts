import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { enPesos, hoyEnElClub } from '../reloj-del-club';
import { AdminCanchas, CanchaAdmin } from './admin-canchas.service';

interface FranjaNueva {
  horaDesde: string;
  horaHasta: string;
  esPico: boolean;
  montoClp: number;
}

const EN_BLANCO: FranjaNueva = {
  horaDesde: '08:00',
  horaHasta: '18:00',
  esPico: false,
  montoClp: 12000,
};

/**
 * Las tarifas propias de una cancha.
 *
 * `esPico` va junto al monto porque son la misma ventana de tiempo: el precio del
 * no-socio y el cupo del socio. Separarlos en dos formularios obligaría a definir
 * el mismo rango dos veces y el primer desajuste cobra valle una hora que descuenta
 * cupo pico.
 */
@Component({
  selector: 'app-editor-franjas',
  imports: [FormsModule],
  template: `
    @if (cancha().franjas.length > 0) {
      <ul class="text-sm text-muted-foreground">
        @for (franja of cancha().franjas; track franja.id) {
          <li class="flex flex-wrap items-center gap-2 py-0.5">
            <span>
              {{ franja.horaDesde }}–{{ franja.horaHasta }}:
              {{ pesos(franja.montoClp) }}
              @if (franja.esPico) {
                · hora pico
              }
            </span>
            <button
              type="button"
              class="cursor-pointer rounded-md px-2 py-0.5 text-xs font-medium
                     text-destructive transition-colors hover:bg-muted"
              (click)="borrar(franja.id)"
            >
              Quitar
              <span class="sr-only">
                la tarifa de {{ franja.horaDesde }} a {{ franja.horaHasta }}
              </span>
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="text-sm text-muted-foreground">
        Sin tarifas propias: valen las generales del club.
      </p>
    }

    <form class="mt-2 flex flex-wrap items-end gap-2 text-sm" (ngSubmit)="agregar()">
      <div>
        <label [for]="'desde-' + cancha().id" class="block font-medium">Desde</label>
        <input
          type="time"
          [id]="'desde-' + cancha().id"
          [name]="'franja-desde-' + cancha().id"
          class="mt-1 rounded-md border border-border bg-card px-2 py-1"
          [(ngModel)]="nueva.horaDesde"
        />
      </div>

      <div>
        <label [for]="'hasta-' + cancha().id" class="block font-medium">Hasta</label>
        <input
          type="time"
          [id]="'hasta-' + cancha().id"
          [name]="'franja-hasta-' + cancha().id"
          class="mt-1 rounded-md border border-border bg-card px-2 py-1"
          [(ngModel)]="nueva.horaHasta"
        />
      </div>

      <div>
        <label [for]="'monto-' + cancha().id" class="block font-medium">Precio</label>
        <input
          type="number"
          min="0"
          step="500"
          [id]="'monto-' + cancha().id"
          [name]="'franja-monto-' + cancha().id"
          class="mt-1 w-28 rounded-md border border-border bg-card px-2 py-1"
          [(ngModel)]="nueva.montoClp"
        />
      </div>

      <label class="flex items-center gap-2 py-1">
        <input
          type="checkbox"
          [name]="'franja-pico-' + cancha().id"
          [(ngModel)]="nueva.esPico"
        />
        Hora pico
      </label>

      <button
        type="submit"
        [disabled]="guardando()"
        class="cursor-pointer rounded-md border border-primary px-3 py-1 font-medium
               text-primary transition-colors hover:bg-muted disabled:opacity-60"
      >
        Agregar tarifa
      </button>

      <span role="status" aria-live="polite">
        @if (error()) {
          <span class="text-destructive">{{ error() }}</span>
        }
      </span>
    </form>
  `,
})
export class EditorFranjas {
  private readonly api = inject(AdminCanchas);

  readonly cancha = input.required<CanchaAdmin>();
  readonly cambiado = output<void>();

  protected readonly nueva: FranjaNueva = { ...EN_BLANCO };
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly pesos = enPesos;

  protected async agregar(): Promise<void> {
    this.error.set(null);
    this.guardando.set(true);

    try {
      await this.api.crearFranja({
        canchaId: this.cancha().id,
        // Todos los días: una tarifa distinta por día es rara y complica el
        // formulario para el caso que casi nunca se usa.
        diaSemana: null,
        ...this.nueva,
        // Rige desde hoy: cambiar el precio de una franja no puede alterar lo que
        // ya se cobró, así que se crea una nueva en vez de editar la anterior.
        vigenteDesde: hoyEnElClub(),
      });

      Object.assign(this.nueva, EN_BLANCO);
      this.cambiado.emit();
    } catch (falla) {
      const mensaje = (falla as { error?: { message?: unknown } })?.error
        ?.message;

      this.error.set(
        typeof mensaje === 'string' ? mensaje : 'No se pudo agregar la tarifa.',
      );
    } finally {
      this.guardando.set(false);
    }
  }

  protected async borrar(id: number): Promise<void> {
    this.error.set(null);

    try {
      await this.api.borrarFranja(id);
      this.cambiado.emit();
    } catch {
      this.error.set('No se pudo quitar la tarifa.');
    }
  }
}
