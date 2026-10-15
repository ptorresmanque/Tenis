import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';

import { diaConAnioEnPalabras, fechaEnElClub } from '../../../catalogo-canchas/reloj-del-club';
import { TelefonoPipe } from '../../../core/telefono';
import { Esqueleto } from '../../../ui/esqueleto';
import { CuotaDelSocio } from '../cuota-del-socio';
import { SocioDelClub } from '../socios.service';
import { FichaDeCuenta, Usuarios } from '../usuarios.service';
import { TiposDeLaCuenta } from './tipos-de-la-cuenta';

/**
 * La ficha de una cuenta en Personas (T298, SPEC-panel.md D2): Datos · Tipos · Cuota.
 *
 * - **Datos**: quién es. Se muestran y no se editan acá: los cambia la persona desde su cuenta.
 * - **Tipos**: Socio, Profesor, Gestor y Administrador, con un «Guardar» (`TiposDeLaCuenta`).
 * - **Cuota**: solo de los socios. Es lo que mostraba la ficha de socio del padrón: número,
 *   estado, al día hasta e historial (`CuotaDelSocio`, A7).
 *
 * Pestañas de la página y no rutas: son tres miradas a la misma cuenta, que se lee una vez.
 * Tipos y Cuota se crean al elegirlas, porque piden lo suyo a la API.
 */
@Component({
  selector: 'app-ficha-persona',
  imports: [RouterLink, MatIcon, MatTabsModule, TelefonoPipe, Esqueleto, TiposDeLaCuenta, CuotaDelSocio],
  template: `
    <a routerLink="/administracion/personas" class="text-sm font-semibold text-primary">
      <mat-icon class="align-middle text-base" aria-hidden="true">arrow_back</mat-icon>
      Personas
    </a>

    @if (cuenta.isLoading() && !cuenta.hasValue()) {
      <app-esqueleto class="mt-4 block" [filas]="4" etiqueta="Cargando la cuenta…" />
    } @else if (cuenta.error()) {
      <p class="mt-4 text-destructive">No se pudo cargar esta cuenta. Reintenta en un momento.</p>
    } @else if (cuenta.hasValue()) {
      @let persona = cuenta.value();
      <header class="cabecera-panel mt-2">
        <div>
          <h1 class="titular text-4xl">{{ persona.nombre }} {{ persona.apellido }}</h1>
          <p class="mt-1 text-muted-foreground">{{ persona.email }}</p>
        </div>
      </header>

      <mat-tab-group class="mt-4" mat-stretch-tabs="false" aria-label="Secciones de la cuenta">
        <mat-tab label="Datos">
          <dl class="mt-4 grid max-w-xl gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
            <dt class="font-medium">Nombre</dt>
            <dd>{{ persona.nombre }} {{ persona.apellido }}</dd>
            <dt class="font-medium">Correo</dt>
            <dd class="break-all">{{ persona.email }}</dd>
            <dt class="font-medium">Teléfono</dt>
            <dd>{{ (persona.telefono | telefono) || 'Sin teléfono' }}</dd>
            <dt class="font-medium">Cuenta desde</dt>
            <dd>{{ desde(persona.creadoEn) }}</dd>
          </dl>
          <p class="mt-4 max-w-prose text-sm text-muted-foreground">
            Estos datos los cambia la persona desde su cuenta, en el sitio.
          </p>
        </mat-tab>

        <mat-tab label="Tipos">
          <ng-template matTabContent>
            <app-tipos-de-la-cuenta class="mt-4 block" [cuenta]="persona" (guardado)="cuenta.reload()" />
          </ng-template>
        </mat-tab>

        @if (socio(); as socio) {
          <mat-tab label="Cuota">
            <ng-template matTabContent>
              <app-cuota-del-socio class="mt-4 block" [socio]="socio" (guardado)="cuenta.reload()" />
            </ng-template>
          </mat-tab>
        }
      </mat-tab-group>
    }
  `,
})
export class FichaPersona {
  private readonly usuarios = inject(Usuarios);

  /** El id de la ruta (`/administracion/personas/:id`), como texto. */
  readonly id = input.required<string>();

  protected readonly cuenta = resource({
    params: () => ({ id: Number(this.id()) }),
    loader: ({ params }) => this.usuarios.ficha(params.id),
  });

  /** La ficha de socio con la forma que espera «Cuota»: la de la lista del padrón. */
  protected readonly socio = computed<SocioDelClub | null>(() => {
    if (!this.cuenta.hasValue()) return null;
    const { socio, nombre, apellido, email }: FichaDeCuenta = this.cuenta.value();

    return socio && { ...socio, usuario: { nombre, apellido, email } };
  });

  protected desde(instante: string): string {
    return diaConAnioEnPalabras(fechaEnElClub(instante));
  }
}
