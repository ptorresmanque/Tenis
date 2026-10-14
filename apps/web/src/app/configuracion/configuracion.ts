import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';

/**
 * Configuración del club: el cascarón con la sub-navegación.
 *
 * Secciones y no pantallas sueltas, como decidió R.5 en el plan: comparten encabezado
 * y se saltan entre sí todo el tiempo. Agregar una es agregar una línea a esta lista y
 * su ruta, sin tocar nada más — así entró la de categorías de juego en T60.
 */
@Component({
  selector: 'app-configuracion',
  imports: [MatIcon, RouterOutlet, RouterLink, RouterLinkActive, MatTabsModule],
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

    <!-- Una pestaña por sección, cada una su ruta (T262): mat-tab-nav-bar con su panel, que
         es donde se dibuja la ruta elegida. Las flechas recorren las pestañas. -->
    <nav
      mat-tab-nav-bar
      class="envuelve holgada mt-4"
        disablePagination
        mat-stretch-tabs="false"
      aria-label="Secciones de configuración"
      [tabPanel]="panelDeConfiguracion"
    >
      @for (seccion of SECCIONES; track seccion.ruta) {
        <a
          mat-tab-link
          [routerLink]="seccion.ruta"
          routerLinkActive
          #activa="routerLinkActive"
          [active]="activa.isActive"
        >
          <mat-icon class="me-2 text-lg" aria-hidden="true">{{ seccion.icono }}</mat-icon>
          {{ seccion.etiqueta }}
        </a>
      }
    </nav>

    <mat-tab-nav-panel #panelDeConfiguracion class="mt-6 block">
      <router-outlet />
    </mat-tab-nav-panel>
  `,
})
export class Configuracion {
  protected readonly SECCIONES = [
    { ruta: 'reglas', etiqueta: 'Reglas y cuotas', icono: 'rule' },
    { ruta: 'datos', etiqueta: 'Datos del club', icono: 'storefront' },
    { ruta: 'textos', etiqueta: 'Textos del sitio', icono: 'edit_note' },
    // T236. Un lugar por pestaña: ya son tres, y el gimnasio suma su cupo y sus tarifas.
    { ruta: 'tienda', etiqueta: 'Tienda', icono: 'shopping_bag' },
    { ruta: 'cafeteria', etiqueta: 'Cafetería', icono: 'local_cafe' },
    { ruta: 'gimnasio', etiqueta: 'Gimnasio', icono: 'fitness_center' },
    { ruta: 'categorias-juego', etiqueta: 'Categorías de juego', icono: 'stairs' },
    { ruta: 'preguntas-frecuentes', etiqueta: 'Preguntas frecuentes', icono: 'quiz' },
  ];
}
