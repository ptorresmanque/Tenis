import { Component, ElementRef, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { Aviso } from '../ui/aviso';

/** La llave de la pestaña: cerrado, el aviso no vuelve hasta la próxima visita. */
const CERRADO = 'aviso-de-gracia-cerrado';

/**
 * El recordatorio del socio con la cuota vencida que todavía está en gracia (T381,
 * SPEC-cuotas.md § Días de gracia): cuántos días le quedan para pagar antes de quedar sin
 * reservar, y el botón que lo lleva a hacerlo.
 *
 * **No es un `MatSnackBar`, y es lo que piden los lineamientos de Angular Material**: el
 * snackbar es para confirmaciones que se van solas, no para algo que la persona tiene que leer,
 * como este plazo; para eso va un aviso fijo en la página, que Material no trae (referencias
 * `snack-bar.md` y `wrappers.md` del skill). Por eso se arma sobre `<app-aviso>`, con los
 * botones de Material.
 *
 * **`sticky` al final de `<main>` y no `fixed`.** Mientras se recorre la página flota abajo;
 * al llegar al final se queda en su lugar, antes del pie, y no lo tapa. En el teléfono va
 * más arriba que en el escritorio para dejar libre la esquina de «Volver arriba» (T149).
 *
 * **Se esconde mientras la grilla muestra su barra fija** (`app-barra-fija`): la barra trae
 * el botón que reserva, y quien está eligiendo una hora en la gracia sí puede tomarla. Con
 * `:has()` y no avisándose entre componentes: la grilla no tiene por qué saber del aviso.
 *
 * Se anuncia como `status`, sin quitar el foco, porque lo pone `<app-aviso>` con la variante
 * «aviso». Al cerrarlo, el foco pasa al primer control que viene después (el pie): si se
 * quedara en un botón que ya no existe, o volviera a `#contenido`, el siguiente Tab empezaría
 * desde arriba, y el aviso es lo último de `<main>`.
 *
 * Mientras se ve, `styles.css` le reserva su alto abajo con `scroll-padding-bottom`, para que
 * lo que recibe el foco no quede tapado por él (WCAG 2.2, 2.4.11).
 */
@Component({
  selector: 'app-aviso-de-gracia',
  imports: [Aviso, MatButton, RouterLink],
  host: {
    class: 'sticky bottom-20 z-20 mt-8 block sm:bottom-6 sm:max-w-md print:hidden',
  },
  styles: `
    :host-context(body:has(app-barra-fija)) {
      display: none;
    }

    /* Una sola entrada, corta, desde abajo: lo que ya se ve no se vuelve a animar al
       navegar, porque el cascarón no se desmonta. */
    @media (prefers-reduced-motion: no-preference) {
      :host {
        animation: aparece var(--duracion-emergente) var(--ease-salida) both;
      }
    }
  `,
  template: `
    @if (abierto()) {
      <app-aviso variante="aviso" titulo="Tu cuota está vencida" class="block shadow-lg">
        <p class="mt-1">
          @if (dias() > 1) {
            Te quedan {{ dias() }} días para pagarla; después no podrás reservar canchas.
          } @else {
            Hoy es el último día para pagarla; desde mañana no podrás reservar canchas.
          }
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a matButton="filled" routerLink="/mi-cuenta/cuota">Pagar cuota</a>
          <button matButton type="button" (click)="cerrar()">Cerrar</button>
        </div>
      </app-aviso>
    }
  `,
})
export class AvisoDeGracia {
  /** Los que le quedan, contando hoy: de los días de gracia del club a 1, el último. */
  readonly dias = input.required<number>();

  protected readonly abierto = signal(sessionStorage.getItem(CERRADO) === null);

  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected cerrar(): void {
    sessionStorage.setItem(CERRADO, '1');
    this.abierto.set(false);
    (this.controlSiguiente() ?? document.getElementById('contenido'))?.focus();
  }

  /** El primer control que viene después del aviso en el documento, si hay alguno. */
  private controlSiguiente(): HTMLElement | undefined {
    return [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea',
      ),
    ].find(
      (control) =>
        !this.anfitrion.contains(control) &&
        Boolean(
          this.anfitrion.compareDocumentPosition(control) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ),
    );
  }
}
