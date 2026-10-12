import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * La tienda en el panel: el cascarón con su sub-navegación (T157).
 *
 * Como Configuración: secciones que comparten encabezado, y agregar una es agregar una
 * línea a esta lista y su ruta. Las que vienen —productos, stock, pedidos, mesón,
 * encordado— entran así, una por tarea de `tasks/plan-tienda.md`.
 */
@Component({
  selector: 'app-tienda-panel',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Tienda</h1>
        <p class="mt-1 text-muted-foreground">
          Lo que el club vende en línea y en el mesón.
        </p>
      </div>
    </header>

    <nav aria-label="Secciones de la tienda" class="mt-4 border-b border-border">
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
export class TiendaPanel {
  protected readonly SECCIONES = [
    { ruta: 'categorias', etiqueta: 'Categorías', icono: 'category' },
    { ruta: 'marcas', etiqueta: 'Marcas y tallas', icono: 'sell' },
  ];
}
