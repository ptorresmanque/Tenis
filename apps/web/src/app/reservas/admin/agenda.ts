import { Component, DestroyRef, inject, resource, signal } from '@angular/core';

import {
  diaEnPalabras,
  horaEnElClub,
  hoyEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { Agenda, ReservaDelDia } from './agenda.service';

/**
 * El día del club, para quien atiende el mesón.
 *
 * **Se repuebla sola cuando entra una reserva** (`SPEC.md` § Success Criteria 2): el
 * servidor avisa por Server-Sent Events y la pantalla vuelve a pedir el día. El aviso
 * trae solo la fecha, así que lo que se muestra sale siempre de la misma consulta y no
 * de un evento que podría traer una versión distinta.
 */
@Component({
  selector: 'app-agenda-del-dia',
  template: `
    <h1 class="font-display text-3xl font-bold">Reservas del día</h1>

    <div class="mt-4 flex flex-wrap items-end gap-4">
      <div>
        <label for="fecha" class="block text-sm font-medium">Día</label>
        <input
          id="fecha"
          type="date"
          class="mt-1 rounded-lg border border-border bg-card px-3 py-2"
          [value]="fechaActual()"
          (change)="cambiarFecha($event)"
        />
      </div>

      <p class="text-muted-foreground">{{ enPalabras(fechaActual()) }}</p>
    </div>

    <div role="status" aria-live="polite" class="mt-6">
      @if (reservas.isLoading()) {
        <p class="text-muted-foreground">Buscando las reservas del día…</p>
      } @else if (reservas.error()) {
        <p class="text-destructive">
          No se pudo cargar la agenda. Reintenta en un momento.
        </p>
      } @else if (reservas.value().length === 0) {
        <p class="text-muted-foreground">No hay reservas para este día.</p>
      } @else {
        <!-- Lo anuncia para quien no ve la tabla: es la misma región que cambia
             sola cuando entra una reserva nueva. -->
        <p class="sr-only">{{ resumen() }}</p>
      }
    </div>

    @if (reservas.value().length > 0) {
      <ul class="mt-4 space-y-3">
        @for (reserva of reservas.value(); track reserva.id) {
          <li
            class="rounded-xl border border-border bg-card p-4 shadow-sm"
            [class.border-dashed]="reserva.estado === 'PENDIENTE_PAGO'"
          >
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p class="font-display text-lg font-semibold">
                {{ hora(reserva.inicio) }}–{{ hora(reserva.fin) }}
              </p>
              <p class="font-medium">{{ reserva.cancha }}</p>
              <p class="text-sm text-muted-foreground">
                {{ reserva.esSocio ? 'Socio' : 'Visitante' }} · Folio
                {{ reserva.folio }}
              </p>
            </div>

            <p class="mt-1">
              {{ reserva.nombre }}
              @if (reserva.telefono) {
                <!-- Enlace y no texto suelto: en el teléfono del mesón se toca y
                     llama, que es exactamente para lo que está. -->
                <a class="underline" href="tel:{{ reserva.telefono }}">
                  {{ reserva.telefono }}
                </a>
              }
            </p>

            @if (reserva.acompanantes.length > 0) {
              <p class="mt-1 text-sm text-muted-foreground">
                Con {{ reserva.acompanantes.join(', ') }}
              </p>
            }

            @if (reserva.estado === 'PENDIENTE_PAGO') {
              <!-- Texto y borde punteado, no solo un color: ocupa la cancha pero
                   puede caerse, y esa diferencia hay que poder leerla. -->
              <p class="mt-1 text-sm font-medium text-muted-foreground">
                Esperando el pago
              </p>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class AgendaDelDia {
  private readonly agenda = inject(Agenda);

  readonly fechaActual = signal(hoyEnElClub());

  protected readonly reservas = resource({
    params: () => ({ fecha: this.fechaActual(), recarga: this.recargas() }),
    loader: ({ params }) => this.agenda.delDia(params.fecha),
    defaultValue: [] as ReservaDelDia[],
  });

  /** Cambia con cada aviso del servidor y así vuelve a disparar el `resource`. */
  private readonly recargas = signal(0);

  constructor() {
    const suscripcion = this.agenda.avisos.subscribe((aviso) => {
      // Solo el día que se está mirando: quien revisa el sábado no quiere que la
      // pantalla se le repueble porque entró una reserva para el martes.
      if (aviso.fecha === this.fechaActual()) {
        this.recargas.update((veces) => veces + 1);
      }
    });

    // Cierra el canal al salir de la pantalla; si no, queda una conexión abierta por
    // cada vez que se entró.
    inject(DestroyRef).onDestroy(() => suscripcion.unsubscribe());
  }

  protected readonly resumen = () => {
    const total = this.reservas.value().length;

    return `${total} ${total === 1 ? 'reserva' : 'reservas'} este día.`;
  };

  protected cambiarFecha(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;

    if (valor) this.fechaActual.set(valor);
  }

  protected readonly hora = horaEnElClub;
  protected readonly enPalabras = diaEnPalabras;
}
