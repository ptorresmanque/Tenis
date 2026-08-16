import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a
      href="#contenido"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50
             focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:shadow-lg"
    >
      Saltar al contenido
    </a>

    <header class="border-b border-border bg-card">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <a routerLink="/" class="font-display text-xl font-bold text-primary">
          Club de Tenis
        </a>

        <nav aria-label="Principal" class="flex gap-1 text-sm">
          @for (item of navegacion; track item.ruta) {
            <a
              [routerLink]="item.ruta"
              routerLinkActive="bg-muted text-primary"
              [routerLinkActiveOptions]="{ exact: item.ruta === '/' }"
              class="rounded-md px-3 py-1.5 font-medium text-muted-foreground
                     transition-colors hover:bg-muted hover:text-foreground"
            >
              {{ item.etiqueta }}
            </a>
          }
        </nav>
      </div>
    </header>

    <main id="contenido" class="mx-auto max-w-5xl px-4 py-8">
      <router-outlet />
    </main>
  `,
})
export class App {
  protected readonly navegacion = [
    { ruta: '/', etiqueta: 'Inicio' },
    { ruta: '/estado', etiqueta: 'Estado' },
  ];
}
