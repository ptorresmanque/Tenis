import { Component, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  diaEnPalabras,
  fechaEnElClub,
  horaEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { mensajeDeRechazo, ReservaMia, Reservas } from '../reservas.service';

/**
 * Las horas que el socio tiene tomadas, para moverlas o soltarlas.
 *
 * Las dos ventanas del club llegan resueltas desde la API (`sePuedeModificar` y
 * `devolucionAlCancelar`) y no se recalculan acá: si esta pantalla las decidiera,
 * cambiar el plazo en la configuración la dejaría prometiendo lo que el servidor
 * ya no hace.
 */
@Component({
  selector: 'app-mis-reservas',
  imports: [RouterLink],
  template: `
    <h1 class="font-display text-3xl font-bold">Mis reservas</h1>

    <div role="status" aria-live="polite" class="mt-4">
      @if (reservas.isLoading()) {
        <p class="text-muted-foreground">Buscando tus horas…</p>
      } @else if (reservas.error()) {
        <p class="text-destructive">
          No se pudieron cargar tus reservas. Reintenta en un momento.
        </p>
      } @else if (reservas.value().length === 0) {
        <p class="text-muted-foreground">
          No tienes horas tomadas.
          <a routerLink="/disponibilidad" class="font-medium underline">
            Mira la disponibilidad
          </a>
          para reservar una.
        </p>
      }

      @if (aviso(); as texto) {
        <p class="mt-2 rounded-lg bg-muted p-3 font-medium">{{ texto }}</p>
      }
    </div>

    <ul class="mt-6 space-y-4">
      @for (reserva of reservas.value(); track reserva.id) {
        <li class="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 class="font-display text-xl font-semibold">{{ reserva.cancha }}</h2>
          <p class="mt-1">
            {{ dia(reserva.inicio) }} ·
            {{ hora(reserva.inicio) }}–{{ hora(reserva.fin) }}
            @if (reserva.esPico) {
              <span class="text-sm text-muted-foreground">· Hora pico</span>
            }
          </p>
          <p class="mt-1 text-sm text-muted-foreground">
            Folio {{ reserva.folio }}
            @if (reserva.estado === 'PENDIENTE_PAGO') {
              · Esperando el pago
            }
          </p>

          @if (porCancelar() === reserva.id) {
            <!-- La confirmacion se abre en la propia tarjeta: es la consecuencia de
                 esta reserva y no de otra, y asi no hay que atrapar el foco. -->
            <p role="alert" class="mt-3 rounded-lg bg-muted p-3">
              {{ consecuencia(reserva) }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg bg-destructive px-4 py-2 font-semibold text-white disabled:opacity-60"
                [disabled]="enviando()"
                (click)="confirmarCancelacion(reserva)"
              >
                Sí, cancelar
              </button>
              <button
                type="button"
                class="rounded-lg px-4 py-2 font-medium"
                (click)="porCancelar.set(null)"
              >
                Mejor no
              </button>
            </div>
          } @else {
            @if (!reserva.sePuedeModificar) {
              <p class="mt-3 text-sm text-muted-foreground">
                Faltan menos de 6 horas: esta hora ya no se puede cambiar.
              </p>
            }

            <div class="mt-3 flex flex-wrap gap-2">
              @if (reserva.sePuedeModificar) {
                <a
                  routerLink="/disponibilidad"
                  [queryParams]="{ mover: reserva.id }"
                  class="rounded-lg bg-accent-strong px-4 py-2 font-semibold text-white"
                >
                  Cambiar la hora
                </a>
              }
              <button
                type="button"
                class="rounded-lg border border-border px-4 py-2 font-medium"
                (click)="porCancelar.set(reserva.id)"
              >
                Cancelar
              </button>
            </div>
          }
        </li>
      }
    </ul>
  `,
})
export class MisReservas {
  private readonly servicio = inject(Reservas);

  protected readonly reservas = resource({
    loader: () => this.servicio.mias(),
    defaultValue: [] as ReservaMia[],
  });

  /** Cuál está esperando confirmación de cancelación. */
  protected readonly porCancelar = signal<number | null>(null);
  protected readonly enviando = signal(false);
  protected readonly aviso = signal<string | null>(null);

  /**
   * Qué pasa si cancela, **dicho antes de que apriete**.
   *
   * La ventana de reembolso se mide contra el bloque que se compró y no contra el
   * reagendado, así que quien movió su hora puede estar fuera de plazo aunque la vea
   * lejos. Sin este aviso se entera cuando ya no hay vuelta atrás.
   */
  protected consecuencia(reserva: ReservaMia): string {
    if (!reserva.pagada) {
      return 'Tu hora vuelve a la grilla y recuperas el cupo del día.';
    }

    return reserva.devolucionAlCancelar
      ? 'Cancelamos la hora y te devolvemos lo que pagaste, al mismo medio de pago.'
      : // "La hora que compraste" y no "esta hora": si la reserva fue movida, el plazo
        // corre contra el bloque original, que puede estar mucho más cerca que el que
        // se ve en la tarjeta. Decir "faltan menos de 24 horas" a secas contradice lo
        // que la persona tiene delante.
        'La devolución necesita 24 horas de anticipación sobre la hora que ' +
          'compraste, y ese plazo ya pasó: pierdes lo que pagaste.';
  }

  protected async confirmarCancelacion(reserva: ReservaMia): Promise<void> {
    this.enviando.set(true);
    this.aviso.set(null);

    try {
      const resultado = await this.servicio.cancelar(reserva.id);

      // Se saca de la lista en vez de recargarla: el servidor ya dijo que quedó
      // cancelada, y una consulta más solo agrega una espera.
      this.reservas.value.update((lista) =>
        lista.filter((otra) => otra.id !== reserva.id),
      );
      this.porCancelar.set(null);
      this.aviso.set(
        resultado.huboDevolucion
          ? `Cancelamos la reserva ${resultado.folio} y la devolución ya está en camino.`
          : `Cancelamos la reserva ${resultado.folio}.`,
      );
    } catch (falla) {
      const rechazo = mensajeDeRechazo(falla);

      this.aviso.set(
        rechazo.motivo === 'ERROR'
          ? 'No se pudo cancelar la reserva. Reintenta en un momento.'
          : rechazo.mensaje,
      );
    } finally {
      this.enviando.set(false);
    }
  }

  protected readonly hora = horaEnElClub;
  protected dia(instante: string): string {
    return diaEnPalabras(fechaEnElClub(instante));
  }
}
