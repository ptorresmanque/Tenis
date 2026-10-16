import { Component, computed, inject, input, resource } from '@angular/core';

import { diaEnPalabras, fechaEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { Esqueleto } from '../../ui/esqueleto';
import { Agenda } from './agenda.service';

/**
 * Las observaciones de un socio, de la reserva más nueva a la más vieja (T226). La usan la
 * agenda —"2 observaciones anteriores"— y la ficha del socio, que las muestra todas.
 */
@Component({
  selector: 'app-historial-de-observaciones',
  imports: [Esqueleto],
  template: `
    @if (historial.error()) {
      <p class="text-sm text-destructive">
        No se pudieron cargar las observaciones. Reintenta en un momento.
      </p>
    } @else if (historial.hasValue()) {
      @if (filas().length === 0) {
        <p class="text-sm text-muted-foreground">Sin observaciones.</p>
      } @else {
        <ul class="grid gap-2 text-sm">
          @for (observacion of filas(); track observacion.id) {
            <li class="rounded-lg bg-muted p-2">
              <span class="block font-medium">
                {{ dia(observacion.inicio) }} · {{ observacion.cancha }}
              </span>
              {{ observacion.texto }}
              <span class="block text-muted-foreground">{{ observacion.autorNombre }}</span>
            </li>
          }
        </ul>
      }
    } @else {
      <app-esqueleto compacto etiqueta="Cargando las observaciones…" />
    }
  `,
})
export class HistorialDeObservaciones {
  private readonly agenda = inject(Agenda);

  readonly socioId = input.required<number>();
  /** La reserva que se está mirando: sus notas ya están a la vista, no se repiten. */
  readonly excluirReservaId = input<number | null>(null);

  protected readonly historial = resource({
    params: () => ({ socioId: this.socioId() }),
    loader: ({ params }) => this.agenda.historial(params.socioId),
  });

  protected readonly filas = computed(() =>
    (this.historial.hasValue() ? this.historial.value() : []).filter(
      (observacion) => observacion.reservaId !== this.excluirReservaId(),
    ),
  );

  protected dia(instante: string): string {
    return diaEnPalabras(fechaEnElClub(instante));
  }
}
