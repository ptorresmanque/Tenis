import { Component, input } from '@angular/core';

/**
 * Lo que se ve cuando no hay nada que ver.
 *
 * Con la salida a mano: una lista vacía sin un camino al lado deja a la persona
 * mirando una pantalla que no explica qué hacer. El contenido proyectado es ese
 * camino —un enlace, un botón— y desaparece solo si no se pasa nada.
 */
@Component({
  selector: 'app-estado-vacio',
  template: `
    <div
      class="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center"
    >
      <span class="icono text-4xl text-muted-foreground" aria-hidden="true">
        {{ icono() }}
      </span>
      <p class="mt-3 font-display text-xl font-bold uppercase tracking-wide">{{ titulo() }}</p>
      @if (detalle()) {
        <p class="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
          {{ detalle() }}
        </p>
      }
      <div class="mt-4 flex flex-wrap justify-center gap-2 empty:hidden">
        <ng-content />
      </div>
    </div>
  `,
})
export class EstadoVacio {
  readonly titulo = input.required<string>();
  readonly detalle = input('');
  readonly icono = input('inbox');
}
