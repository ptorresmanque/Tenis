import { booleanAttribute, Component, input } from '@angular/core';

/**
 * La barra pegada abajo con lo elegido y el botón que cierra la acción.
 *
 * Aparece cuando hay algo elegido, así que se monta y se desmonta con un `@if`
 * del consumidor. Dos cosas que la pantalla que la usa tiene que respetar:
 *
 * - dejarle aire al final del contenido (`pb-28` o parecido), porque si no la
 *   barra tapa la última fila y el master lo prohíbe en su checklist;
 * - anunciar el cambio, que es asunto de lo que se proyecte adentro.
 *
 * `pb-[env(safe-area-inset-bottom)]` no se usa: el lint rechaza los valores
 * arbitrarios. El `pb-4` alcanza para el gesto de inicio del iPhone.
 */
@Component({
  selector: 'app-barra-fija',
  template: `
    <!-- En el panel va pegada abajo dentro del contenido (T390): fija a todo el ancho de la
         ventana, quedaba encima del menú lateral. -->
    <div
      class="bottom-0 z-30 border-t border-border bg-card px-4 py-4 shadow-lg"
      [class]="enElFlujo() ? 'sticky mt-6' : 'fixed inset-x-0'"
    >
      <div
        class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3"
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class BarraFija {
  /** Pegada abajo dentro de lo que se desplaza, y no fija a la ventana: la del panel (T390). */
  readonly enElFlujo = input(false, { transform: booleanAttribute });
}
