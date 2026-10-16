import { ViewportScroller } from '@angular/common';
import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatToolbar } from '@angular/material/toolbar';

import { Club } from '../club/club.service';
import { RedesSociales } from '../club/redes-sociales';
import { ProgresoDeNavegacion } from '../ui/progreso-de-navegacion';
import { VolverArriba } from '../ui/volver-arriba';
import { Auth } from '../core/auth/auth';
import { inicioDelPanel } from '../core/auth/tipos-del-panel';
import { tiposDelUsuario } from '../core/auth/tipos-del-usuario';
import { Logotipo } from './logotipo';
import { MenuDelTelefono } from './menu-del-telefono';
import { ConmutadorDeTema } from './conmutador-de-tema';
import { usarTemaPublico } from './tema';
import { EnlaceTelefonoPipe, TelefonoPipe } from '../core/telefono';

/**
 * El sitio público: barra superior, contenido y pie.
 *
 * Los enlaces del panel de administración **no** están acá. Antes vivían en esta
 * misma barra —siete enlaces para el admin, cuatro para el resto—; ahora el panel
 * tiene su propia barra lateral y la puerta de entrada es el menú del avatar. La
 * barra pública se ve igual para todos.
 *
 * **El menú se define en un solo lugar**, el `computed` de abajo, y de ahí lo leen
 * tanto la barra de escritorio como el cajón del teléfono. Que hubiera cuatro
 * versiones distintas del mismo menú era deuda de la referencia de Stitch, no del
 * código.
 *
 * Con sesión de socio son ocho enlaces, y por eso la barra aparece recién en `lg`:
 * a 768px no caben. El punto de corte está explicado donde se aplica.
 */
@Component({
  selector: 'app-cascaron-publico',
  imports: [
    MatButton,
    MatIconButton,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatToolbar,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    Logotipo,
    MenuDelTelefono,
    ConmutadorDeTema,
    EnlaceTelefonoPipe,
    TelefonoPipe,
    RedesSociales,
    VolverArriba,
    ProgresoDeNavegacion,
  ],
  template: `
    <!-- Al quedar libre el navegador (I6), como el conmutador: la barra solo hace falta cuando
         una navegación tarda, y la de Material pesa 14 kB. -->
    @defer (on idle) {
      <app-progreso-de-navegacion />
    }

    <a
      href="#contenido"
      class="sr-only print:hidden focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50
             focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:shadow-lg"
    >
      Saltar al contenido
    </a>

    <header
      #encabezado
      class="sticky top-0 z-40 border-b border-border bg-card shadow-sm print:hidden"
    >
      <mat-toolbar class="mx-auto max-w-[90rem] gap-6">
        <app-logotipo />

        <!-- Desde lg y no desde md: con sesión de socio el menú lleva ocho
             enlaces, que a 768px se salen 247px de la pantalla. Medido el
             2026-09-08 a ese ancho, que es el de una tablet vertical y el de una
             ventana a media pantalla.
             En mayúscula (TV2.4) los ocho a 1024 partían "Mis reservas" y otros
             tres en dos líneas: necesitaban 997px y había 992. Por eso no se
             parten (whitespace-nowrap) y llevan poco relleno. Desde T276 también desde
             xl: con el nombre y los tipos junto al avatar, a 1280 faltaban 30px. -->
        <nav aria-label="Principal" class="hidden gap-1 text-sm lg:flex">
          @for (item of navegacion(); track item.ruta) {
            <a
              [routerLink]="item.ruta"
              routerLinkActive="text-primary underline decoration-2 underline-offset-8"
              ariaCurrentWhenActive="page"
              class="rounded-md px-2 py-2 font-display font-bold whitespace-nowrap
                     uppercase tracking-wide text-muted-foreground transition-colors
                     hover:bg-muted hover:text-foreground"
            >
              {{ item.etiqueta }}
            </a>
          }
        </nav>

        <div class="ms-auto flex items-center gap-2">
          <!-- Al quedar libre el navegador y no en el arranque (I6): el grupo de opciones de
               Material pesa 84 kB, y el conmutador no es lo primero que se mira. El
               placeholder mide lo mismo, para que la barra no salte cuando llega. -->
          @defer (on idle) {
            <app-conmutador-de-tema />
          } @placeholder {
            <div class="h-9 w-26.5" aria-hidden="true"></div>
          }

          @if (usuario(); as sesion) {
            <!-- Quién tiene la sesión y qué es en el club, a la vista (T276): todos sus tipos.
                 Donde cabe: de md a lg, que no tiene los enlaces en la barra, y desde xl. En
                 el teléfono y entre lg y xl, los enlaces la llenan, y va dentro del menú. Con
                 tope de ancho: los tipos pasan a otra línea antes de empujar la barra. Texto
                 plano y fuera del @defer: no suma al arranque. -->
            <p
              data-cuenta
              class="hidden max-w-28 text-end leading-tight md:block lg:hidden xl:block"
            >
              <span class="block text-sm font-semibold">{{ sesion.nombre }}</span>
              <span class="block text-xs text-muted-foreground">{{ tipos() }}</span>
            </p>

            <!-- El menú de la cuenta es un mat-menu (T261): se usa con las flechas como un
                 menú, Esc lo cierra y le devuelve el foco al avatar. Llega al quedar libre el
                 navegador y no en el arranque (I6), como el conmutador: el menú y su overlay
                 pesan 82 kB. El placeholder es el mismo círculo con las iniciales. -->
            @defer (on idle) {
              <button
                matIconButton
                type="button"
                class="flex size-10 items-center justify-center rounded-full bg-primary text-sm
                       font-bold text-on-primary hover:opacity-90"
                [attr.aria-label]="'Menú de ' + sesion.nombre"
                [matMenuTriggerFor]="menuDeLaCuenta"
              >
                {{ iniciales() }}
              </button>

              <mat-menu #menuDeLaCuenta="matMenu" xPosition="before">
                <p class="border-b border-border px-3 py-2" role="none">
                  <span class="block font-semibold">{{ sesion.nombre }}</span>
                  <span class="block text-xs">{{ tipos() }}</span>
                  <span class="block text-xs text-muted-foreground">
                    {{ sesion.email }}
                  </span>
                </p>

                @if (sesion.socioId !== null) {
                  <a mat-menu-item routerLink="/mis-reservas">Mis reservas</a>
                  <a mat-menu-item routerLink="/mi-cuenta">Mi cuenta</a>
                }
                @if (inicioDelPanel(); as destino) {
                  <a mat-menu-item [routerLink]="destino">Administración</a>
                }
                <button mat-menu-item type="button" (click)="salir()">Salir</button>
              </mat-menu>
            } @placeholder {
              <span
                class="flex size-10 items-center justify-center rounded-full bg-primary text-sm
                       font-bold text-on-primary"
                aria-hidden="true"
              >
                {{ iniciales() }}
              </span>
            }
          } @else {
            <a matButton routerLink="/entrar" class="hidden sm:inline-flex">
              Entrar
            </a>
            <!-- El del encabezado y el del menú móvil no se ven juntos: el menú es modal.
                 mat-guidelines-ignore: multiples-filled -->
            <a matButton="filled" routerLink="/registro" class="hidden sm:inline-flex">
              Crear cuenta
            </a>
          }

          <button
            #botonDelMenu
            matIconButton
            type="button"
            class="rounded-lg p-2 text-foreground hover:bg-muted lg:hidden"
            aria-label="Abrir el menú"
            (click)="menuAbierto.set(true)"
          >
            <mat-icon class="text-2xl" aria-hidden="true">menu</mat-icon>
          </button>
        </div>
      </mat-toolbar>
    </header>

    <!-- tabindex -1: "Saltar al contenido" y "Volver arriba" (T149) le pasan el foco.
         Sin anillo: el foco va al comienzo de la página, no a un control. -->
    <main id="contenido" tabindex="-1" class="mx-auto max-w-[90rem] px-4 py-8 focus:outline-none">
      <router-outlet />
    </main>

    <!-- El menú del teléfono (T263): llega al quedar libre el navegador o al tocar el botón, y
         no en el arranque (I6), porque el sidenav con su trampa de foco pesa unos 50 kB. Si se
         toca antes, el mismo toque lo carga y lo abre. -->
    @defer (on idle; on interaction(botonDelMenu)) {
      <app-menu-del-telefono [navegacion]="navegacion()" [(abierto)]="menuAbierto" />
    }

    <app-volver-arriba />

    <!-- El pie, en banda de campo y no de rótulo: en oscuro el rótulo es una
         placa clara, y un pie claro a todo el ancho sería la zona más brillante
         de la pantalla (revisión de TV1.4). El logotipo usa sus colores para
         fondo oscuro, porque en claro su azul es el mismo del campo. -->
    <footer class="logotipo-sobre-campo mt-16 bg-campo text-on-campo print:hidden">
      <div class="mx-auto grid max-w-[90rem] gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <app-logotipo />
          <p class="mt-3 max-w-xs text-sm text-on-campo/80">
            Canchas duras, todas de la misma superficie. Reserva en línea.
          </p>
          <!-- Las redes que el club cargó (T141). El margen negativo alinea el primer
               logo con el texto: la caja táctil mide el doble que el dibujo. -->
          <app-redes-sociales clase="mt-3 -ms-3" />
        </div>

        <nav aria-labelledby="pie-reservas">
          <h2 id="pie-reservas" class="font-display text-sm font-bold uppercase">
            Reservas
          </h2>
          <ul class="mt-3 grid gap-2 text-sm text-on-campo/80">
            @for (item of navegacion(); track item.ruta) {
              <li>
                <a [routerLink]="item.ruta" class="hover:text-on-campo hover:underline">
                  {{ item.etiqueta }}
                </a>
              </li>
            }
          </ul>
        </nav>

        <!-- Acá decía "todos los días, de 08:00 a 22:00", escrito a mano y
             repetido en las quince pantallas públicas. El horario de verdad sale
             del endpoint de horarios y el club lo edita desde su panel: sábado y
             domingo cierran a las 20:00, así que la frase era falsa en dos de
             cada siete días. Se enlaza en vez de pedir esa consulta en cada
             página solo para el pie. -->
        <div>
          <h2 class="font-display text-sm font-bold uppercase">Horarios</h2>
          <p class="mt-3 text-sm text-on-campo/80">
            <a routerLink="/el-club" class="underline hover:text-on-campo">
              Mira el horario de cada día
            </a>
          </p>
        </div>

        <!-- Los datos salen de la configuración del club, no de acá: el día que se
             mude, lo cambia el admin desde su panel y no hace falta un despliegue.
             Cada línea aparece solo si tiene algo que decir. -->
        <div>
          <h2 class="font-display text-sm font-bold uppercase">Contacto</h2>
          <ul class="mt-3 grid gap-1 text-sm text-on-campo/80">
            <!-- T146. Primero: es lo que conviene mirar antes de escribir o llamar. -->
            <li>
              <a routerLink="/preguntas-frecuentes" class="hover:text-on-campo hover:underline">
                Preguntas frecuentes
              </a>
            </li>
            @if (club().direccion) {
              <li>{{ club().direccion }}</li>
            }
            @if (club().telefono) {
              <li>
                <a [href]="club().telefono | enlaceTelefono" class="hover:text-on-campo hover:underline">
                  {{ club().telefono | telefono }}
                </a>
              </li>
            }
            @if (club().email) {
              <li>
                <a [href]="'mailto:' + club().email" class="hover:text-on-campo hover:underline">
                  {{ club().email }}
                </a>
              </li>
            }
          </ul>
        </div>
      </div>

      <!-- En el teléfono, aire abajo para que "Volver arriba" (T149), que flota en
           ese rincón, no tape el enlace de la política al llegar al final. -->
      <p
        class="border-t border-on-campo/20 px-4 pt-6 pb-20 text-center text-sm text-on-campo/80
               sm:pb-6"
      >
        © 2026 FEDAL Tennis Center ·
        <a routerLink="/privacidad" class="underline hover:text-on-campo">Política de privacidad</a>
      </p>
    </footer>
  `,
})
export class CascaronPublico {
  private readonly auth = inject(Auth);

  protected readonly usuario = this.auth.usuario;
  /** El cajón del teléfono, pedido desde el botón del menú. */
  protected readonly menuAbierto = signal(false);
  protected readonly club = inject(Club).datos;
  /** Adónde lleva "Administración": la portada del panel de cada uno, o nada (T220). */
  protected readonly inicioDelPanel = computed(() =>
    inicioDelPanel(this.usuario()),
  );

  /** El encabezado fijo, para que un ancla no deje su título debajo de él. */
  private readonly encabezado = viewChild<ElementRef<HTMLElement>>('encabezado');

  constructor() {
    usarTemaPublico();

    // T186. Al seguir un enlace con ancla (`/el-club#tienda-y-cafeteria`), el router
    // lleva la sección al borde de arriba con `window.scrollTo`, que no respeta
    // `scroll-margin`: el título quedaba debajo del encabezado. Se descuenta su alto,
    // medido al momento porque en el teléfono no mide lo mismo que en escritorio.
    inject(ViewportScroller).setOffset(() => [
      0,
      (this.encabezado()?.nativeElement.offsetHeight ?? 0) + 16,
    ]);
  }

  protected readonly navegacion = computed(() => [
    { ruta: '/disponibilidad', etiqueta: 'Disponibilidad' },
    // Para todos y no solo para socios: es la puerta del apoderado que busca clases
    // para su hijo, y ese todavía no tiene cuenta.
    { ruta: '/clases', etiqueta: 'Clases' },
    // El calendario de torneos es de las pocas cosas que un tercero mira antes de
    // asociarse: un club con torneos es un club con vida.
    { ruta: '/torneos', etiqueta: 'Torneos' },
    // T195. Entre los torneos y el ranking: son las ligas a las que suman, y cada una
    // tiene su tabla.
    { ruta: '/tours', etiqueta: 'Tours' },
    // Al lado de los torneos porque es su consecuencia: quien mira el cuadro de un
    // torneo terminado quiere saber en qué lo dejó.
    { ruta: '/ranking', etiqueta: 'Ranking' },
    // Solo para quien tiene ficha de socio: al resto la pantalla le mostraría
    // una lista siempre vacía.
    ...(this.usuario()?.socioId != null
      ? [
          { ruta: '/mis-reservas', etiqueta: 'Mis reservas' },
          // Acá y no en el sitio público: cargar un amistoso y confirmarle uno al
          // rival son cosas de socio, y al resto la pantalla le quedaría vacía.
          { ruta: '/mis-partidos', etiqueta: 'Mis partidos' },
          { ruta: '/mi-cuenta', etiqueta: 'Mi cuenta' },
        ]
      : []),
    { ruta: '/el-club', etiqueta: 'El club' },
  ]);

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

}
