import { Component, inject, Signal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { mensajeDelServidor } from '../../core/errores';
import { SocioDelClub } from '../../identidad/admin/socios.service';
import { errorDelCampo, proveerCampos } from '../../ui/campos';
import { TelefonoDirective } from '../../ui/telefono';
import { Jugador, Torneos } from '../torneos.service';

/**
 * Los socios que se pueden anotar: los que todavía no tienen jugador. Una señal y no la lista:
 * si el diálogo se abre antes de que carguen, aparecen cuando llegan.
 */
export interface DatosParaAnotar {
  socios: Signal<SocioDelClub[]>;
}

/**
 * Anotar un jugador (T292, SPEC-panel.md D9): un diálogo que abre el FAB «Anotar jugador». Antes
 * era un formulario fijo arriba de la lista, a la vista aunque nadie fuera a anotar a nadie.
 *
 * **Un socio o alguien de afuera**: al socio se lo elige de su ficha, y al de afuera se lo
 * escribe una vez y queda para el torneo siguiente. Los socios llegan de la lista, que ya sabe
 * cuáles tienen jugador: elegir uno que ya lo tiene sería anotarlo dos veces.
 *
 * Anota él mismo, así el error del servidor se dice acá, con lo elegido. Se cierra con el
 * jugador anotado.
 */
@Component({
  selector: 'app-anotar-jugador',
  imports: [
    MatDialogModule,
    MatButton,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInput,
    MatSelectModule,
    FormsModule,
    TelefonoDirective,
  ],
  providers: [proveerCampos()],
  template: `
    <!-- El título va dentro del formulario y el formulario no tiene caja: así título y contenido
         son hermanos, y Material le quita al contenido el relleno de arriba (como el motivo). -->
    <form class="contents" (ngSubmit)="anotar()">
      <h2 mat-dialog-title>Anotar un jugador</h2>

      <mat-dialog-content>
        <mat-button-toggle-group
          aria-label="A quién se anota"
          hideSingleSelectionIndicator
          [value]="tipo()"
          (change)="tipo.set($event.value)"
        >
          @for (opcion of TIPOS; track opcion.valor) {
            <mat-button-toggle [value]="opcion.valor">{{ opcion.etiqueta }}</mat-button-toggle>
          }
        </mat-button-toggle-group>

        <div class="mt-4 grid gap-3">
          @if (tipo() === 'socio') {
            <mat-form-field>
              <mat-label>Socio</mat-label>
              <mat-select name="socioId" [(ngModel)]="socioId">
                <mat-option [value]="0" disabled>Elige un socio</mat-option>
                @for (socio of datos.socios(); track socio.id) {
                  <mat-option [value]="socio.id">
                    {{ socio.numeroSocio }} · {{ socio.usuario.nombre }}
                    {{ socio.usuario.apellido }}
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>
          } @else {
            <mat-form-field>
              <mat-label>Nombre</mat-label>
              <input matInput name="nombre" autocomplete="off" [(ngModel)]="externo.nombre" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Apellido</mat-label>
              <input matInput name="apellido" autocomplete="off" [(ngModel)]="externo.apellido" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Teléfono</mat-label>
              <span matTextPrefix>+56&nbsp;</span>
              <input
                matInput
                appTelefono
                #telefono="ngModel"
                name="telefono"
                [(ngModel)]="externo.telefono"
              />
              <mat-error>{{ errorDelCampo(telefono.control) }}</mat-error>
            </mat-form-field>
          }

          <!-- El del servidor: dice si ese socio ya juega con otro nombre, que es lo que el club
               necesita saber para decidir con cuál se queda. -->
          <p aria-live="polite" class="text-sm text-destructive">{{ error() }}</p>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions>
        <!-- Mientras anota no se cierra (tampoco con Escape ni el fondo): quedaría anotado sin
             que la lista se relea ni lo avise. -->
        <button matButton type="button" mat-dialog-close [disabled]="guardando()">
          Cancelar
        </button>
        <button
          matButton="filled"
          type="submit"
          [disabled]="guardando()"
          [attr.aria-busy]="guardando()"
        >
          Anotar
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class AnotarJugador {
  protected readonly errorDelCampo = errorDelCampo;

  private readonly api = inject(Torneos);
  private readonly ref = inject<MatDialogRef<AnotarJugador, Jugador>>(MatDialogRef);
  protected readonly datos = inject<DatosParaAnotar>(MAT_DIALOG_DATA);

  protected readonly TIPOS = [
    { valor: 'socio', etiqueta: 'Un socio' },
    { valor: 'externo', etiqueta: 'Alguien de afuera' },
  ];

  protected readonly tipo = signal('socio');
  protected socioId = 0;
  protected readonly externo = { nombre: '', apellido: '', telefono: '' };

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async anotar(): Promise<void> {
    this.error.set(null);
    this.guardando.set(true);
    this.ref.disableClose = true;
    try {
      this.ref.close(
        await this.api.crearJugador(
          this.tipo() === 'socio' ? { socioId: Number(this.socioId) } : { ...this.externo },
        ),
      );
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo anotar al jugador.'));
    } finally {
      this.guardando.set(false);
      this.ref.disableClose = false;
    }
  }
}
