import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Insignia } from '../../ui/insignia';
import { enPesos, hoyEnElClub } from '../reloj-del-club';
import { AdminCanchas, AmbitoDeReglas } from './admin-canchas.service';

interface FranjaNueva {
  horaDesde: string;
  horaHasta: string;
  esPico: boolean;
  montoClp: number;
  /** Vacío es nulo: la hora y media no se vende en esta franja (T79). */
  montoClp90: number | null;
}

const EN_BLANCO: FranjaNueva = {
  horaDesde: '08:00',
  horaHasta: '18:00',
  esPico: false,
  montoClp: 12000,
  // Vacío a propósito: un precio sugerido se aceptaría sin mirarlo, y es plata.
  montoClp90: null,
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
  imports: [FormsModule, Insignia],
  template: `
    @if (ambito().franjas.length > 0) {
      <ul class="text-sm text-muted-foreground">
        @for (franja of ambito().franjas; track franja.id) {
          <li class="flex flex-wrap items-center gap-2 py-0.5">
            <span>
              {{ franja.horaDesde }}–{{ franja.horaHasta }}: 1 hora
              {{ pesos(franja.montoClp) }}
              @if (franja.montoClp90 !== null) {
                · 1 hora y media {{ pesos(franja.montoClp90) }}
              }
              @if (franja.esPico) {
                · hora pico
              }
            </span>
            @if (franja.montoClp90 === null) {
              <!-- Sin ese precio, quien no es socio no puede reservar 1 hora y media en
                   esta franja (T79). Es una omisión casi siempre, no una decisión. -->
              <app-insignia variante="aviso" icono="warning">
                Falta el precio de 1 hora y media
              </app-insignia>
            }
            <button
              type="button"
              class="boton boton-texto boton-chico text-destructive"
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
    } @else if (ambito().id === null) {
      <!-- El club no puede "caer en las generales": estas son las generales. Con el
           texto de una cancha, esta pantalla se diría a sí misma que mire otra. -->
      <p class="text-sm text-muted-foreground">
        El club no tiene tarifas generales. Toda hora que ninguna cancha cubra con
        una tarifa propia sale en $0.
      </p>
    } @else {
      <p class="text-sm text-muted-foreground">
        Sin tarifas propias: valen las generales del club.
      </p>
    }

    <form class="mt-2 flex flex-wrap items-end gap-2 text-sm" (ngSubmit)="agregar()">
      <div>
        <label [for]="'desde-' + clave()" class="block font-medium">Desde</label>
        <input
          type="time"
          [id]="'desde-' + clave()"
          [name]="'franja-desde-' + clave()"
          class="campo campo-chico mt-1"
          [(ngModel)]="nueva.horaDesde"
        />
      </div>

      <div>
        <label [for]="'hasta-' + clave()" class="block font-medium">Hasta</label>
        <input
          type="time"
          [id]="'hasta-' + clave()"
          [name]="'franja-hasta-' + clave()"
          class="campo campo-chico mt-1"
          [(ngModel)]="nueva.horaHasta"
        />
      </div>

      <div>
        <label [for]="'monto-' + clave()" class="block font-medium">Precio 1 hora</label>
        <input
          type="number"
          min="0"
          step="500"
          [id]="'monto-' + clave()"
          [name]="'franja-monto-' + clave()"
          class="campo campo-chico mt-1 w-28"
          [(ngModel)]="nueva.montoClp"
        />
      </div>

      <div>
        <label [for]="'monto90-' + clave()" class="block font-medium">
          Precio 1 hora y media
        </label>
        <input
          type="number"
          min="1"
          step="500"
          placeholder="No se vende"
          [id]="'monto90-' + clave()"
          [name]="'franja-monto90-' + clave()"
          class="campo campo-chico mt-1 w-28"
          [(ngModel)]="nueva.montoClp90"
        />
      </div>

      <label class="flex items-center gap-2 py-1">
        <input
          type="checkbox"
          [name]="'franja-pico-' + clave()"
          [(ngModel)]="nueva.esPico"
        />
        Hora pico
      </label>

      <button
        type="submit"
        [disabled]="guardando()"
        class="boton boton-secundario boton-chico"
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

  readonly ambito = input.required<AmbitoDeReglas>();
  readonly cambiado = output<void>();

  /** Ver `EditorHorarios`: el club no tiene número y sus campos necesitan nombre. */
  protected readonly clave = computed(() => this.ambito().id ?? 'club');

  protected readonly nueva: FranjaNueva = { ...EN_BLANCO };
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly pesos = enPesos;

  protected async agregar(): Promise<void> {
    this.error.set(null);

    if (this.nueva.montoClp90 !== null && this.nueva.montoClp90 <= 0) {
      // Para quien no es socio, cero y vacío dicen lo mismo: la reserva rechaza toda
      // tarifa de $0 con SIN_TARIFA. Dos formas de decir "no se vende" son una de más,
      // y la que queda es la que se ve en la lista: el campo vacío.
      this.error.set(
        'El precio de 1 hora y media tiene que ser mayor que cero. Para no venderla, deja el precio vacío.',
      );
      return;
    }

    this.guardando.set(true);

    try {
      await this.api.crearFranja({
        canchaId: this.ambito().id,
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
