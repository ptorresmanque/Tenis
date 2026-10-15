import { Component, computed, inject, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar } from '@angular/material/snack-bar';

import { mensajeDelServidor } from '../../../core/errores';
import { Aviso } from '../../../ui/aviso';
import { confirmar } from '../../../ui/dialogo-de-confirmacion';
import { LO_HECHO } from '../../../ui/material';
import { Socios } from '../socios.service';

/**
 * Las invitaciones de socio de antes de pedir cuenta que nadie usó (T299, SPEC-panel.md D14).
 *
 * Se cumplen cuando esa persona se registra, pero ya no se crean (D12). Estaban en el padrón,
 * que se fue; Personas las muestra con el filtro Socios. Sin pendientes, no dice nada.
 *
 * **Revocar pregunta antes**: sin cuenta, a ese correo ya no se le puede volver a invitar.
 */
@Component({
  selector: 'app-invitaciones-pendientes',
  imports: [MatButton, MatExpansionModule, Aviso],
  template: `
    @if (invitaciones().length > 0) {
      <app-aviso variante="info" class="block">
        {{ invitaciones().length }}
        {{ invitaciones().length === 1 ? 'invitación de socio sigue pendiente' : 'invitaciones de socio siguen pendientes' }},
        de antes de pedir cuenta: se cumplen cuando esa persona se registra en el sitio.
      </app-aviso>
      <mat-expansion-panel class="mt-1">
        <mat-expansion-panel-header>
          <mat-panel-title>Ver las invitaciones pendientes</mat-panel-title>
        </mat-expansion-panel-header>
        <ul class="grid gap-2 text-sm">
          @for (invitacion of invitaciones(); track invitacion.id) {
            <li class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="font-medium">{{ invitacion.email }}</span>
              <span class="text-muted-foreground">socio {{ invitacion.numeroSocio }}</span>
              <button
                matButton="outlined"
                type="button"
                class="peligro chico ms-auto"
                [disabled]="revocando()"
                (click)="revocar(invitacion.id, invitacion.email)"
              >
                Revocar
                <span class="sr-only">la invitación de {{ invitacion.email }}</span>
              </button>
            </li>
          }
        </ul>
        @if (error(); as falla) {
          <p class="mt-2 text-sm text-destructive">{{ falla }}</p>
        }
      </mat-expansion-panel>
    }
  `,
})
export class InvitacionesPendientes {
  private readonly api = inject(Socios);
  private readonly dialogos = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  // ponytail: el listado trae también el padrón entero, que acá no se usa; un endpoint solo de
  // las pendientes si el padrón crece mucho.
  private readonly listado = resource({ loader: () => this.api.listado() });
  protected readonly invitaciones = computed(() =>
    this.listado.hasValue() ? this.listado.value().invitaciones : [],
  );

  protected readonly revocando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async revocar(id: number, email: string): Promise<void> {
    const si = await confirmar(this.dialogos, {
      titulo: `¿Revocar la invitación de ${email}?`,
      detalle:
        'Sin cuenta, a ese correo ya no se le puede volver a invitar: tendrá que registrarse en ' +
        'el sitio, y después se le marca Socio en Personas.',
      confirmar: 'Sí, revocarla',
      peligro: true,
    });
    if (!si) return;

    this.error.set(null);
    this.revocando.set(true);
    try {
      await this.api.revocar(id);
      this.snackBar.open(`Se anuló la invitación de ${email}.`, undefined, LO_HECHO);
      this.listado.reload();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    } finally {
      this.revocando.set(false);
    }
  }
}
