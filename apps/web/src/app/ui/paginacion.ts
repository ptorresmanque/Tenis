import { Component, computed, input, model } from '@angular/core';

/**
 * Anterior / Siguiente con la cuenta al medio.
 *
 * Sin números de página: con listas del tamaño del club —cientos de socios, no
 * miles— una tira de números es más código y más ruido que valor. Si alguna
 * lista crece hasta necesitarlos, se agregan acá y aparecen en las cuatro
 * tablas de una vez.
 *
 * La cuenta va en una región viva: quien no ve la tabla necesita enterarse de
 * que cambió de página, y el foco se queda en el botón que apretó.
 */
@Component({
  selector: 'app-paginacion',
  template: `
    <nav class="flex items-center justify-between gap-4" aria-label="Paginación">
      <button
        type="button"
        class="boton boton-secundario boton-chico"
        [disabled]="pagina() <= 1"
        (click)="mover(-1)"
      >
        <span class="icono text-base" aria-hidden="true">chevron_left</span>
        Anterior
      </button>

      <p class="text-sm text-muted-foreground" aria-live="polite">
        Página {{ pagina() }} de {{ paginas() }}
      </p>

      <button
        type="button"
        class="boton boton-secundario boton-chico"
        [disabled]="pagina() >= paginas()"
        (click)="mover(1)"
      >
        Siguiente
        <span class="icono text-base" aria-hidden="true">chevron_right</span>
      </button>
    </nav>
  `,
})
export class Paginacion {
  readonly pagina = model.required<number>();
  readonly total = input.required<number>();
  readonly porPagina = input(10);

  /** Siempre al menos una: "Página 1 de 0" no existe. */
  protected readonly paginas = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.porPagina())),
  );

  protected mover(pasos: number): void {
    const destino = this.pagina() + pasos;
    if (destino < 1 || destino > this.paginas()) return;

    this.pagina.set(destino);
  }
}
