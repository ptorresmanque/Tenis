import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

export interface DatosDeConfirmacion {
  /** La pregunta concreta, que es el título: «¿Borrar esta observación?» y no «¿Seguro?». */
  titulo: string;
  /** Lo que pasa si se confirma, cuando el título no lo dice solo. */
  detalle?: string;
  /** El botón que confirma: «Sí, borrar». */
  confirmar: string;
  /** Si confirmar borra o quita algo: el botón va en rojo. */
  peligro?: boolean;
}

/**
 * La pregunta que reemplaza a `window.confirm` (T253, A8): un MatDialog con la pregunta como
 * título y dos acciones. Descartar dice «Mejor no» y no «Cancelar», que en «¿Cancelar la clase?»
 * sería ambiguo.
 */
@Component({
  selector: 'app-dialogo-de-confirmacion',
  imports: [MatDialogModule, MatButton],
  template: `
    <h2 mat-dialog-title>{{ datos.titulo }}</h2>
    @if (datos.detalle) {
      <mat-dialog-content>
        <p class="max-w-prose text-sm text-muted-foreground">{{ datos.detalle }}</p>
      </mat-dialog-content>
    }
    <mat-dialog-actions>
      <button matButton type="button" [mat-dialog-close]="false">Mejor no</button>
      <button
        matButton="filled"
        type="button"
        [class.peligro]="datos.peligro"
        [mat-dialog-close]="true"
      >
        {{ datos.confirmar }}
      </button>
    </mat-dialog-actions>
  `,
})
export class DialogoDeConfirmacion {
  protected readonly datos = inject<DatosDeConfirmacion>(MAT_DIALOG_DATA);
}

/** Pregunta y espera: true si se confirma; false si se descarta, con Escape o con el fondo. */
export async function confirmar(dialogos: MatDialog, datos: DatosDeConfirmacion): Promise<boolean> {
  const ref = dialogos.open<DialogoDeConfirmacion, DatosDeConfirmacion, boolean>(
    DialogoDeConfirmacion,
    { data: datos, width: '28rem', maxWidth: '92vw' },
  );

  return (await firstValueFrom(ref.afterClosed())) === true;
}
