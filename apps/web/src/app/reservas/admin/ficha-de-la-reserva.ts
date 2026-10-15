import { Component, input, output, TemplateRef, viewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';

import { horaEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { EnlaceTelefonoPipe, TelefonoPipe } from '../../core/telefono';
import { dialogoSegun } from '../../ui/dialogo';
import { ReservaDelDia } from './agenda.service';
import { ObservacionesDeReserva } from './observaciones-de-reserva';

/**
 * La ficha de una reserva de la agenda (T271): lo que antes decía su tarjeta en la lista
 * —la hora, la cancha, de quién es, cómo llamarlo, con quién juega, si espera el pago— y
 * las observaciones del mesón (T226). El tablero dice de quién es cada hora; esto, todo
 * lo demás.
 *
 * Es todo un diálogo, como «Nueva reserva»: se abre al crearse y avisa al cerrarse.
 */
@Component({
  selector: 'app-ficha-de-la-reserva',
  imports: [
    MatButton,
    MatChipsModule,
    MatDialogModule,
    MatIcon,
    EnlaceTelefonoPipe,
    ObservacionesDeReserva,
    TelefonoPipe,
  ],
  template: `
    <ng-template #dialogo>
      @let laReserva = reserva();
      <h2 mat-dialog-title>Reserva de {{ laReserva.nombre }}</h2>
      <mat-dialog-content>
        <p class="font-display text-lg font-semibold">
          {{ hora(laReserva.inicio) }}–{{ hora(laReserva.fin) }} · {{ laReserva.cancha }}
        </p>
        <p class="text-sm text-muted-foreground">
          {{ laReserva.esSocio ? 'Socio' : 'Visitante' }} · Folio {{ laReserva.folio }}
        </p>

        <p class="mt-3">
          {{ laReserva.nombre }}
          @if (laReserva.telefono) {
            <!-- Enlace y no texto suelto: en el teléfono del mesón se toca y llama, que es
                 exactamente para lo que está. -->
            <a class="underline" [href]="laReserva.telefono | enlaceTelefono">
              {{ laReserva.telefono | telefono }}
            </a>
          }
        </p>

        @if (laReserva.acompanantes.length > 0) {
          <p class="mt-1 text-sm text-muted-foreground">
            Con {{ laReserva.acompanantes.join(', ') }}
          </p>
        }

        @if (laReserva.estado === 'PENDIENTE_PAGO') {
          <!-- Ocupa la cancha pero puede caerse: se dice con palabras, no solo con color. -->
          <mat-chip-set class="insignias mt-2">
            <mat-chip class="insignia aviso">
              <mat-icon matChipAvatar aria-hidden="true">schedule</mat-icon>
              Esperando el pago
            </mat-chip>
          </mat-chip-set>
        }

        <!-- Las notas del mesón (T226): las ven el admin y el gestor, nunca el socio. -->
        <app-observaciones-de-reserva [reserva]="laReserva" (cambio)="cambio.emit()" />
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cerrar</button>
      </mat-dialog-actions>
    </ng-template>
  `,
})
export class FichaDeLaReserva {
  readonly reserva = input.required<ReservaDelDia>();

  /** Se cerró: con Escape, el fondo o «Cerrar». */
  readonly cerrar = output<void>();
  /** Se anotó, corrigió o borró una observación: el día se vuelve a pedir. */
  readonly cambio = output<void>();

  private readonly dialogo = viewChild.required<TemplateRef<unknown>>('dialogo');

  constructor() {
    dialogoSegun(
      () => true,
      this.dialogo,
      () => this.cerrar.emit(),
      {
        width: '32rem',
        maxWidth: '92vw',
      },
    );
  }

  protected readonly hora = horaEnElClub;
}
