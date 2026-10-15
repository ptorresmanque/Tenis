import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatDivider } from '@angular/material/divider';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbar } from '@angular/material/toolbar';
import { map } from 'rxjs';

import { Auth } from '../core/auth/auth';
import { inicioDelPanel, puedeVer } from '../core/auth/tipos-del-panel';
import { tiposDelUsuario } from '../core/auth/tipos-del-usuario';
import { ProgresoDeNavegacion } from '../ui/progreso-de-navegacion';
import { Logotipo } from './logotipo';

/**
 * El panel de administración: barra lateral a la izquierda y contenido.
 *
 * La especificación de la barra está en MASTER.md § La barra lateral de
 * administración y **manda sobre el canvas de Stitch**, donde las cinco
 * pantallas de admin tienen versiones distintas entre sí.
 *
 * De esa tabla se dibujan los ítems que hoy tienen pantalla. Torneos y Ranking son
 * módulos que todavía no existen: un ítem deshabilitado que nunca se habilita es
 * ruido permanente en la barra que el club mira todo el día.
 */
/** Los grupos del menú, con su subtítulo (T300, SPEC-panel.md D8), en este orden. */
const GRUPOS = ['Día a día', 'El club', 'Competencias'] as const;

/** Una sección del menú. El grupo es obligatorio: ningún ítem queda suelto. */
interface SeccionDelPanel {
  ruta: string;
  etiqueta: string;
  icono: string;
  /** «Al pie» va sin subtítulo, tras una divisoria. */
  grupo: (typeof GRUPOS)[number] | 'Al pie';
}

/**
 * Los ítems de MASTER.md que ya tienen pantalla, agrupados como dice SPEC-panel.md D8.
 * Exportados desde T277: la etiqueta es también el título de la pantalla, y una prueba lo cuida.
 */
export const SECCIONES_DEL_PANEL: SeccionDelPanel[] = [
  {
    ruta: '/administracion/reservas',
    etiqueta: 'Agenda del día',
    icono: 'calendar_today',
    grupo: 'Día a día',
  },
  {
    ruta: '/administracion/clases',
    etiqueta: 'Clases',
    icono: 'event_note',
    grupo: 'Día a día',
  },
  {
    ruta: '/administracion/no-uso',
    etiqueta: 'Horas no usadas',
    icono: 'timer_off',
    grupo: 'Día a día',
  },
  {
    ruta: '/administracion/canchas',
    etiqueta: 'Canchas',
    icono: 'sports_tennis',
    grupo: 'El club',
  },
  {
    // T296. Socios, Usuarios y Profesores en una sola tabla de cuentas (SPEC-panel.md D2).
    ruta: '/administracion/personas',
    etiqueta: 'Personas',
    icono: 'group',
    grupo: 'El club',
  },
  {
    // T286. Ingreso, padrón, cuotas y deudores: una pantalla con pestañas.
    ruta: '/administracion/finanzas',
    etiqueta: 'Finanzas',
    icono: 'account_balance',
    grupo: 'El club',
  },
  {
    ruta: '/administracion/solicitudes',
    etiqueta: 'Consultas al club',
    icono: 'drafts',
    grupo: 'El club',
  },
  {
    ruta: '/administracion/torneos',
    etiqueta: 'Torneos',
    icono: 'emoji_events',
    grupo: 'Competencias',
  },
  {
    // T191. Junto a Torneos: son las ligas a las que suman.
    ruta: '/administracion/tours',
    etiqueta: 'Tours',
    icono: 'military_tech',
    grupo: 'Competencias',
  },
  {
    ruta: '/administracion/jugadores',
    etiqueta: 'Jugadores',
    icono: 'groups',
    grupo: 'Competencias',
  },
  {
    ruta: '/administracion/partidos-internos',
    etiqueta: 'Partidos entre socios',
    icono: 'handshake',
    grupo: 'Competencias',
  },
  {
    ruta: '/administracion/configuracion',
    etiqueta: 'Configuración',
    icono: 'settings',
    grupo: 'Al pie',
  },
  {
    ruta: '/estado',
    etiqueta: 'Estado del sistema',
    icono: 'monitor_heart',
    grupo: 'Al pie',
  },
];

@Component({
  selector: 'app-cascaron-admin',
  imports: [
    MatDivider,
    MatIcon,
    MatIconButton,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatSidenavModule,
    MatToolbar,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    Logotipo,
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

    <!-- MASTER.md § La barra lateral de administración, como un mat-sidenav (T260): fija al lado
         del contenido desde 768 px y, en el teléfono, un cajón que se abre con el botón del menú
         y le devuelve el foco al cerrarse. El documento es el que se desplaza, como antes: la
         barra queda fija en la ventana (fixedInViewport) y el tema le quita a los contenedores
         el overflow con que Material los vuelve su propio scroll. -->
    <mat-sidenav-container class="panel">
      <mat-sidenav
        #cajon
        class="barra-del-panel"
        fixedInViewport
        [mode]="escritorio() ? 'side' : 'over'"
        [opened]="escritorio()"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-center justify-between gap-2 border-b border-border px-6 py-4">
            <div>
              <app-logotipo [destino]="inicio()" />
              <span
                class="font-display text-xs font-bold tracking-widest text-muted-foreground
                       uppercase"
              >
                Administración
              </span>
            </div>
            @if (!escritorio()) {
              <button
                matIconButton
                type="button"
                class="rounded-lg p-2 hover:bg-muted"
                aria-label="Cerrar el menú"
                (click)="cajon.close()"
              >
                <mat-icon class="text-2xl" aria-hidden="true">close</mat-icon>
              </button>
            }
          </div>

          <!-- El ítem activo es un rótulo, la placa de la transmisión, y ya no una
               franja de color al costado (TV2.5): la franja era la marca de
               interfaz en serie que cazó el detector en D8.2, y un test la prohíbe.
               El hover va solo en los inactivos: sobre el rótulo pintaría un fondo
               claro bajo un texto blanco. -->
          <nav aria-label="Administración" class="flex-1 overflow-y-auto py-4">
            @for (grupo of grupos(); track grupo.titulo) {
              @if (grupo.titulo === 'Al pie') {
                <mat-divider class="my-2" />
              } @else if (conSubtitulos()) {
                <h2
                  class="px-4 pt-4 pb-2 font-display text-xs font-bold tracking-widest
                         text-muted-foreground uppercase"
                >
                  {{ grupo.titulo }}
                </h2>
              }
              <ul class="grid gap-1">
                @for (item of grupo.items; track item.ruta) {
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
                      (click)="alElegir()"
                    >
                      <mat-icon class="text-xl" aria-hidden="true">{{ item.icono }}</mat-icon>
                      {{ item.etiqueta }}
                    </a>
                  </li>
                }
              </ul>
            }
          </nav>

          <div class="border-t border-border p-3">
            @if (usuario(); as sesion) {
              <!-- Un mat-menu (T261), que se abre hacia arriba: al pie de la barra no hay
                   lugar abajo. -->
              <button
                type="button"
                class="flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-start
                       transition-colors hover:bg-muted"
                [attr.aria-label]="'Opciones de ' + sesion.nombre"
                [matMenuTriggerFor]="menuDelPie"
              >
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
                  <!-- Lo que es en el club, y no el correo, que ya sabe (T276). -->
                  <span class="block truncate text-xs text-muted-foreground">
                    {{ tipos() }}
                  </span>
                </span>
                <mat-icon class="text-muted-foreground" aria-hidden="true">more_vert</mat-icon>
              </button>

              <mat-menu #menuDelPie="matMenu" yPosition="above">
                <a mat-menu-item routerLink="/">Volver al sitio</a>
                <button mat-menu-item type="button" (click)="salir()">Salir</button>
              </mat-menu>
            }
          </div>
        </div>
      </mat-sidenav>

      <mat-sidenav-content>
        <!-- En el teléfono, la cabecera con el botón del menú: el diseño no dibuja esta
             pantalla en móvil, y el master dice cajón. -->
        @if (!escritorio()) {
          <mat-toolbar
            class="cabecera-del-panel sticky top-0 z-40 gap-3 border-b border-border shadow-sm"
          >
            <button
              matIconButton
              type="button"
              class="rounded-lg p-2 hover:bg-muted"
              aria-label="Abrir el menú de administración"
              (click)="cajon.open()"
            >
              <mat-icon class="text-2xl" aria-hidden="true">menu</mat-icon>
            </button>
            <app-logotipo [destino]="inicio()" />
            <span
              class="font-display text-xs font-bold tracking-widest text-muted-foreground
                     uppercase"
            >
              Administración
            </span>
          </mat-toolbar>
        }

        <main id="contenido" class="min-w-0 px-4 py-8 md:px-8">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
})
export class CascaronAdmin {
  private readonly auth = inject(Auth);
  private readonly cajon = viewChild.required<MatSidenav>('cajon');

  /** Desde `md` (768 px) la barra va fija al lado; abajo, es un cajón. */
  private static readonly ESCRITORIO = '(min-width: 768px)';
  private readonly pantallas = inject(BreakpointObserver);
  protected readonly escritorio = toSignal(
    this.pantallas.observe(CascaronAdmin.ESCRITORIO).pipe(map((estado) => estado.matches)),
    { initialValue: this.pantallas.isMatched(CascaronAdmin.ESCRITORIO) },
  );

  protected readonly usuario = this.auth.usuario;

  /** Los que este usuario puede ver (T220): el gestor, la agenda; el profesor, Clases. */
  private readonly items = computed(() =>
    SECCIONES_DEL_PANEL.filter((item) => puedeVer(item.ruta, this.usuario())),
  );

  /** Los grupos con algo que este usuario puede ver, en su orden, y lo de al pie al final. */
  protected readonly grupos = computed(() =>
    [...GRUPOS, 'Al pie' as const]
      .map((titulo) => ({ titulo, items: this.items().filter((item) => item.grupo === titulo) }))
      .filter((grupo) => grupo.items.length > 0),
  );

  /** Un subtítulo separa grupos: con uno solo a la vista (el gestor, el profesor), sobra. */
  protected readonly conSubtitulos = computed(
    () => this.grupos().filter((grupo) => grupo.titulo !== 'Al pie').length > 1,
  );

  /** Adónde lleva el logotipo: la portada del panel de cada uno. */
  protected readonly inicio = computed(
    () => inicioDelPanel(this.usuario()) ?? '/',
  );

  /** «Administrador · Socio», o «Invitado» (T276). */
  protected readonly tipos = computed(() => {
    const usuario = this.usuario();
    return usuario ? tiposDelUsuario(usuario).join(' · ') : '';
  });

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

  /** En el teléfono, elegir una sección cierra el cajón; en el escritorio la barra se queda. */
  protected alElegir(): void {
    if (!this.escritorio()) void this.cajon().close();
  }

}
