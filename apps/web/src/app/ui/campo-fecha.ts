import { Component, computed, forwardRef, inject, input, model, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';

import { fechaATexto, proveerFechaYHora, textoAFecha } from './fecha-y-hora';

/**
 * Un campo de fecha con el calendario de Angular Material (T122, decisión 2 de la sexta
 * parte).
 *
 * **Entra y sale texto, `AAAA-MM-DD`**, como el `input type="date"` que reemplaza: los
 * formularios no cambian, y ningún `Date` del navegador se cruza con la hora del club. Se
 * escribe y se lee `dd-mm-aaaa`, y también se puede escribir a mano.
 *
 * Funciona con `[(ngModel)]` y, donde no hay formulario, con `[(valor)]`. La etiqueta va
 * afuera, con `for` apuntando a `inputId`, como en cualquier campo del sitio.
 */
@Component({
  selector: 'app-campo-fecha',
  imports: [MatDatepickerModule],
  providers: [
    proveerFechaYHora(),
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CampoFecha), multi: true },
  ],
  host: { class: 'inline-flex items-center gap-1' },
  template: `
    <input
      [id]="inputId()"
      [attr.name]="name() || null"
      [class]="'campo ' + claseCampo()"
      placeholder="dd-mm-aaaa"
      autocomplete="off"
      [matDatepicker]="calendario"
      [min]="minimo()"
      [max]="maximo()"
      [value]="fecha()"
      [disabled]="deshabilitado()"
      [attr.aria-describedby]="describedBy() || null"
      [attr.aria-label]="etiquetaAccesible() || null"
      (dateChange)="elegir($event.value)"
      (blur)="alTocar()"
    />
    <mat-datepicker-toggle [for]="calendario" />
    <mat-datepicker #calendario />
  `,
})
export class CampoFecha implements ControlValueAccessor {
  private readonly adaptador = inject(DateAdapter<Date>);

  readonly inputId = input.required<string>();
  readonly name = input<string>();
  /** El primer y el último día que se pueden elegir, `AAAA-MM-DD`. */
  readonly min = input<string>();
  readonly max = input<string>();
  /** Clases extra del `input`, además de `campo`: el ancho y el margen de cada pantalla. */
  readonly claseCampo = input('');
  readonly describedBy = input<string>();
  /** El nombre del campo cuando no tiene etiqueta visible: una celda de tabla, por ejemplo. */
  readonly etiquetaAccesible = input<string>();

  /** El valor, para usarlo sin formulario: `[(valor)]`. */
  readonly valor = model('');

  protected readonly fecha = computed(() => textoAFecha(this.valor()));
  protected readonly minimo = computed(() => textoAFecha(this.min()));
  protected readonly maximo = computed(() => textoAFecha(this.max()));
  protected readonly deshabilitado = signal(false);

  private avisarCambio: (valor: string) => void = () => undefined;
  protected alTocar: () => void = () => undefined;

  /** Una fecha imposible o borrada llega como nula o inválida, y sale vacía. */
  protected elegir(fecha: Date | null): void {
    const texto = fecha && this.adaptador.isValid(fecha) ? fechaATexto(fecha) : '';

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
