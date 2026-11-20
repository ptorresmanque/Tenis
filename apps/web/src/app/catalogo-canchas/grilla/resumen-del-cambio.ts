import { Component, computed, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';

import { BloqueDisponible, Cancha } from '../disponibilidad';
import {
  diaCortoEnElClub,
  diaEnPalabras,
  enPesos,
  fechaEnElClub,
  horaEnElClub,
  mesCortoEnElClub,
} from '../reloj-del-club';
import { TARIFA_DEL_SOCIO } from './bandas';
import type { OrigenDelCambio } from './mover-reserva';

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
 * La barra de abajo cuando se cambia una reserva: desde el enlace, con lo que ya se pagó
 * (T91), o desde "mis reservas", el socio, que no paga (T104).
 *
 * El clic en la grilla marca la hora y esto la confirma. Desde el enlace el cambio tiene
 * plata en juego, y la diferencia —o lo que no se devuelve— se dice **antes** del botón
 * que lo hace. Al socio se le confirma igual: la celda elige un tipo de cancha y no una
 * cancha, y la barra es donde ve cuál quedó y la puede cambiar.
 *
 * **Con `rotulo`, está desde que empieza el modo mover** (T402, `SPEC-panel.md` § El modo mover a
 * la vista): dice qué reserva se modifica, la hora que tenía («Antes») y la nueva, que falta
 * elegir mientras no se toca una libre. Si quien la mueve se distrae, al volver sabe qué estaba
 * haciendo. Sin hora elegida, la salida es «Volver sin cambiar».
 *
 * `contents` en el host: sus dos bloques son hijos del flex de `app-barra-fija`, igual
 * que los de la barra de reservar.
 */
@Component({
  selector: 'app-resumen-del-cambio',
  imports: [MatButton],
  host: { class: 'contents' },
  template: `
    <div role="status" aria-live="polite" class="min-w-0">
      @if (rotulo(); as titulo) {
        <p
          class="inline-flex bg-rotulo py-1 ps-3 font-display text-lg font-bold tracking-wide
                 text-on-rotulo uppercase corte-fin"
        >
          {{ titulo }}
        </p>
        <!-- La que tenía y la nueva, con el día: la reserva se puede llevar a otro día. Corto a la
             vista y completo para el lector, como en la línea de lo elegido (N4). -->
        <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-sm">
          @if (antes(); as laQueTenia) {
            <dt class="font-semibold">Antes</dt>
            <dd>
              <span aria-hidden="true">{{ corto(laQueTenia.cancha, laQueTenia) }}</span>
              <span class="sr-only">{{ largo(laQueTenia.cancha, laQueTenia) }}</span>
            </dd>
          }
          <dt class="font-semibold">Nueva</dt>
          <dd>
            @if (laNueva(); as nueva) {
              <span aria-hidden="true">{{ corto(nueva.cancha, nueva) }}</span>
              <span class="sr-only">{{ largo(nueva.cancha, nueva) }}</span>
            } @else {
              <span class="text-muted-foreground">elige una hora en el tablero</span>
            }
          </dd>
        </dl>
        @if (laNueva() && diferencia()) {
          <p class="mt-1 text-sm text-muted-foreground">{{ diferencia() }}</p>
        }
      } @else if (laNueva(); as nueva) {
        <p
          class="inline-flex bg-rotulo py-1 ps-3 font-display text-lg font-bold tracking-wide
                 text-on-rotulo uppercase corte-fin"
        >
          {{ nueva.cancha }} · {{ hora(nueva.inicio) }}–{{ hora(nueva.fin) }}
        </p>
        <p class="mt-1 text-sm text-muted-foreground">{{ diferencia() }}</p>
      }
    </div>

    <div class="flex gap-2">
      @if (laNueva()) {
        <button matButton type="button" (click)="soltar.emit()">Soltar</button>
        <button
          matButton="filled"
          type="button"
          [disabled]="enviando()"
          [attr.aria-busy]="enviando()"
          (click)="confirmar.emit()"
        >
          {{ accion() }}
        </button>
      } @else {
        <!-- Sin hora elegida no hay nada que confirmar: la única salida es dejarla donde estaba. -->
        <button matButton="outlined" type="button" (click)="volver.emit()">Volver sin cambiar</button>
      }
    </div>
  `,
})
export class ResumenDelCambio {
  /** La hora elegida en el tablero; nula mientras no se elige (T402). */
  readonly cancha = input<Cancha | null>(null);
  readonly bloque = input<BloqueDisponible | null>(null);
  /** Lo que pagó por el enlace; nulo si quien cambia es el socio, que no paga. */
  readonly pagadoClp = input.required<number | null>();
  /**
   * Lo que dice debajo de la hora, en vez de la diferencia: en el panel, nada (`''`), porque el club
   * mueve sin cobrar ni devolver y el rótulo ya dice de quién es. Sin esto, al visitante le diría
   * «Socio sin costo».
   */
  readonly detalle = input<string | null>(null);
  readonly enviando = input(false);
  /** Qué se modifica: «Modificando · Reserva de X» o «Cambiando tu reserva». Con él, el modo mover. */
  readonly rotulo = input<string | null>(null);
  /** La hora que tenía la reserva (T401): lo que dice «Antes». */
  readonly antes = input<OrigenDelCambio | null>(null);

  readonly soltar = output<void>();
  readonly confirmar = output<void>();
  /** «Volver sin cambiar», sin hora elegida: quien la usa sale del modo mover. */
  readonly volver = output<void>();

  /** La hora elegida, con el nombre de su cancha; nula mientras no se elige. */
  protected readonly laNueva = computed(() => {
    const cancha = this.cancha();
    const bloque = this.bloque();
    return cancha && bloque ? { cancha: cancha.nombre, inicio: bloque.inicio, fin: bloque.fin } : null;
  });

  /** Lo que vale la hora elegida. Sin precio solo le llega al socio, que no paga. */
  private readonly monto = computed(() => this.bloque()?.montoClp ?? 0);

  protected readonly diferencia = computed(() => {
    const pagado = this.pagadoClp();
    const detalle = this.detalle();

    if (detalle !== null) return detalle;
    return pagado === null
      ? `Socio ${TARIFA_DEL_SOCIO}.`
      : textoDeLaDiferencia(this.monto(), pagado);
  });

  /** "Pagar $4.000" lleva a Webpay; cualquier otro cambio se hace al tiro. */
  protected readonly accion = computed(() => {
    const pagado = this.pagadoClp();
    const falta = pagado === null ? 0 : this.monto() - pagado;

    return falta > 0 ? `Pagar ${enPesos(falta)}` : 'Cambiar a esta hora';
  });

  /** «Cancha 2 · Lun 17 ago · 08:30–09:30», a la vista. */
  protected corto(cancha: string, { inicio, fin }: { inicio: string; fin: string }): string {
    const dia = `${diaCortoEnElClub(inicio)} ${Number(fechaEnElClub(inicio).slice(8, 10))} ${mesCortoEnElClub(inicio)}`;
    return `${cancha} · ${dia} · ${horaEnElClub(inicio)}–${horaEnElClub(fin)}`;
  }

  /** «Cancha 2, lunes, 17 de agosto, de 08:30 a 09:30», para el lector: «Lun» no se lee bien. */
  protected largo(cancha: string, { inicio, fin }: { inicio: string; fin: string }): string {
    return (
      `${cancha}, ${diaEnPalabras(fechaEnElClub(inicio))}, de ${horaEnElClub(inicio)} a ` +
      horaEnElClub(fin)
    );
  }

  protected readonly hora = horaEnElClub;
}
