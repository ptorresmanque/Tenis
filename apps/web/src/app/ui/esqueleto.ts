import { Component, input } from '@angular/core';

/**
 * Lo que se ve mientras los datos llegan.
 *
 * **Barras con la forma de lo que viene, no la palabra "Cargando".** Un texto
 * gris obliga a leer para enterarse de que hay que esperar, y después la
 * pantalla salta cuando el contenido lo reemplaza con otra altura. Las barras
 * ocupan el sitio que va a ocupar la tabla, así que la página no se mueve al
 * llegar los datos.
 *
 * **El texto no desaparece: se vuelve invisible.** Quien usa lector de pantalla
 * no ve las barras, y sin el `sr-only` la región viva quedaría muda justo en el
 * momento en que hay algo que anunciar. Las barras van con `aria-hidden` por lo
 * contrario: son decoración de una espera, no contenido.
 *
 * El pulso lo apaga la regla global de `prefers-reduced-motion`.
 */
@Component({
  selector: 'app-esqueleto',
  template: `
    <span class="sr-only">{{ etiqueta() }}</span>

    <div class="grid gap-2" aria-hidden="true">
      @for (fila of filasVisibles(); track fila) {
        <div class="h-10 rounded-control bg-muted" [style.animation-delay]="fila * 90 + 'ms'"></div>
      }
    </div>
  `,
  styles: `
    div > div {
      animation: latir var(--duracion-latido) ease-in-out infinite;
    }

    @keyframes latir {
      50% {
        opacity: 0.45;
      }
    }
  `,
})
export class Esqueleto {
  /** Cuántas filas dibujar. Por omisión, las que caben sin llenar la pantalla. */
  readonly filas = input(4);

  /** Lo que oye quien no ve las barras. */
  readonly etiqueta = input('Cargando…');

  protected filasVisibles(): number[] {
    return Array.from({ length: this.filas() }, (_, i) => i);
  }
}
