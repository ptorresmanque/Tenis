import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { Club } from '../club/club.service';
import { Auth } from '../core/auth/auth';
import { Logotipo } from './logotipo';
import { MenuDesplegable } from './menu-desplegable';

/**
 * El sitio público: barra superior, contenido y pie.
 *
 * Los enlaces del panel de administración **no** están acá. Antes vivían en esta
 * misma barra —siete enlaces para el admin, cuatro para el resto—; ahora el panel
 * tiene su propia barra lateral y la puerta de entrada es el menú del avatar. La
 * barra pública se ve igual para todos.
 *
 * `Torneos` y `Clases` son parte del menú del diseño y todavía no tienen ruta: un
 * enlace que cae en el comodín y devuelve al inicio miente peor que un enlace
 * ausente. Entran cuando exista su pantalla, como acaba de pasar con `El club`.
 */
@Component({
  selector: 'app-cascaron-publico',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    Logotipo,
    MenuDesplegable,
  ],
  template: `
    <a
      href="#contenido"
      class="sr-only print:hidden focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50
             focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:shadow-lg"
    >
      Saltar al contenido
    </a>

    <header class="sticky top-0 z-40 border-b border-border bg-card shadow-sm print:hidden">
      <div class="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <app-logotipo />

        <nav aria-label="Principal" class="hidden gap-1 text-sm md:flex">
          @for (item of navegacion(); track item.ruta) {
            <a
              [routerLink]="item.ruta"
              routerLinkActive="text-primary underline decoration-2 underline-offset-8"
              ariaCurrentWhenActive="page"
              class="rounded-md px-3 py-2 font-medium text-muted-foreground
                     transition-colors hover:bg-muted hover:text-foreground"
            >
              {{ item.etiqueta }}
            </a>
          }
        </nav>

        <div class="ms-auto flex items-center gap-2">
          @if (usuario(); as sesion) {
            <app-menu-desplegable
              [etiqueta]="'Menú de ' + sesion.nombre"
              claseBoton="flex size-10 items-center justify-center rounded-full
                          bg-primary text-sm font-bold text-on-primary
                          transition-opacity hover:opacity-90"
            >
              <span disparador>{{ iniciales() }}</span>

              <p class="border-b border-border px-3 py-2">
                <span class="block font-semibold">{{ sesion.nombre }}</span>
                <span class="block text-xs text-muted-foreground">
                  {{ sesion.email }}
                </span>
              </p>

              @if (sesion.socioId !== null) {
                <a routerLink="/mis-reservas" [class]="ITEM_MENU">Mis reservas</a>
                <a routerLink="/mi-cuenta" [class]="ITEM_MENU">Mi cuenta</a>
              }
              @if (esAdmin()) {
                <a routerLink="/administracion/reservas" [class]="ITEM_MENU">
                  Administración
                </a>
              }
              <button
                type="button"
                (click)="salir()"
                [class]="ITEM_MENU + ' w-full cursor-pointer text-start'"
              >
                Salir
              </button>
            </app-menu-desplegable>
          } @else {
            <a
              routerLink="/entrar"
              class="hidden rounded-lg px-4 py-2 text-sm font-semibold text-primary
                     transition-colors hover:bg-muted sm:block"
            >
              Entrar
            </a>
            <a
              routerLink="/registro"
              class="hidden rounded-lg bg-primary px-4 py-2 text-sm font-semibold
                     text-on-primary transition-opacity hover:opacity-90 sm:block"
            >
              Crear cuenta
            </a>
          }

          <button
            type="button"
            class="cursor-pointer rounded-lg p-2 text-foreground transition-colors
                   hover:bg-muted md:hidden"
            aria-label="Abrir el menú"
            (click)="panel.showModal()"
          >
            <span class="icono text-2xl" aria-hidden="true">menu</span>
          </button>
        </div>
      </div>
    </header>

    <!-- El cajón es un diálogo nativo abierto con showModal(): el foco queda
         atrapado adentro, Esc lo cierra, y closedby="any" agrega el cierre al
         tocar afuera. Los tres sin una línea de JavaScript nuestra; donde el
         navegador todavía no soporte closedby, quedan Esc y la cruz. -->
    <dialog
      #panel
      closedby="any"
      class="m-0 ms-auto h-dvh w-4/5 max-w-xs bg-card p-6 shadow-xl
             backdrop:bg-foreground/50"
      aria-label="Menú"
    >
      <div class="flex items-center justify-between">
        <app-logotipo />
        <button
          type="button"
          class="cursor-pointer rounded-lg p-2 transition-colors hover:bg-muted"
          aria-label="Cerrar el menú"
          (click)="panel.close()"
        >
          <span class="icono text-2xl" aria-hidden="true">close</span>
        </button>
      </div>

      <nav aria-label="Principal" class="mt-6 grid gap-1">
        @for (item of navegacion(); track item.ruta) {
          <a
            [routerLink]="item.ruta"
            routerLinkActive="bg-selected text-primary"
            ariaCurrentWhenActive="page"
            class="flex min-h-12 items-center rounded-lg px-3 font-medium
                   transition-colors hover:bg-muted"
            (click)="panel.close()"
          >
            {{ item.etiqueta }}
          </a>
        }
      </nav>

      @if (usuario(); as sesion) {
        <div class="mt-6 grid gap-1 border-t border-border pt-6">
          <p class="px-3 pb-2 font-semibold">{{ sesion.nombre }}</p>
          @if (esAdmin()) {
            <a
              routerLink="/administracion/reservas"
              class="flex min-h-12 items-center rounded-lg px-3 font-medium
                     transition-colors hover:bg-muted"
              (click)="panel.close()"
            >
              Administración
            </a>
          }
          <button
            type="button"
            class="flex min-h-12 cursor-pointer items-center rounded-lg px-3
                   text-start font-medium transition-colors hover:bg-muted"
            (click)="panel.close(); salir()"
          >
            Salir
          </button>
        </div>
      } @else {
        <div class="mt-6 grid gap-2 border-t border-border pt-6">
          <a
            routerLink="/entrar"
            class="flex min-h-12 items-center justify-center rounded-lg border
                   border-primary font-semibold text-primary"
            (click)="panel.close()"
          >
            Entrar
          </a>
          <a
            routerLink="/registro"
            class="flex min-h-12 items-center justify-center rounded-lg bg-primary
                   font-semibold text-on-primary"
            (click)="panel.close()"
          >
            Crear cuenta
          </a>
        </div>
      }
    </dialog>

    <main id="contenido" class="mx-auto max-w-6xl px-4 py-8">
      <router-outlet />
    </main>

    <footer class="mt-16 border-t border-border bg-card print:hidden">
      <div class="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <app-logotipo />
          <p class="mt-3 max-w-xs text-sm text-muted-foreground">
            Siete canchas duras, todas de la misma superficie. Reservá en línea.
          </p>
        </div>

        <nav aria-labelledby="pie-reservas">
          <h2 id="pie-reservas" class="font-display text-sm font-bold uppercase">
            Reservas
          </h2>
          <ul class="mt-3 grid gap-2 text-sm text-muted-foreground">
            @for (item of navegacion(); track item.ruta) {
              <li>
                <a [routerLink]="item.ruta" class="hover:text-primary">
                  {{ item.etiqueta }}
                </a>
              </li>
            }
          </ul>
        </nav>

        <div>
          <h2 class="font-display text-sm font-bold uppercase">Horarios</h2>
          <p class="mt-3 text-sm text-muted-foreground">
            Todos los días, de 08:00 a 22:00.
          </p>
        </div>

        <!-- Los datos salen de la configuración del club, no de acá: el día que se
             mude, lo cambia el admin desde su panel y no hace falta un despliegue.
             Cada línea aparece solo si tiene algo que decir. -->
        <div>
          <h2 class="font-display text-sm font-bold uppercase">Contacto</h2>
          <ul class="mt-3 grid gap-1 text-sm text-muted-foreground">
            @if (club().direccion) {
              <li>{{ club().direccion }}</li>
            }
            @if (club().telefono) {
              <li>
                <a [href]="'tel:' + club().telefono" class="hover:text-primary">
                  {{ club().telefono }}
                </a>
              </li>
            }
            @if (club().email) {
              <li>
                <a [href]="'mailto:' + club().email" class="hover:text-primary">
                  {{ club().email }}
                </a>
              </li>
            }
          </ul>
        </div>
      </div>

      <p class="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
        © 2026 FEDAL Tennis Center
      </p>
    </footer>
  `,
})
export class CascaronPublico {
  private readonly auth = inject(Auth);

  protected readonly usuario = this.auth.usuario;
  protected readonly club = inject(Club).datos;
  protected readonly esAdmin = this.auth.esAdmin;

  /** Un ítem del menú desplegable. Es una constante y no una clase de CSS
      porque la comparten un enlace y un botón, que no son el mismo elemento. */
  protected readonly ITEM_MENU =
    'block rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted';

  protected readonly navegacion = computed(() => [
    { ruta: '/disponibilidad', etiqueta: 'Disponibilidad' },
    // Para todos y no solo para socios: es la puerta del apoderado que busca clases
    // para su hijo, y ese todavía no tiene cuenta.
    { ruta: '/clases', etiqueta: 'Clases' },
    // El calendario de torneos es de las pocas cosas que un tercero mira antes de
    // asociarse: un club con torneos es un club con vida.
    { ruta: '/torneos', etiqueta: 'Torneos' },
    // Solo para quien tiene ficha de socio: al resto la pantalla le mostraría
    // una lista siempre vacía.
    ...(this.usuario()?.socioId != null
      ? [
          { ruta: '/mis-reservas', etiqueta: 'Mis reservas' },
          { ruta: '/mi-cuenta', etiqueta: 'Mi cuenta' },
        ]
      : []),
    { ruta: '/el-club', etiqueta: 'El club' },
  ]);

  protected readonly iniciales = computed(() =>
    (this.usuario()?.nombre ?? '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((parte) => parte[0] ?? '')
      .join('')
      .toUpperCase(),
  );

  protected salir(): void {
    void this.auth.salir();
  }

}
