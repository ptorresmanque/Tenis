import { booleanAttribute, Component, input } from '@angular/core';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

/**
 * Lo que se ve mientras los datos llegan.
 *
 * **La espera se ve, y se lee (T278, SPEC-revision-qa.md A5).** Las barras grises solas
 * parecían datos que faltaban. Ahora, en una vista entera, la barra indeterminada de Material va
 * arriba, con el texto debajo, y las filas siguen ocupando el sitio de la tabla para que la
 * página no salte cuando llegan los datos. Con `compacto`, para un panel, un diálogo o el zócalo
 * de la portada, va el círculo chico con el texto al lado y sin filas: es lo que el skill pide
 * para un espacio chico.
 *
 * **El texto es lo que se anuncia.** La barra, el círculo y las filas van con `aria-hidden`:
 * acompañan a la espera, pero no dicen nada que el texto no diga ya. Con "reducir movimiento",
 * la regla global de `styles.css` deja quieta la barra, igual que la de navegación (T262). El
 * círculo, en cambio, se congelaba en un punto casi invisible: ahí va quieto, en tres cuartos.
 */
@Component({
  selector: 'app-esqueleto',
  imports: [MatProgressBar, MatProgressSpinner],
  template: `
    @if (compacto()) {
      <div class="flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
        <mat-progress-spinner
          [mode]="quieto ? 'determinate' : 'indeterminate'"
          [value]="75"
          [diameter]="20"
          aria-hidden="true"
        />
        <span data-etiqueta>{{ etiqueta() }}</span>
      </div>
    } @else {
      <mat-progress-bar mode="indeterminate" aria-hidden="true" />
      <p data-etiqueta class="mt-2 text-sm text-muted-foreground">{{ etiqueta() }}</p>

      <div class="mt-3 grid gap-2" aria-hidden="true">
        @for (fila of filasVisibles(); track fila) {
          <div
            data-fila
            class="fila h-10 rounded-control bg-muted"
            [style.animation-delay]="fila * 90 + 'ms'"
          ></div>
        }
      </div>
    }
  `,
  styles: `
    .fila {
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

  /** Lo que dice la espera: se ve y es lo que oye el lector de pantalla. */
  readonly etiqueta = input('Cargando…');

  /** Para un espacio chico: el círculo y el texto en una línea, sin filas. */
  readonly compacto = input(false, { transform: booleanAttribute });

  /** Si el sistema pide "reducir movimiento". Sin `matchMedia` (en las pruebas), no. */
  protected readonly quieto =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  protected filasVisibles(): number[] {
    return Array.from({ length: this.filas() }, (_, i) => i);
  }
}
