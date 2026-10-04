import { Component, computed, input, output } from '@angular/core';

import { BloqueDisponible, Cancha } from '../disponibilidad';
import { enPesos, horaEnElClub } from '../reloj-del-club';

/**
 * Lo que cuesta pasarse a una hora para quien ya pagó (T91): la diferencia exacta, o el
 * aviso de que no se devuelve. La regla es la del servidor (T88); acá solo se dice, y el
 * servidor la recalcula al confirmar.
 */
export function textoDeLaDiferencia(montoClp: number, pagadoClp: number): string {
  if (montoClp > pagadoClp) return `Pagas ${enPesos(montoClp - pagadoClp)} de diferencia.`;

  if (montoClp === pagadoClp) return 'Sin costo: vale lo mismo que pagaste.';

  return `Vale ${enPesos(montoClp)}: no se devuelve la diferencia de ${enPesos(pagadoClp - montoClp)}.`;
}

/**
 * La barra de abajo cuando quien cambia su reserva desde el enlace ya pagó (T91).
 *
 * El clic en la grilla marca la hora y esto la confirma: el cambio tiene plata en juego,
 * y la diferencia —o lo que no se devuelve— se dice **antes** del botón que lo hace.
 * `contents` en el host: sus dos bloques son hijos del flex de `app-barra-fija`, igual
 * que los de la barra de reservar.
 */
@Component({
  selector: 'app-resumen-del-cambio',
  host: { class: 'contents' },
  template: `
    <div role="status" aria-live="polite">
      <p
        class="inline-flex bg-rotulo py-1 ps-3 font-display text-lg font-bold tracking-wide
               text-on-rotulo uppercase corte-fin"
      >
        {{ cancha().nombre }} · {{ hora(bloque().inicio) }}–{{ hora(bloque().fin) }}
      </p>
      <p class="mt-1 text-sm text-muted-foreground">{{ diferencia() }}</p>
    </div>

    <div class="flex gap-2">
      <button type="button" class="boton boton-texto" (click)="soltar.emit()">Soltar</button>
      <button
        type="button"
        class="boton boton-primario"
        [disabled]="enviando()"
        (click)="confirmar.emit()"
      >
        {{ accion() }}
      </button>
    </div>
  `,
})
export class ResumenDelCambio {
  readonly cancha = input.required<Cancha>();
  readonly bloque = input.required<BloqueDisponible>();
  readonly pagadoClp = input.required<number>();
  readonly enviando = input(false);

  readonly soltar = output<void>();
  readonly confirmar = output<void>();

  /** Lo que vale la hora elegida. Sin precio no llega: la grilla no se la ofrece. */
  private readonly monto = computed(() => this.bloque().montoClp ?? 0);

  protected readonly diferencia = computed(() =>
    textoDeLaDiferencia(this.monto(), this.pagadoClp()),
  );

  /** "Pagar $4.000" lleva a Webpay; cualquier otro cambio se hace al tiro. */
  protected readonly accion = computed(() => {
    const falta = this.monto() - this.pagadoClp();

    return falta > 0 ? `Pagar ${enPesos(falta)}` : 'Cambiar a esta hora';
  });

  protected readonly hora = horaEnElClub;
}
