import { Component, input, output, TemplateRef, viewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

import { dialogoSegun } from '../../ui/dialogo';
import { CuotaDelSocio } from './cuota-del-socio';
import { SocioDelClub } from './socios.service';

/**
 * La ficha de un socio en el padrón: `CuotaDelSocio` dentro de un MatDialog (T252), que
 * atrapa el foco, vuelve inerte el resto del panel y lo devuelve al botón «Ver ficha».
 *
 * Desde T298 el contenido vive en `CuotaDelSocio`, la pestaña «Cuota» de Personas. Este
 * envoltorio se va con el padrón en T299.
 */
@Component({
  selector: 'app-ficha-socio',
  imports: [MatDialogModule, MatButton, CuotaDelSocio],
  template: `
    <ng-template #dialogo>
      <h2 mat-dialog-title>{{ socio().usuario.nombre }} {{ socio().usuario.apellido }}</h2>
      <mat-dialog-content>
        <p class="mb-4 text-sm text-muted-foreground">{{ socio().usuario.email }}</p>
        <app-cuota-del-socio [socio]="socio()" (guardado)="guardado.emit()" />
      </mat-dialog-content>
      <mat-dialog-actions>
        <button matButton type="button" mat-dialog-close>Cancelar</button>
      </mat-dialog-actions>
    </ng-template>
  `,
})
export class FichaSocio {
  readonly socio = input.required<SocioDelClub>();

  /** Se guardó algo: el panel recarga su lista. */
  readonly guardado = output<void>();
  readonly cerrado = output<void>();

  private readonly dialogo = viewChild.required<TemplateRef<unknown>>('dialogo');

  constructor() {
    // Abierta mientras exista: el panel la quita con su @if cuando avisa que se cerró.
    dialogoSegun(() => true, this.dialogo, () => this.cerrado.emit(), {
      width: '34rem',
      maxWidth: '92vw',
    });
  }
}
