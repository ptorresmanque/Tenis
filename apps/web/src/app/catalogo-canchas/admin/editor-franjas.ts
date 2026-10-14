import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';

import { proveerCampos } from '../../ui/campos';
import { horaATexto, proveerFechaYHora, textoAHora } from '../../ui/fecha-y-hora';
import { Insignia } from '../../ui/insignia';
import { enPesos, hoyEnElClub } from '../reloj-del-club';
import { AdminCanchas, AmbitoDeReglas } from './admin-canchas.service';

interface FranjaNueva {
  /** Solo en las generales del club (T99): nulo = todas las canchas. */
  techada: boolean | null;
  /** Como las entrega el selector de Material, y a texto al crear la franja (A5, T244). */
  horaDesde: Date | null;
  horaHasta: Date | null;
  esPico: boolean;
  montoClp: number;
  /** Vacío es nulo: la hora y media no se vende en esta franja (T79). */
  montoClp90: number | null;
}

const EN_BLANCO: FranjaNueva = {
  techada: null,
  horaDesde: textoAHora('08:00'),
  horaHasta: textoAHora('18:00'),
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
 * el mismo rango dos veces y el primer desajuste cobra como normal una hora que descuenta
 * cupo prime.
 */
@Component({
  selector: 'app-editor-franjas',
  imports: [MatFormFieldModule, MatInput, MatTimepickerModule, MatButton, FormsModule, Insignia],
  providers: [proveerCampos(), proveerFechaYHora()],
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
                · hora prime
              }
              @if (franja.techada === true) {
                · solo techadas
              } @else if (franja.techada === false) {
                · solo al aire libre
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
              matButton
              type="button"
              class="peligro chico"
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
      @if (ambito().id === null) {
        <!-- T99. Solo en las generales: una cancha ya sabe si es techada (T98). -->
        <mat-form-field class="chico">
          <mat-label>Aplica a</mat-label>
          <select
            matNativeControl
            [id]="'aplica-' + clave()"
            [name]="'franja-aplica-' + clave()"
            [(ngModel)]="nueva.techada"
          >
            <option [ngValue]="null">Todas las canchas</option>
            <option [ngValue]="true">Solo techadas</option>
            <option [ngValue]="false">Solo al aire libre</option>
          </select>
        </mat-form-field>
      }

      <mat-form-field class="chico w-32">
        <mat-label>Desde</mat-label>
        <input
          matInput
          [id]="'desde-' + clave()"
          [name]="'franja-desde-' + clave()"
          placeholder="hh:mm"
          autocomplete="off"
          [matTimepicker]="relojFranjaDesde"
          [(ngModel)]="nueva.horaDesde"
        />
        <mat-timepicker-toggle matIconSuffix aria-label="Elegir la hora" [for]="relojFranjaDesde" />
        <mat-timepicker #relojFranjaDesde />
      </mat-form-field>

      <mat-form-field class="chico w-32">
        <mat-label>Hasta</mat-label>
        <input
          matInput
          [id]="'hasta-' + clave()"
          [name]="'franja-hasta-' + clave()"
          placeholder="hh:mm"
          autocomplete="off"
          [matTimepicker]="relojFranjaHasta"
          [(ngModel)]="nueva.horaHasta"
        />
        <mat-timepicker-toggle matIconSuffix aria-label="Elegir la hora" [for]="relojFranjaHasta" />
        <mat-timepicker #relojFranjaHasta />
      </mat-form-field>

      <mat-form-field class="chico w-28">
        <mat-label>Precio 1 hora</mat-label>
        <input
          matInput
          type="number"
          min="0"
          step="500"
          [id]="'monto-' + clave()"
          [name]="'franja-monto-' + clave()"
          [(ngModel)]="nueva.montoClp"
        />
      </mat-form-field>

      <mat-form-field class="chico w-28">
        <mat-label>Precio 1 hora y media</mat-label>
        <input
          matInput
          type="number"
          min="1"
          step="500"
          placeholder="No se vende"
          [id]="'monto90-' + clave()"
          [name]="'franja-monto90-' + clave()"
          [(ngModel)]="nueva.montoClp90"
        />
      </mat-form-field>

      <label class="flex items-center gap-2 py-1">
        <input
          type="checkbox"
          [name]="'franja-prime-' + clave()"
          [(ngModel)]="nueva.esPico"
        />
        Hora prime
      </label>

      <button
        matButton="outlined"
        type="submit"
        [disabled]="guardando()"
        [attr.aria-busy]="guardando()"
        class="chico"
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
        horaDesde: horaATexto(this.nueva.horaDesde),
        horaHasta: horaATexto(this.nueva.horaHasta),
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
