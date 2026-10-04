import { Component, input, output } from '@angular/core';

import { BloqueDisponible, Cancha } from '../disponibilidad';
import { enPesos, horaEnElClub } from '../reloj-del-club';
import { TARIFA_DEL_SOCIO } from './bandas';

/**
 * La barra de abajo con la hora marcada para reservar: qué se marcó y con cuánto, y recién
 * "Reservar" abre el formulario. El diálogo que ya existía sigue siendo el que pide
 * acompañantes y cobra.
 *
 * La hermana de `ResumenDelCambio`, que es la de quien cambia desde el enlace. `contents`
 * en el host por lo mismo: sus dos bloques son hijos del flex de `app-barra-fija`.
 */
@Component({
  selector: 'app-resumen-de-la-eleccion',
  host: { class: 'contents' },
  template: `
    <div role="status" aria-live="polite">
      <!-- Lo elegido, en rótulo (TV5.1): es la pieza que se lee de un vistazo
           antes de apretar "Reservar". -->
      <p
        class="inline-flex bg-rotulo py-1 ps-3 font-display text-lg font-bold tracking-wide
               text-on-rotulo uppercase corte-fin"
      >
        {{ cancha().nombre }} · {{ hora(bloque().inicio) }}–{{ hora(bloque().fin) }}
      </p>
      @let monto = bloque().montoClp;
      <p class="mt-1 text-sm text-muted-foreground">
        Socio {{ tarifaDelSocio }}
        @if (monto !== null) {
          · Arriendo
          <span class="font-semibold text-accent-strong">{{ pesos(monto) }}</span>
        }
        @if (bloque().esPico) {
          · Hora pico
        }
      </p>
    </div>

    <div class="flex gap-2">
      <button type="button" class="boton boton-texto" (click)="soltar.emit()">Soltar</button>
      <button type="button" class="boton boton-primario" (click)="reservar.emit()">
        Reservar
      </button>
    </div>
  `,
})
export class ResumenDeLaEleccion {
  readonly cancha = input.required<Cancha>();
  readonly bloque = input.required<BloqueDisponible>();

  readonly soltar = output<void>();
  readonly reservar = output<void>();

  protected readonly hora = horaEnElClub;
  protected readonly pesos = enPesos;
  protected readonly tarifaDelSocio = TARIFA_DEL_SOCIO;
}
