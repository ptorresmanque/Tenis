import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

/** Los motivos que la API manda en la redirección, en castellano. */
const MOTIVOS: Record<string, string> = {
  anulado: 'Anulaste el pago en Webpay, así que la hora volvió a estar disponible.',
  token_desconocido:
    'No pudimos reconocer ese pago. Si te cobraron, escribe al club con la hora y el día.',
  sin_token: 'El pago no se completó y la hora volvió a estar disponible.',
  rechazada: 'El pago fue rechazado y la hora volvió a estar disponible.',
};

/**
 * Donde aterriza quien vuelve de la pasarela.
 *
 * Es una página y no un cartel dentro de la grilla porque Webpay devuelve el
 * navegador con una recarga completa: cualquier estado que hubiera en memoria ya no
 * está, y lo único que sobrevive es lo que viene en la URL.
 */
@Component({
  selector: 'app-confirmacion-reserva',
  imports: [RouterLink],
  template: `
    <section class="mx-auto max-w-md py-10 text-center">
      @if (folio() && !error()) {
        <p class="text-5xl" aria-hidden="true">🎾</p>
        <h1 class="mt-3 font-display text-3xl font-bold">Reserva confirmada</h1>
        <p class="mt-2 text-muted-foreground">
          Tu hora quedó tomada. Muestra este folio en el club.
        </p>

        <p class="mt-6 text-sm font-medium text-muted-foreground">Folio</p>
        <!-- Grande y separado: es lo que la persona va a dictar por teléfono. -->
        <p class="font-display text-4xl font-bold tracking-[0.2em]">{{ folio() }}</p>
      } @else {
        <h1 class="font-display text-3xl font-bold">La reserva no se completó</h1>
        <p class="mt-2 text-muted-foreground">{{ explicacion() }}</p>
      }

      <a
        routerLink="/disponibilidad"
        class="mt-8 inline-block rounded-lg bg-accent-strong px-4 py-2 font-semibold text-white"
      >
        Volver a la disponibilidad
      </a>
    </section>
  `,
})
export class ConfirmacionReserva {
  private readonly parametros = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly folio = computed(
    () => this.parametros()?.get('folio') ?? null,
  );
  protected readonly error = computed(
    () => this.parametros()?.get('error') ?? null,
  );

  protected readonly explicacion = computed(() => {
    const motivo = this.error();

    return (
      (motivo && MOTIVOS[motivo]) ??
      'El pago no se completó, así que la hora volvió a estar disponible.'
    );
  });
}
