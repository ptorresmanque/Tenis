import { Directive, ElementRef, forwardRef, inject } from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';

/**
 * El campo de teléfono (T121): el `+56` va fijo al lado —en un `span` del formulario— y
 * en el campo solo entran los 9 dígitos (decisión 1 de la sexta parte).
 *
 * **Una directiva sobre el mismo `input` y no un componente**: así siguen funcionando la
 * etiqueta, `formControlName`, `ngModel` y `appCampoControl` de `app-campo`, que pone la
 * ayuda y el estado inválido en el control que tiene a mano.
 *
 * Entrega la forma que guarda la API (T120): `56` más los 9 dígitos. Con menos, entrega
 * los dígitos que haya y marca el campo inválido, para que el formulario no se mande y el
 * servidor, si se manda igual, diga el formato.
 */
@Directive({
  selector: 'input[appTelefono]',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TelefonoDirective), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => TelefonoDirective), multi: true },
  ],
  host: {
    type: 'tel',
    inputmode: 'numeric',
    // **Sin `maxlength`**: el navegador corta lo pegado antes de que la directiva lo vea,
    // y `+56 9 8765-4321` entraba como `+56 9 876`. El tope de 9 lo pone `soloLosNueve`.
    autocomplete: 'tel-national',
    placeholder: '9 1234 5678',
    '(input)': 'escribir()',
    '(blur)': 'alTocar()',
  },
})
export class TelefonoDirective implements ControlValueAccessor, Validator {
  private readonly campo = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;

  private avisarCambio: (valor: string) => void = () => undefined;
  protected alTocar: () => void = () => undefined;

  protected escribir(): void {
    const digitos = soloLosNueve(this.campo.value);

    this.campo.value = digitos;
    this.avisarCambio(digitos.length === 9 ? `56${digitos}` : digitos);
  }

  writeValue(valor: string | null): void {
    this.campo.value = soloLosNueve(valor ?? '');
  }

  registerOnChange(avisar: (valor: string) => void): void {
    this.avisarCambio = avisar;
  }

  registerOnTouched(tocado: () => void): void {
    this.alTocar = tocado;
  }

  setDisabledState(deshabilitado: boolean): void {
    this.campo.disabled = deshabilitado;
  }

  /**
   * Vacío vale —si es obligatorio lo dice `required`—; a medias, no. Juzga los dígitos,
   * como la API: un `+56 9 1111 2222` guardado antes de T120 es un teléfono válido.
   */
  validate(control: AbstractControl): ValidationErrors | null {
    const digitos = String(control.value ?? '').replace(/\D/g, '');
    const sinPais =
      digitos.length === 11 && digitos.startsWith('56') ? digitos.slice(2) : digitos;

    return digitos === '' || sinPais.length === 9 ? null : { telefono: true };
  }
}

/**
 * Los dígitos que van en el campo: sin el 56 del país si vino pegado con él, y como
 * mucho 9.
 */
function soloLosNueve(texto: string): string {
  const digitos = texto.replace(/\D/g, '');
  const sinPais = digitos.length > 9 && digitos.startsWith('56') ? digitos.slice(2) : digitos;

  return sinPais.slice(0, 9);
}
