import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { Auth } from './core/auth/auth';

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

        <!-- flex-wrap: con el socio dentro son cinco enlaces y a 375px no caben en
             una línea. Sin esto, el último queda cortado contra el borde. -->
        <nav aria-label="Principal" class="flex flex-wrap gap-1 text-sm">
          @for (item of navegacion(); track item.ruta) {
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

        <div class="ms-auto flex items-center gap-3 text-sm">
          @if (usuario(); as sesion) {
            <span class="font-medium">{{ sesion.nombre }}</span>
            <button
              type="button"
              (click)="salir()"
              class="cursor-pointer rounded-md px-3 py-1.5 font-medium text-muted-foreground
                     transition-colors hover:bg-muted hover:text-foreground"
            >
              Salir
            </button>
          } @else {
            <a
              routerLink="/entrar"
              routerLinkActive="bg-muted text-primary"
              class="rounded-md px-3 py-1.5 font-medium text-muted-foreground
                     transition-colors hover:bg-muted hover:text-foreground"
            >
              Entrar
            </a>
          }
        </div>
      </div>
    </header>

    <main id="contenido" class="mx-auto max-w-5xl px-4 py-8">
      <router-outlet />
    </main>
  `,
})
export class App {
  private readonly auth = inject(Auth);

  protected readonly usuario = this.auth.usuario;

  protected salir(): void {
    void this.auth.salir();
  }

  /**
   * Esconderle el enlace a quien no es admin es cortesía, no seguridad: lo que
   * cierra el panel es `@SoloAdmin()` en el servidor.
   */
  protected readonly navegacion = computed(() => [
    { ruta: '/', etiqueta: 'Inicio' },
    { ruta: '/disponibilidad', etiqueta: 'Disponibilidad' },
    // Solo para quien tiene ficha de socio: al resto la pantalla le mostraría una
    // lista siempre vacía.
    ...(this.auth.usuario()?.socioId != null
      ? [{ ruta: '/mis-reservas', etiqueta: 'Mis reservas' }]
      : []),
    ...(this.auth.esAdmin()
      ? [
          { ruta: '/administracion/reservas', etiqueta: 'Reservas del día' },
          { ruta: '/administracion/canchas', etiqueta: 'Canchas' },
        ]
      : []),
    { ruta: '/registro', etiqueta: 'Crear cuenta' },
    { ruta: '/estado', etiqueta: 'Estado' },
  ]);
}
