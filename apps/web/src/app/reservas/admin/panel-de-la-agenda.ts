import { Component, computed, inject } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import {
  IsActiveMatchOptions,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';

import { Auth } from '../../core/auth/auth';
import { puedeVer } from '../../core/auth/tipos-del-panel';

/**
 * La agenda del día y la ocupación de cancha, en una pantalla con pestañas (T285,
 * SPEC-panel.md D5). Cada pestaña es su ruta, como en Configuración, así el enlace a la
 * ocupación se comparte y la ruta vieja `/administracion/ocupacion` redirige acá.
 *
 * **La ocupación es del admin.** El gestor ve la agenda sola: una barra con una pestaña
 * no le diría nada, y la pestaña que falta se notaría como un hueco (A3).
 */
@Component({
  selector: 'app-panel-de-la-agenda',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatTabsModule],
  template: `
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Agenda del día</h1>
      </div>
    </header>

    @if (conPestanas()) {
      <nav
        mat-tab-nav-bar
        class="mt-4"
        mat-stretch-tabs="false"
        aria-label="Vistas de la agenda"
        [tabPanel]="panelDeLaAgenda"
      >
        @for (pestana of PESTANAS; track pestana.ruta) {
          <a
            mat-tab-link
            [routerLink]="pestana.ruta"
            routerLinkActive
            #activa="routerLinkActive"
            [routerLinkActiveOptions]="SOLO_EL_CAMINO"
            [active]="activa.isActive"
          >
            {{ pestana.etiqueta }}
          </a>
        }
      </nav>

      <mat-tab-nav-panel #panelDeLaAgenda class="mt-4 block">
        <router-outlet />
      </mat-tab-nav-panel>
    } @else {
      <div class="mt-4">
        <router-outlet />
      </div>
    }
  `,
})
export class PanelDeLaAgenda {
  private readonly usuario = inject(Auth).usuario;

  /**
   * «Agenda» es la ruta madre: sin `paths: 'exact'` se marcaría también en Ocupación. Los
   * parámetros no cuentan, así un enlace con `?fecha=…` deja marcada su pestaña.
   */
  protected readonly SOLO_EL_CAMINO: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };

  protected readonly PESTANAS = [
    { ruta: '/administracion/reservas', etiqueta: 'Agenda' },
    { ruta: '/administracion/reservas/ocupacion', etiqueta: 'Ocupación' },
  ];

  /** Las pestañas, solo si puede ver la segunda: la misma regla del guard y del menú. */
  protected readonly conPestanas = computed(() =>
    puedeVer('/administracion/reservas/ocupacion', this.usuario()),
  );
}
