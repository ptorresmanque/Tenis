import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import { Logotipo } from './logotipo';
import { ConmutadorDeTema } from './conmutador-de-tema';
import { usarTemaPublico } from './tema';

/**
 * Entrar y registro: logotipo, una salida y la tarjeta al centro.
 *
 * Sin navegación y sin pie a propósito. La única puerta que se le deja a quien
 * llegó hasta acá es volver a mirar la disponibilidad, que es el motivo por el
 * que la mayoría se está creando una cuenta.
 */
@Component({
  selector: 'app-cascaron-auth',
  imports: [RouterOutlet, RouterLink, Logotipo, ConmutadorDeTema],
  template: `
    <header class="sticky top-0 z-40 border-b border-border bg-card">
      <div class="mx-auto flex h-16 max-w-6xl items-center px-4">
        <!-- A 375px el descriptor y el enlace no caben juntos, y el enlace es
             la única salida de esta pantalla: gana el enlace. -->
        <app-logotipo claseDescriptor="hidden sm:block" />
        <app-conmutador-de-tema class="ms-auto" />
        <a
          routerLink="/disponibilidad"
          class="rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap
                 text-primary transition-colors hover:bg-muted"
        >
          Ver disponibilidad
        </a>
      </div>
    </header>

    <main class="mx-auto w-full max-w-md px-4 py-12">
      <div class="rounded-xl border border-border bg-card p-8 shadow-md">
        <router-outlet />
      </div>
    </main>
  `,
})
export class CascaronAuth {
  /** Entrar y registro también son públicas: el tema oscuro también las cubre. */
  constructor() {
    usarTemaPublico();
  }
}
