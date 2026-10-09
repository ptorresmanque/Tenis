import { Component, computed, forwardRef, input, model, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatTimepickerModule } from '@angular/material/timepicker';

import { horaATexto, proveerFechaYHora, textoAHora } from './fecha-y-hora';

/**
 * Un campo de hora con la lista de Angular Material (T122, decisión 2 de la sexta parte).
 *
 * **Entra y sale texto, `HH:mm`**, como el `input type="time"` que reemplaza. Se elige de
 * una lista cada `intervalo` —30 minutos por omisión, como la grilla del club— o se
 * escribe a mano, en 24 horas.
 *
 * Funciona con `[(ngModel)]` y, donde no hay formulario, con `[(valor)]`.
 */
@Component({
  selector: 'app-campo-hora',
  imports: [MatTimepickerModule],
  providers: [
    proveerFechaYHora(),
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CampoHora), multi: true },
  ],
  host: { class: 'inline-flex items-center gap-1' },
  template: `
    <input
      [id]="inputId()"
      [attr.name]="name() || null"
      [class]="'campo ' + claseCampo()"
      placeholder="hh:mm"
      autocomplete="off"
      [matTimepicker]="reloj"
      [matTimepickerMin]="min() || null"
      [matTimepickerMax]="max() || null"
      [value]="hora()"
      [disabled]="deshabilitado()"
      [attr.aria-describedby]="describedBy() || null"
      (valueChange)="elegir($event)"
      (blur)="alTocar()"
    />
    @if (conBoton()) {
      <mat-timepicker-toggle [for]="reloj" aria-label="Elegir la hora" />
    }
    <mat-timepicker #reloj [interval]="intervalo()" />
  `,
})
export class CampoHora implements ControlValueAccessor {
  readonly inputId = input.required<string>();
  readonly name = input<string>();
  /** La primera y la última hora de la lista, `HH:mm`. */
  readonly min = input<string>();
  readonly max = input<string>();
  /** Cada cuánto se ofrece una hora: `30min`, `1h`. */
  readonly intervalo = input('30min');
  readonly claseCampo = input('');
  readonly describedBy = input<string>();
  /**
   * El botón del reloj. Se puede quitar en una fila apretada: el campo abre la lista solo,
   * con un clic o con la flecha abajo, así que el botón es una ayuda y no la única vía.
   */
  readonly conBoton = input(true);

  readonly valor = model('');

  protected readonly hora = computed(() => textoAHora(this.valor()));
  protected readonly deshabilitado = signal(false);

  private avisarCambio: (valor: string) => void = () => undefined;
  protected alTocar: () => void = () => undefined;

  protected elegir(hora: Date | null): void {
    const texto = hora && !Number.isNaN(hora.getTime()) ? horaATexto(hora) : '';

    // Sin cambio no se avisa: el campo vuelve a emitir al reescribir su propio valor.
    if (texto === this.valor()) return;

    this.valor.set(texto);
    this.avisarCambio(texto);
  }

  writeValue(valor: string | null): void {
    this.valor.set(valor ?? '');
  }

  registerOnChange(avisar: (valor: string) => void): void {
    this.avisarCambio = avisar;
  }

  registerOnTouched(tocado: () => void): void {
    this.alTocar = tocado;
  }

  setDisabledState(deshabilitado: boolean): void {
    this.deshabilitado.set(deshabilitado);
  }
}
