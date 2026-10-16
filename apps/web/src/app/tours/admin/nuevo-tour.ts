import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { mensajeDelServidor } from '../../core/errores';
import { proveerCampos } from '../../ui/campos';
import { Tours } from '../tours.service';

/**
 * El alta de un tour (T292, SPEC-panel.md D9): un diálogo que abre el FAB «Nuevo tour». Antes
 * era un formulario que se desplegaba en la página con un botón «Crear tour / Cerrar».
 *
 * **Solo el nombre**, como desde T191: la descripción, la imagen, las temporadas y la galería se
 * completan en la ficha, adonde lleva el tour recién creado. Crea el tour él mismo, así el
 * nombre repetido se dice acá, con lo escrito. Se cierra con el id del tour creado.
 */
@Component({
  selector: 'app-nuevo-tour',
  imports: [MatDialogModule, MatButton, MatFormFieldModule, MatInput, FormsModule],
  providers: [proveerCampos()],
  template: `
    <!-- El título va dentro del formulario y el formulario no tiene caja: así título y contenido
         son hermanos, y Material le quita al contenido el relleno de arriba (como el motivo). -->
    <form class="contents" (ngSubmit)="crear()">
      <h2 mat-dialog-title>Nuevo tour</h2>

      <mat-dialog-content>
        <mat-form-field class="w-full">
          <mat-label>Nombre</mat-label>
          <input
            matInput
            name="nombre"
            maxlength="80"
            placeholder="Tour FEDAL"
            autocomplete="off"
            [(ngModel)]="nombre"
          />
        </mat-form-field>
        <p aria-live="polite" class="text-sm text-destructive">{{ error() }}</p>
      </mat-dialog-content>

      <mat-dialog-actions>
        <!-- Mientras crea no se cierra (tampoco con Escape ni el fondo): el tour quedaría
             creado sin llevar a su ficha. -->
        <button matButton type="button" mat-dialog-close [disabled]="guardando()">
          Cancelar
        </button>
        <button
          matButton="filled"
          type="submit"
          [disabled]="guardando() || !nombre.trim()"
          [attr.aria-busy]="guardando()"
        >
          Crear el tour
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class NuevoTour {
  private readonly api = inject(Tours);
  private readonly ref = inject<MatDialogRef<NuevoTour, number>>(MatDialogRef);

  protected nombre = '';
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async crear(): Promise<void> {
    if (!this.nombre.trim()) return;

    this.error.set(null);
    this.guardando.set(true);
    this.ref.disableClose = true;
    try {
      const tour = await this.api.crear(this.nombre.trim());
      this.ref.close(tour.id);
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo crear el tour.'));
    } finally {
      this.guardando.set(false);
      this.ref.disableClose = false;
    }
  }
}
