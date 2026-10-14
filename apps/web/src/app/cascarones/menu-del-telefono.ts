import { Component, computed, effect, inject, input, model, untracked, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';

import { Auth } from '../core/auth/auth';
import { inicioDelPanel } from '../core/auth/tipos-del-panel';
import { Logotipo } from './logotipo';

/**
 * El menú del teléfono del sitio público: un mat-sidenav que entra por la derecha (T261). El
 * foco queda adentro, Escape o el velo lo cierran, y al cerrarse vuelve al botón que lo abrió.
 *
 * **Es un componente aparte y no parte del cascarón** (T263, I6): así llega en un `@defer`, y
 * el sidenav con su trampa de foco —unos 50 kB— no viaja en el arranque. Va en su propio
 * contenedor fijo sobre la ventana, que deja pasar los clics mientras está cerrado; la página
 * no queda adentro de un `mat-sidenav-container`.
 *
 * El menú se define en un solo lugar, en el cascarón: llega por `navegacion`.
 */
@Component({
  selector: 'app-menu-del-telefono',
  imports: [
    MatButton,
    MatIconButton,
    MatIcon,
    MatSidenavModule,
    RouterLink,
    RouterLinkActive,
    Logotipo,
  ],
  template: `
    <mat-sidenav-container class="cajon-flotante">
      <mat-sidenav
        #cajon
        class="cajon-del-sitio p-6"
        position="end"
        mode="over"
        fixedInViewport
        aria-label="Menú"
        (openedChange)="abierto.set($event)"
      >
        <div class="flex items-center justify-between">
          <app-logotipo />
          <button
            matIconButton
            type="button"
            class="rounded-lg p-2 hover:bg-muted"
            aria-label="Cerrar el menú"
            (click)="cajon.close()"
          >
            <mat-icon class="text-2xl" aria-hidden="true">close</mat-icon>
          </button>
        </div>

        <nav aria-label="Principal" class="mt-6 grid gap-1">
          @for (item of navegacion(); track item.ruta) {
            <a
              [routerLink]="item.ruta"
              routerLinkActive="bg-selected text-primary"
              ariaCurrentWhenActive="page"
              class="flex min-h-12 items-center rounded-lg px-3 font-display text-lg
                     font-bold uppercase tracking-wide transition-colors hover:bg-muted"
              (click)="cajon.close()"
            >
              {{ item.etiqueta }}
            </a>
          }
        </nav>

        @if (usuario(); as sesion) {
          <div class="mt-6 grid gap-1 border-t border-border pt-6">
            <p class="px-3 pb-2 font-semibold">{{ sesion.nombre }}</p>
            @if (inicioDelPanel(); as destino) {
              <a
                [routerLink]="destino"
                class="flex min-h-12 items-center rounded-lg px-3 font-medium
                       transition-colors hover:bg-muted"
                (click)="cajon.close()"
              >
                Administración
              </a>
            }
            <button
              type="button"
              class="flex min-h-12 cursor-pointer items-center rounded-lg px-3
                     text-start font-medium transition-colors hover:bg-muted"
              (click)="cajon.close(); salir()"
            >
              Salir
            </button>
          </div>
        } @else {
          <div class="mt-6 grid gap-2 border-t border-border pt-6">
            <a matButton="outlined" routerLink="/entrar" class="w-full" (click)="cajon.close()">
              Entrar
            </a>
            <a matButton="filled" routerLink="/registro" class="w-full" (click)="cajon.close()">
              Crear cuenta
            </a>
          </div>
        }
      </mat-sidenav>
    </mat-sidenav-container>
  `,
})
export class MenuDelTelefono {
  private readonly auth = inject(Auth);
  private readonly cajon = viewChild.required<MatSidenav>('cajon');

  readonly navegacion = input.required<{ ruta: string; etiqueta: string }[]>();
  /** Lo pide el botón del cascarón; el cajón lo baja al cerrarse. */
  readonly abierto = model(false);

  protected readonly usuario = this.auth.usuario;
  /** Adónde lleva "Administración": la portada del panel de cada uno, o nada (T220). */
  protected readonly inicioDelPanel = computed(() => inicioDelPanel(this.usuario()));

  constructor() {
    // `untracked`: abrir lee la señal con que Material lleva el estado, y sin esto el efecto
    // dependía de ella: al cerrar se volvía a correr y, como `abierto` baja recién al terminar
    // la animación, lo abría de nuevo.
    effect(() => {
      if (this.abierto()) untracked(() => void this.cajon().open());
    });
  }

  protected salir(): void {
    void this.auth.salir();
  }
}
