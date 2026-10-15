import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { mensajeDelServidor } from '../../core/errores';
import { proveerCampos } from '../../ui/campos';
import { SUPERFICIES } from '../superficies';
import { AdminCanchas, CanchaAdmin, CanchaNueva } from './admin-canchas.service';

/**
 * El alta de una cancha (T289, SPEC-panel.md D1 y A8): un diálogo que abre el FAB «Nueva
 * cancha». Antes era una sección de la página, entre las reglas del club y la lista, y quedaba
 * a la vista todo el año para algo que el club hace una vez.
 *
 * Crea la cancha él mismo, y no quien lo abre: así un error del servidor («Ya hay una cancha con
 * ese nombre») se ve en el diálogo, que sigue abierto con lo escrito. Se cierra con la cancha
 * creada, o sin nada si se descarta.
 */
@Component({
  selector: 'app-nueva-cancha',
  imports: [
    MatDialogModule,
    MatButton,
    MatCheckbox,
    MatFormFieldModule,
    MatInput,
    MatSelectModule,
    FormsModule,
  ],
  providers: [proveerCampos()],
  template: `
    <!-- El título va dentro del formulario y el formulario no tiene caja: así título y contenido
         son hermanos, y Material le quita al contenido el relleno de arriba (como el motivo). -->
    <form class="contents" (ngSubmit)="agregar()">
      <h2 mat-dialog-title>Nueva cancha</h2>

      <mat-dialog-content>
        <div class="grid gap-3">
          <mat-form-field>
            <mat-label>Nombre</mat-label>
            <input
              matInput
              id="nombre"
              name="nombre"
              required
              autocomplete="off"
              [attr.aria-invalid]="error() ? true : null"
              aria-describedby="error-nueva-cancha"
              [(ngModel)]="nueva.nombre"
            />
          </mat-form-field>

          <mat-form-field>
            <mat-label>Superficie</mat-label>
            <mat-select id="superficie" name="superficie" [(ngModel)]="nueva.superficie">
              @for (opcion of superficies; track opcion[0]) {
                <mat-option [value]="opcion[0]">{{ opcion[1] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-checkbox class="block text-sm" name="techada" [(ngModel)]="nueva.techada">
            Techada
          </mat-checkbox>

          <mat-checkbox class="block text-sm" name="tieneCamara" [(ngModel)]="nueva.tieneCamara">
            Con cámara
            <span class="text-muted-foreground">
              — solo desde estas se pueden transmitir los partidos
            </span>
          </mat-checkbox>

          <mat-checkbox class="block text-sm" name="iluminacion" [(ngModel)]="nueva.iluminacion">
            Con iluminación
          </mat-checkbox>

          <!-- Junto al formulario: el nombre repetido es lo que hay que corregir, y el diálogo
               sigue abierto para hacerlo. -->
          <p id="error-nueva-cancha" aria-live="polite" class="text-sm text-destructive">
            {{ error() }}
          </p>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions>
        <!-- Mientras guarda no se cierra (tampoco con Escape ni el fondo): la cancha quedaría
             creada sin que la lista se relea ni lo avise. -->
        <button matButton type="button" mat-dialog-close [disabled]="guardando()">
          Cancelar
        </button>
        <button
          matButton="filled"
          type="submit"
          [disabled]="guardando()"
          [attr.aria-busy]="guardando()"
        >
          Agregar
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class NuevaCancha {
  private readonly api = inject(AdminCanchas);
  private readonly ref = inject<MatDialogRef<NuevaCancha, CanchaAdmin>>(MatDialogRef);

  /** Las opciones del `select`, en el orden en que están escritas en la tabla. */
  protected readonly superficies = Object.entries(SUPERFICIES);
  protected readonly nueva: CanchaNueva = {
    nombre: '',
    superficie: 'CEMENTO',
    techada: false,
    tieneCamara: false,
    iluminacion: false,
  };

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async agregar(): Promise<void> {
    this.error.set(null);

    if (!this.nueva.nombre.trim()) {
      this.error.set('Ponle un nombre a la cancha.');
      return;
    }

    this.guardando.set(true);
    this.ref.disableClose = true;
    try {
      this.ref.close(await this.api.crear({ ...this.nueva }));
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    } finally {
      this.guardando.set(false);
      this.ref.disableClose = false;
    }
  }
}
