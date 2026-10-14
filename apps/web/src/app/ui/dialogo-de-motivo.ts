import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';

import { proveerCampos } from './campos';

export interface DatosDeMotivo {
  /** La pregunta concreta, que es el título: «¿Cancelar la clase de Ana Silva?». */
  titulo: string;
  /** Lo que conviene saber antes de escribir el motivo. */
  detalle?: string;
  /** La etiqueta del campo: «Por qué se cancela». */
  etiqueta: string;
  /** El botón que confirma: «Cancelar la clase». */
  confirmar: string;
  /** Si confirmar cancela o anula algo: el botón va en rojo. Condonar, por ejemplo, no. */
  peligro?: boolean;
}

/**
 * El motivo que reemplaza a `window.prompt` (T253, A8): un MatDialog con la pregunta como título
 * y el campo obligatorio. Sin motivo no deja confirmar, y descartar no hace nada.
 */
@Component({
  selector: 'app-dialogo-de-motivo',
  imports: [MatDialogModule, MatButton, MatFormFieldModule, MatInput, FormsModule],
  providers: [proveerCampos()],
  template: `
    <!-- El título va dentro del formulario y el formulario no tiene caja: así título y contenido
         son hermanos, y Material le quita al contenido el relleno de arriba. -->
    <form class="contents" (ngSubmit)="confirmar()">
      <h2 mat-dialog-title>{{ datos.titulo }}</h2>
      <mat-dialog-content>
        @if (datos.detalle) {
          <p class="mb-3 max-w-prose text-sm text-muted-foreground">{{ datos.detalle }}</p>
        }
        <mat-form-field>
          <mat-label>{{ datos.etiqueta }}</mat-label>
          <input
            matInput
            name="motivo"
            required
            autocomplete="off"
            [ngModel]="motivo()"
            (ngModelChange)="motivo.set($event)"
          />
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions>
        <button matButton type="button" mat-dialog-close>Mejor no</button>
        <button
          matButton="filled"
          type="submit"
          [class.peligro]="datos.peligro"
          [disabled]="!motivo().trim()"
        >
          {{ datos.confirmar }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class DialogoDeMotivo {
  protected readonly datos = inject<DatosDeMotivo>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<DialogoDeMotivo, string>>(MatDialogRef);

  protected readonly motivo = signal('');

  protected confirmar(): void {
    const motivo = this.motivo().trim();
    if (motivo) this.ref.close(motivo);
  }
}

/** Pide el motivo y espera: el texto escrito, o null si se descarta, con Escape o con el fondo. */
export async function pedirMotivo(
  dialogos: MatDialog,
  datos: DatosDeMotivo,
): Promise<string | null> {
  const ref = dialogos.open<DialogoDeMotivo, DatosDeMotivo, string>(DialogoDeMotivo, {
    data: datos,
    width: '28rem',
    maxWidth: '92vw',
  });

  // «Mejor no» cierra con texto vacío: un motivo de verdad nunca lo es.
  return (await firstValueFrom(ref.afterClosed())) || null;
}
