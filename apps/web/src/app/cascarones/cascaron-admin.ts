import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIcon } from '@angular/material/icon';

import { Auth } from '../core/auth/auth';
import { inicioDelPanel, puedeVer } from '../core/auth/tipos-del-panel';
import { ProgresoDeNavegacion } from '../ui/progreso-de-navegacion';
import { Logotipo } from './logotipo';
import { MenuDesplegable } from './menu-desplegable';

/**
 * El panel de administración: barra lateral fija a la izquierda y contenido.
 *
 * La especificación de la barra está en MASTER.md § La barra lateral de
 * administración y **manda sobre el canvas de Stitch**, donde las cinco
 * pantallas de admin tienen versiones distintas entre sí.
 *
 * De esa tabla se dibujan los ítems que hoy tienen pantalla. Torneos y Ranking son
 * módulos que todavía no existen: un ítem deshabilitado que nunca se habilita es
 * ruido permanente en la barra que el club mira todo el día.
 */
@Component({
  selector: 'app-cascaron-admin',
  imports: [
    MatIcon,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    Logotipo,
    MenuDesplegable,
    ProgresoDeNavegacion,
  ],
  template: `
    <app-progreso-de-navegacion />

    <a
      href="#contenido"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50
             focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:shadow-lg"
    >
      Saltar al contenido
    </a>

    <div class="md:flex">
      <aside
        class="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-border
               bg-card md:flex"
      >
        <div class="border-b border-border px-6 py-4">
          <app-logotipo [destino]="inicio()" />
        <span
          class="font-display text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          Administración
        </span>
        </div>

        <!-- El ítem activo es un rótulo, la placa de la transmisión, y ya no una
             franja de color al costado (TV2.5): la franja era la marca de
             interfaz en serie que cazó el detector en D8.2, y un test la prohíbe.
             El hover va solo en los inactivos, acá y en el cajón: sobre el rótulo
             pintaría un fondo claro bajo un texto blanco. -->
        <nav aria-label="Administración" class="flex-1 overflow-y-auto py-4">
          <ul class="grid gap-1">
            @for (item of items(); track item.ruta) {
              @if (item.trasDivisoria) {
                <li class="my-2 border-t border-border" aria-hidden="true"></li>
              }
              <li>
                <a
                  [routerLink]="item.ruta"
                  routerLinkActive
                  ariaCurrentWhenActive="page"
                  #activo="routerLinkActive"
                  class="flex min-h-12 items-center gap-3 px-4 font-display text-sm
                         font-bold tracking-wide uppercase transition-colors"
                  [class]="
                    activo.isActive
                      ? 'bg-rotulo text-on-rotulo'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  "
                >
                  <mat-icon class="text-xl" aria-hidden="true">{{ item.icono }}</mat-icon>
                  {{ item.etiqueta }}
                </a>
              </li>
            }
          </ul>
        </nav>

        <div class="border-t border-border p-3">
          @if (usuario(); as sesion) {
            <app-menu-desplegable
              [etiqueta]="'Opciones de ' + sesion.nombre"
              claseBoton="flex w-full items-center gap-3 rounded-lg p-2 text-start
                          transition-colors hover:bg-muted"
              clasePanel="start-0 bottom-full mb-2"
            >
              <span disparador class="flex w-full items-center gap-3">
                <span
                  class="flex size-9 shrink-0 items-center justify-center rounded-full
                         bg-primary text-xs font-bold text-on-primary"
                  aria-hidden="true"
                >
                  {{ iniciales() }}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold">
                    {{ sesion.nombre }}
                  </span>
                  <span class="block truncate text-xs text-muted-foreground">
                    {{ sesion.email }}
                  </span>
                </span>
                <mat-icon class="text-muted-foreground" aria-hidden="true">
                  more_vert
                </mat-icon>
              </span>

              <a routerLink="/" [class]="ITEM_MENU">Volver al sitio</a>
              <button
                type="button"
                (click)="salir()"
                [class]="ITEM_MENU + ' w-full cursor-pointer text-start'"
              >
                Salir
              </button>
            </app-menu-desplegable>
          }
        </div>
      </aside>

      <!-- En móvil la barra lateral se vuelve cajón: la especificación del
           master, porque el diseño no dibuja esta pantalla en móvil. -->
      <header
        class="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border
               bg-card px-4 shadow-sm md:hidden"
      >
        <button
          type="button"
          class="pulsable cursor-pointer rounded-lg p-2 hover:bg-muted"
          aria-label="Abrir el menú de administración"
          (click)="cajon.showModal()"
        >
          <mat-icon class="text-2xl" aria-hidden="true">menu</mat-icon>
        </button>
        <app-logotipo [destino]="inicio()" />
        <span
          class="font-display text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          Administración
        </span>
      </header>

      <dialog
        #cajon
        closedby="any"
        class="dialogo-cajon-inicio m-0 h-dvh w-4/5 max-w-xs bg-card shadow-xl
               backdrop:bg-foreground/50"
        aria-label="Administración"
      >
        <div class="flex items-center justify-between border-b border-border px-4 py-4">
          <app-logotipo [destino]="inicio()" />
        <span
          class="font-display text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          Administración
        </span>
          <button
            type="button"
            class="pulsable cursor-pointer rounded-lg p-2 hover:bg-muted"
            aria-label="Cerrar el menú"
            (click)="cajon.close()"
          >
            <mat-icon class="text-2xl" aria-hidden="true">close</mat-icon>
          </button>
        </div>

        <nav aria-label="Administración" class="p-2">
          <ul class="grid gap-1">
            @for (item of items(); track item.ruta) {
              <li>
                <a
                  [routerLink]="item.ruta"
                  routerLinkActive
                  ariaCurrentWhenActive="page"
                  #enCajon="routerLinkActive"
                  class="flex min-h-12 items-center gap-3 rounded-lg px-3 font-display
                         text-sm font-bold tracking-wide uppercase transition-colors"
                  [class]="enCajon.isActive ? 'bg-rotulo text-on-rotulo' : 'hover:bg-muted'"
                  (click)="cajon.close()"
                >
                  <mat-icon class="text-xl" aria-hidden="true">{{ item.icono }}</mat-icon>
                  {{ item.etiqueta }}
                </a>
              </li>
            }
            <li class="my-2 border-t border-border" aria-hidden="true"></li>
            <li>
              <a
                routerLink="/"
                class="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm
                       font-medium transition-colors hover:bg-muted"
              >
                <mat-icon class="text-xl" aria-hidden="true">arrow_back</mat-icon>
                Volver al sitio
              </a>
            </li>
          </ul>
        </nav>
      </dialog>

      <main id="contenido" class="min-w-0 flex-1 px-4 py-8 md:px-8">
        <router-outlet />
      </main>
    </div>
  `,
})
export class CascaronAdmin {
  private readonly auth = inject(Auth);

  protected readonly usuario = this.auth.usuario;

  /** Los ítems de MASTER.md que ya tienen pantalla, en el orden de esa tabla. */
  private readonly ITEMS = [
    {
      ruta: '/administracion/reservas',
      etiqueta: 'Agenda del día',
      icono: 'calendar_today',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/canchas',
      etiqueta: 'Canchas',
      icono: 'sports_tennis',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/socios',
      etiqueta: 'Socios',
      icono: 'group',
      trasDivisoria: false,
    },
    {
      // T223. Junto a Socios: es donde se da cada tipo, también el de socio.
      ruta: '/administracion/usuarios',
      etiqueta: 'Usuarios',
      icono: 'manage_accounts',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/ingreso',
      etiqueta: 'Ingreso del club',
      icono: 'payments',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/ocupacion',
      etiqueta: 'Ocupación de cancha',
      icono: 'donut_large',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/no-uso',
      etiqueta: 'Horas no usadas',
      icono: 'timer_off',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/padron',
      etiqueta: 'Padrón y morosidad',
      icono: 'group',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/reportes',
      etiqueta: 'Horas reportadas',
      icono: 'flag',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/cuotas',
      etiqueta: 'Cuotas',
      icono: 'payments',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/morosos',
      etiqueta: 'Socios con deuda',
      icono: 'money_off',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/clases',
      etiqueta: 'Clases',
      icono: 'event_note',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/profesores',
      etiqueta: 'Profesores',
      icono: 'school',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/torneos',
      etiqueta: 'Torneos',
      icono: 'emoji_events',
      trasDivisoria: false,
    },
    {
      // T191. Junto a Torneos: son las ligas a las que suman.
      ruta: '/administracion/tours',
      etiqueta: 'Tours',
      icono: 'military_tech',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/jugadores',
      etiqueta: 'Jugadores',
      icono: 'groups',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/partidos-internos',
      etiqueta: 'Partidos entre socios',
      icono: 'handshake',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/solicitudes',
      etiqueta: 'Consultas al club',
      icono: 'drafts',
      trasDivisoria: false,
    },
    {
      ruta: '/administracion/configuracion',
      etiqueta: 'Configuración',
      icono: 'settings',
      trasDivisoria: true,
    },
    {
      ruta: '/estado',
      etiqueta: 'Estado del sistema',
      icono: 'monitor_heart',
      trasDivisoria: false,
    },
  ];

  /** Los que este usuario puede ver (T220): el gestor, la agenda; el profesor, Clases. */
  protected readonly items = computed(() =>
    this.ITEMS.filter((item) => puedeVer(item.ruta, this.usuario())),
  );

  /** Adónde lleva el logotipo: la portada del panel de cada uno. */
  protected readonly inicio = computed(
    () => inicioDelPanel(this.usuario()) ?? '/',
  );

  protected readonly ITEM_MENU =
    'block rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted';

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
