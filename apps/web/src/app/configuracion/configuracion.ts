import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * Configuración del club: el cascarón con la sub-navegación.
 *
 * Secciones y no pantallas sueltas, como decidió R.5 en el plan: comparten encabezado
 * y se saltan entre sí todo el tiempo. Agregar una es agregar una línea a esta lista y
 * su ruta, sin tocar nada más — así entró la de categorías de juego en T60.
 */
@Component({
  selector: 'app-configuracion',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: cada sección trae la suya, y
         la navegación entre secciones va debajo. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Configuración</h1>
        <p class="mt-1 text-muted-foreground">
          Las reglas con las que funciona el club y quién puede cambiarlas.
        </p>
      </div>
    </header>

    <nav aria-label="Secciones de configuración" class="mt-4 border-b border-border">
      <ul class="flex flex-wrap gap-1">
        @for (seccion of SECCIONES; track seccion.ruta) {
          <li>
            <a
              [routerLink]="seccion.ruta"
              routerLinkActive
              ariaCurrentWhenActive="page"
              #activa="routerLinkActive"
              class="flex min-h-12 items-center gap-2 border-b-2 px-3 font-display text-sm
                     font-bold tracking-wide uppercase transition-colors sm:px-4"
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
    { ruta: 'reglas', etiqueta: 'Reglas y cuotas', icono: 'rule' },
    { ruta: 'datos', etiqueta: 'Datos del club', icono: 'storefront' },
    { ruta: 'administradores', etiqueta: 'Administradores', icono: 'shield_person' },
    { ruta: 'categorias-juego', etiqueta: 'Categorías de juego', icono: 'stairs' },
  ];
}
