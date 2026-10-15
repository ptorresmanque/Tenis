import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatProgressBar } from '@angular/material/progress-bar';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
} from '@angular/router';

/**
 * Cuánto tiene que durar una navegación para que la barra aparezca (A12). En una red
 * rápida no se ve nunca: parpadear en cada clic sería peor que no tenerla.
 */
const RETARDO_EN_MILISEGUNDOS = 200;

/**
 * La barra fina arriba de la pantalla mientras el router carga la página siguiente
 * (T151), en los dos cascarones.
 *
 * Las rutas se cargan perezosas: entre el clic y la pantalla nueva, el navegador baja
 * el código de esa ruta, y en una red lenta pasa un segundo sin que nada cambie. Es
 * la misma pregunta que el botón ocupado responde para un envío: ¿llegó el clic?
 *
 * **El lector de pantalla no la anuncia** (`aria-hidden`): avisar "cargando" en cada
 * enlace sería ruido, y la página nueva se anuncia sola con su título.
 */
@Component({
  selector: 'app-progreso-de-navegacion',
  imports: [MatProgressBar],
  template: `
    <!-- No se sabe cuánto falta, así que es indeterminada (T262): un tramo que cruza la
         pantalla y vuelve a empezar. Con "reducir movimiento" se queda quieta. El «fixed!» es
         porque Material le fija «position: relative» sin capa. -->
    @if (visible()) {
      <mat-progress-bar
        data-barra
        mode="indeterminate"
        class="fixed! inset-x-0 top-0 z-50 print:hidden"
        aria-hidden="true"
      />
    }
  `,
})
export class ProgresoDeNavegacion {
  protected readonly visible = signal(false);

  constructor() {
    let espera: ReturnType<typeof setTimeout> | undefined;

    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((evento) => {
        if (evento instanceof NavigationStart) {
          clearTimeout(espera);
          espera = setTimeout(() => this.visible.set(true), RETARDO_EN_MILISEGUNDOS);
        } else if (
          evento instanceof NavigationEnd ||
          evento instanceof NavigationCancel ||
          evento instanceof NavigationError ||
          evento instanceof NavigationSkipped
        ) {
          clearTimeout(espera);
          this.visible.set(false);
        }
      });

    // Al pasar del sitio al panel, el cascarón se va a mitad de la navegación: su
    // espera no puede quedar viva escribiendo en un componente que ya no existe.
    inject(DestroyRef).onDestroy(() => clearTimeout(espera));
  }
}
