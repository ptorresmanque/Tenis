import { Component, input } from '@angular/core';
import { MatBadge } from '@angular/material/badge';
import { MatTabsModule } from '@angular/material/tabs';
import {
  IsActiveMatchOptions,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';

/** Una pestaña: su ruta (absoluta), lo que dice y, si algo espera ahí, su badge. */
export interface PestanaDeLaPantalla {
  ruta: string;
  etiqueta: string;
  /** Cuánto espera en esa pestaña (T287); sin número o en 0, no hay badge. */
  insignia?: number | null;
  /** Lo que oye el lector en vez del número solo: «3 horas por revisar». */
  descripcion?: string;
}

/**
 * Las pestañas de una pantalla del panel y el lugar donde se dibuja la elegida (T286,
 * SPEC-panel.md A2): `mat-tab-nav-bar` con una ruta por pestaña, como Configuración (T262), así
 * el enlace a una pestaña se comparte y las rutas viejas redirigen a la suya.
 *
 * La usan la agenda, Finanzas, Horas no usadas y Canchas. El `<h1>` y la descripción quedan en
 * cada pantalla: el título es de la pantalla, y la prueba de T277 lo busca en su archivo.
 *
 * **Con una sola pestaña no hay barra** (A3): es lo que ve el gestor en la agenda, y una barra
 * de una pestaña no dice nada.
 */
@Component({
  selector: 'app-pestanas-de-la-pantalla',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatTabsModule, MatBadge],
  template: `
    @if (pestanas().length > 1) {
      <!-- Pasan a la línea siguiente en vez de desplazarse con flechas, como Configuración y
           las fichas (T262): en el teléfono, las flechas escondían pestañas.
           El badge se esconde en la pestaña que se está mirando, como pide la referencia de tabs
           del skill. Su número es aria-hidden, y matBadgeDescription no llega al lector acá:
           Material decide cómo describirlo antes de que el enlace tenga su href, lo toma por no
           enfocable y escribe la descripción en un badge que todavía no existe. Por eso la
           descripción también va como texto oculto junto a la etiqueta. -->
      <nav
        mat-tab-nav-bar
        class="envuelve holgada mt-4"
        disablePagination
        mat-stretch-tabs="false"
        [attr.aria-label]="etiqueta()"
        [tabPanel]="panel"
      >
        @for (pestana of pestanas(); track pestana.ruta) {
          <a
            mat-tab-link
            [routerLink]="pestana.ruta"
            routerLinkActive
            #activa="routerLinkActive"
            [routerLinkActiveOptions]="SOLO_EL_CAMINO"
            [active]="activa.isActive"
          >
            <!-- En la etiqueta y no en el enlace: la pestaña recorta lo que sale de su caja, y
                 sobre la etiqueta el badge cabe en el aire que tiene arriba. -->
            <span
              [matBadge]="pestana.insignia ?? null"
              [matBadgeHidden]="!pestana.insignia || activa.isActive"
              [matBadgeDescription]="pestana.descripcion ?? ''"
              matBadgeOverlap="false"
              >{{ pestana.etiqueta }}</span
            >
            @if (pestana.insignia && !activa.isActive) {
              <span class="sr-only">: {{ pestana.descripcion }}</span>
            }
          </a>
        }
      </nav>

      <mat-tab-nav-panel #panel class="mt-4 block">
        <router-outlet />
      </mat-tab-nav-panel>
    } @else {
      <div class="mt-4">
        <router-outlet />
      </div>
    }
  `,
})
export class PestanasDeLaPantalla {
  readonly pestanas = input.required<PestanaDeLaPantalla[]>();

  /** El nombre de la barra para el lector de pantalla («Vistas de la agenda»). */
  readonly etiqueta = input.required<string>();

  /**
   * Por el camino exacto: la primera pestaña suele ser la ruta madre, y sin `exact` se marcaría
   * también en las otras. Los parámetros no cuentan, así un enlace con `?fecha=…` deja marcada
   * su pestaña.
   */
  protected readonly SOLO_EL_CAMINO: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };
}
