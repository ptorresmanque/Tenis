import { afterNextRender, Component, DestroyRef, inject, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';

/** Desde dónde aparece: una pantalla y media. Antes, el comienzo está a un gesto. */
const UMBRAL_EN_PANTALLAS = 1.5;

/**
 * El botón que lleva al comienzo de la página (T149), en el sitio público.
 *
 * **Siempre en el DOM y `inert` mientras no sirve**, en vez de un `@if`: así puede
 * entrar y salir con una transición, y mientras está oculto no se alcanza con Tab ni
 * lo encuentra el lector de pantalla, que es lo que `inert` asegura.
 *
 * Al usarlo, el foco vuelve a `#contenido`, el mismo destino del enlace "Saltar al
 * contenido": sin eso, el teclado se queda en un botón que acaba de desaparecer.
 * Con "reducir movimiento" sube de una vez; el scroll suave es una animación más.
 *
 * En el flujo de reserva no aparece: ahí el rincón es de la barra fija con lo elegido
 * (regla en styles.css, junto a la barra).
 *
 * **Caja clara y flecha azul**, y no el azul primario de los botones: flota sobre el
 * fondo claro y sobre las bandas azules, y un círculo primario sobre el campo da
 * 1:1 en el tema claro. Lo que lo identifica es la flecha, que da 8:1 contra su caja
 * en claro y 5:1 en oscuro.
 */
@Component({
  selector: 'app-volver-arriba',
  imports: [MatIcon, MatIconButton],
  host: { class: 'print:hidden' },
  template: `
    <button
      matIconButton
      type="button"
      aria-label="Volver arriba"
      class="volver-arriba fixed end-4 bottom-4 z-30 flex size-12 cursor-pointer items-center
             justify-center rounded-full border border-border bg-card text-primary shadow-lg
             sm:end-6 sm:bottom-6"
      [class.visible]="visible()"
      [inert]="!visible()"
      (click)="subir()"
    >
      <mat-icon class="text-2xl" aria-hidden="true">arrow_upward</mat-icon>
    </button>
  `,
  styles: `
    /* Entra subiendo un poco y sale más rápido de lo que entra, como los diálogos.
       visibility va en la transición para que se oculte al terminar de salir. Esta
       lista reemplaza la del botón de ícono (styles.css), así que repite su escala: sin
       ella, el botón se hundiría de golpe al presionarlo. */
    .volver-arriba {
      opacity: 0;
      translate: 0 0.75rem;
      visibility: hidden;
      transition:
        opacity var(--duracion-salida) var(--ease-salida),
        translate var(--duracion-salida) var(--ease-salida),
        visibility var(--duracion-salida),
        scale var(--duracion-pulsacion) var(--ease-salida);
    }

    .volver-arriba.visible {
      opacity: 1;
      translate: 0;
      visibility: visible;
      transition-duration: var(--duracion-menu);
    }
  `,
})
export class VolverArriba {
  protected readonly visible = signal(false);

  /**
   * Un listener pasivo y no `(window:scroll)` en el host: ese agenda una detección de
   * cambios por cada evento, unas sesenta por segundo. Así solo cambia la señal, y la
   * señal no avisa si el valor es el mismo. Se mide también al dibujar: quien recarga
   * a mitad de página lo ve sin mover el scroll.
   */
  constructor() {
    const medir = () =>
      this.visible.set(window.scrollY > window.innerHeight * UMBRAL_EN_PANTALLAS);

    // El listener y su limpieza, juntos y solo en el navegador: en el servidor (el prerender y
    // `ng serve`) no hay window, y quitarlo al destruir tumbaba el servidor de desarrollo (T360).
    const destruir = inject(DestroyRef);
    afterNextRender(() => {
      medir();
      window.addEventListener('scroll', medir, { passive: true });
      destruir.onDestroy(() => window.removeEventListener('scroll', medir));
    });
  }

  protected subir(): void {
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.scrollTo({ top: 0, behavior: quieto ? 'auto' : 'smooth' });
    // preventScroll: el foco no puede cortar el scroll suave que acaba de empezar.
    document.getElementById('contenido')?.focus({ preventScroll: true });
  }
}
