import {
  Component,
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
} from '@angular/core';

/** Los ids tienen que ser únicos en el documento y no hay dos campos iguales. */
let contador = 0;

/**
 * Marca cuál de los elementos proyectados es el control.
 *
 * Es una directiva y no una variable de plantilla (`#control`) porque las
 * variables viven en la vista del componente que las escribe: dos campos en el
 * mismo formulario chocarían por usar las dos el mismo nombre.
 */
@Directive({
  selector: '[appCampoControl]',
})
export class CampoControl {
  readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
}

/**
 * Etiqueta, ayuda y error alrededor de un control nativo.
 *
 * El control va **dentro** del `<label>`, así que la asociación etiqueta-control
 * es del HTML y no hace falta parear `for` con `id`. Lo que sí hace falta es
 * conectar la ayuda y el error: sin `aria-describedby`, quien usa lector de
 * pantalla enfoca el campo y no escucha ni el formato que se espera ni el motivo
 * del rechazo. Eso es lo que hace este componente:
 *
 * ```html
 * <app-campo etiqueta="Correo" ayuda="Te llega ahí la confirmación">
 *   <input appCampoControl type="email" class="campo" formControlName="email" />
 * </app-campo>
 * ```
 */
@Component({
  selector: 'app-campo',
  template: `
    <!-- El control llega proyectado, así que la regla no lo ve desde acá. La
         asociación existe igual: el HTML acepta un control anidado en su label
         sin necesidad de for/id, y el test lo comprueba. -->
    <!-- eslint-disable-next-line @angular-eslint/template/label-has-associated-control -->
    <label class="grid gap-1.5">
      <span class="text-sm font-semibold">
        {{ etiqueta() }}
        <!-- El asterisco es para el ojo; al lector de pantalla se lo dice el
             atributo required del control, y leer "asterisco" no ayuda. -->
        @if (obligatorio()) {
          <span aria-hidden="true">*</span>
        }
      </span>
      <ng-content />
      @if (ayuda()) {
        <span [id]="idAyuda" class="text-xs text-muted-foreground">{{ ayuda() }}</span>
      }
      @if (error()) {
        <span [id]="idError" role="alert" class="text-xs font-medium text-destructive">
          {{ error() }}
        </span>
      }
    </label>
  `,
})
export class Campo {
  readonly etiqueta = input.required<string>();
  readonly ayuda = input('');
  readonly error = input('');
  readonly obligatorio = input(false);

  private readonly control = contentChild(CampoControl);

  private readonly n = ++contador;
  protected readonly idAyuda = `campo-${this.n}-ayuda`;
  protected readonly idError = `campo-${this.n}-error`;

  constructor() {
    effect(() => {
      const control = this.control()?.elemento.nativeElement;
      if (!control) return;

      const descripciones = [
        this.ayuda() ? this.idAyuda : '',
        this.error() ? this.idError : '',
      ].filter(Boolean);

      if (descripciones.length > 0) {
        control.setAttribute('aria-describedby', descripciones.join(' '));
      } else {
        control.removeAttribute('aria-describedby');
      }

      // Se quita cuando el error se va: un campo que queda marcado inválido
      // después de corregirlo se anuncia mal en cada visita siguiente.
      if (this.error()) {
        control.setAttribute('aria-invalid', 'true');
      } else {
        control.removeAttribute('aria-invalid');
      }
    });
  }
}
