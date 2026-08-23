import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * Configuración del club: el cascarón con la sub-navegación.
 *
 * Tres secciones y no tres pantallas sueltas, como decidió R.5 en el plan: comparten
 * encabezado y se saltan entre sí todo el tiempo. La cuarta —avisos y correos— entra
 * acá cuando exista, sin tocar nada más que esta lista.
 */
@Component({
  selector: 'app-configuracion',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <h1 class="font-display text-3xl font-bold">Configuración</h1>
    <p class="mt-1 text-muted-foreground">
      Las reglas con las que funciona el club y quién puede cambiarlas.
    </p>

    <nav aria-label="Secciones de configuración" class="mt-6 border-b border-border">
      <ul class="flex flex-wrap gap-1">
        @for (seccion of SECCIONES; track seccion.ruta) {
          <li>
            <a
              [routerLink]="seccion.ruta"
              routerLinkActive
              ariaCurrentWhenActive="page"
              #activa="routerLinkActive"
              class="flex min-h-12 items-center gap-2 border-b-2 px-4 text-sm font-medium
                     transition-colors"
              [class]="
                activa.isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              "
            >
              <span class="icono text-lg" aria-hidden="true">{{ seccion.icono }}</span>
              {{ seccion.etiqueta }}
            </a>
          </li>
        }
      </ul>
    </nav>

    <div class="mt-6">
      <router-outlet />
    </div>
  `,
})
export class Configuracion {
  protected readonly SECCIONES = [
    { ruta: 'reglas', etiqueta: 'Reglas de reserva', icono: 'rule' },
    { ruta: 'datos', etiqueta: 'Datos del club', icono: 'storefront' },
    { ruta: 'administradores', etiqueta: 'Administradores', icono: 'shield_person' },
  ];
}
