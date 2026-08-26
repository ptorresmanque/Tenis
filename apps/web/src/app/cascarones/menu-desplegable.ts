import { Component, ElementRef, input, signal, viewChild } from '@angular/core';

/**
 * El menú que cuelga de un botón: el del avatar en el sitio público y el del pie
 * de la barra lateral del admin.
 *
 * Existe como componente y no copiado dos veces porque lo que se duplicaría no
 * es el dibujo sino el comportamiento de teclado —`Esc` cierra, el foco vuelve
 * al botón, un clic afuera lo cierra—, y eso copiado se arregla en un solo lado
 * el día que falle.
 *
 * No lleva `role="menu"`: eso obliga al patrón completo de flechas de la APG y
 * aquí adentro solo hay enlaces de navegación, que Tab ya recorre.
 */
@Component({
  selector: 'app-menu-desplegable',
  host: {
    class: 'relative',
    // Un clic en cualquier parte lo cierra, incluidos los enlaces de adentro:
    // así el menú no queda abierto detrás de la pantalla siguiente.
    '(document:click)': 'abierto.set(false)',
    '(keydown.escape)': 'cerrar()',
  },
  template: `
    <button
      #disparador
      type="button"
      class="cursor-pointer"
      [class]="claseBoton()"
      [attr.aria-label]="etiqueta()"
      [attr.aria-expanded]="abierto()"
      aria-haspopup="true"
      (click)="alternar($event)"
    >
      <ng-content select="[disparador]" />
    </button>

    @if (abierto()) {
      <div
        class="absolute z-50 min-w-56 rounded-xl border border-border bg-card p-1
               shadow-lg"
        [class]="clasePanel()"
      >
        <ng-content />
      </div>
    }
  `,
})
export class MenuDesplegable {
  readonly etiqueta = input.required<string>();
  readonly claseBoton = input('');
  /** Dónde se abre respecto del botón. Por defecto, hacia abajo y a la derecha. */
  readonly clasePanel = input('end-0 top-full mt-2');

  private readonly disparador =
    viewChild.required<ElementRef<HTMLButtonElement>>('disparador');

  protected readonly abierto = signal(false);

  protected alternar(evento: MouseEvent): void {
    // Sin esto, el clic sigue subiendo hasta `document` y el menú se cierra en
    // el mismo gesto que lo abre.
    evento.stopPropagation();
    this.abierto.update((estaba) => !estaba);
  }

  protected cerrar(): void {
    if (!this.abierto()) return;

    this.abierto.set(false);
    // Cerrar sin devolver el foco lo manda al principio del documento: quien
    // navega con teclado tendría que recorrer el sitio entero para volver.
    this.disparador().nativeElement.focus();
  }
}
