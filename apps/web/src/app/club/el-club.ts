import { ViewportScroller } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  inject,
  resource,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';

import { Disponibilidad } from '../catalogo-canchas/disponibilidad';
import { nombreDeSuperficie } from '../catalogo-canchas/superficies';
import { Club } from './club.service';
import { Foto } from '../ui/foto';
import { FormularioContacto } from './formulario-contacto';
import { enlacesDelMapa } from './mapa';
import { RedesSociales } from './redes-sociales';
import { Tarifas } from './tarifas';
import { TiendaYCafeteria } from './tienda-y-cafeteria';
import { EnlaceTelefonoPipe, TelefonoPipe } from '../core/telefono';
import { Esqueleto } from '../ui/esqueleto';

/**
 * La página que explica el club a quien todavía no reservó.
 *
 * Casi toda estática, con una excepción: **las canchas se leen de la API**. Una
 * lista escrita a mano acá queda desactualizada la primera vez que el club
 * publica una cancha nueva desde su panel, y nadie se acuerda de venir a
 * corregirla.
 *
 * La dirección, el teléfono y el correo salen de la configuración del club, no de
 * este archivo: el diseño los traía de relleno —una calle española y un teléfono
 * que no existe— y ahora los escribe el club desde su panel. Cada línea aparece
 * solo si tiene contenido. El mapa también (T101): sale si el club cargó su
 * ubicación (T100), y es de OpenStreetMap, ver `mapa.ts`.
 *
 * Los textos del hero y el de las canchas también los escribe el club, en "Textos del
 * sitio" (T142, T143). Una bajada o un texto de canchas vacío no deja un párrafo vacío.
 */
@Component({
  selector: 'app-el-club',
  imports: [
    MatButton,
    MatIcon,
    RouterLink,
    Foto,
    FormularioContacto,
    Tarifas,
    EnlaceTelefonoPipe,
    TelefonoPipe,
    RedesSociales,
    Esqueleto,
    TiendaYCafeteria,
    MatChipsModule,
  ],
  template: `
    <!-- BANDA 1 — El club, con su cara. -->
    <section
      class="relative isolate a-sangre overflow-hidden hero-animado"
      aria-labelledby="el-club"
    >
      <!-- La cancha con el logo, que antes era la de la portada (T305, SPEC-sitio.md D7). -->
      <app-foto
        descripcion="Las canchas al aire libre del club en un día despejado, con el logo de FEDAL pintado en la cancha"
        src="/fotos/portada.jpg"
        proporcion="16/9"
        [prioritaria]="true"
        claseCaja="min-h-[24rem]"
      />
      <div
        class="absolute inset-0 velo-foto"
        aria-hidden="true"
      ></div>

      <div
        class="absolute inset-0 flex flex-col justify-end gap-3 py-6 px-sangre-6 text-on-campo
               texto-sobre-foto hero-texto sm:py-10 sm:px-sangre-10"
      >
        <!-- Los textos los escribe el club en "Textos del sitio" (T142). Texto plano:
             la interpolación muestra un <b> como texto, y pre-line respeta los saltos
             de línea que el admin escribió. -->
        <h1 id="el-club" class="titular text-6xl sm:text-7xl lg:text-8xl">
          {{ club().elClubTitulo }}
        </h1>
        @if (club().elClubBajada) {
          <p class="max-w-prose text-lg whitespace-pre-line text-on-campo/90">{{ club().elClubBajada }}</p>
        }
      </div>
    </section>

    <!--
      BANDA 2 — Las canchas, agrupadas y no listadas.

      Ocho tarjetas idénticas no dicen nada que la persona pueda usar: todas son
      de la misma superficie. Lo que cambia entre ellas —techo e iluminación— es
      lo que decide si se puede jugar con lluvia o de noche, así que se agrupan
      por eso y el nombre queda como etiqueta.
    -->
    <section class="mt-16 aparece-al-pasar" aria-labelledby="las-canchas">
      <h2 id="las-canchas" class="titular text-5xl sm:text-6xl">Las canchas</h2>
      @if (club().elClubCanchas) {
        <p class="mt-2 max-w-prose whitespace-pre-line text-muted-foreground">{{ club().elClubCanchas }}</p>
      }

      @if (catalogo.isLoading()) {
        <app-esqueleto class="mt-6 block" [filas]="4" etiqueta="Cargando las canchas…" />
      } @else if (canchas().length > 0) {
        <div class="mt-6 grid gap-8 md:grid-cols-2">
          @for (grupo of gruposDeCanchas(); track grupo.titulo) {
            <!-- Cada grupo es una cifra de marcador con su raya, como las de la
                 portada (TV4.1): cuántas hay y de qué tipo, de un vistazo. -->
            <div class="border-t-4 border-primary pt-3">
              <p class="flex items-baseline gap-3">
                <span class="font-display text-marcador text-primary">
                  {{ grupo.canchas.length }}
                </span>
                <span
                  class="font-display text-xl font-bold tracking-wide text-muted-foreground
                         uppercase"
                >
                  {{ grupo.titulo }}
                </span>
              </p>
              <p class="mt-1 text-sm text-muted-foreground">{{ grupo.detalle }}</p>

              <ul class="mt-4 divide-y divide-border border-t border-border">
                @for (cancha of grupo.canchas; track cancha.id) {
                  <li class="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span class="font-display text-lg font-bold tracking-wide uppercase">
                      {{ cancha.nombre }}
                    </span>
                    <span class="flex flex-wrap gap-2">
                      <mat-chip-set class="insignias">
                        <mat-chip class="insignia info">
                          <mat-icon matChipAvatar aria-hidden="true">sports_tennis</mat-icon>
                          {{ superficie(cancha.superficie) }}
                        </mat-chip>
                      </mat-chip-set>
                      @if (cancha.iluminacion) {
                        <mat-chip-set class="insignias">
                          <mat-chip class="insignia neutro">
                            <mat-icon matChipAvatar aria-hidden="true">lightbulb</mat-icon>
                            Con iluminación
                          </mat-chip>
                        </mat-chip-set>
                      }
                    </span>
                  </li>
                }
              </ul>
            </div>
          }
        </div>
      }
    </section>

    <!--
      BANDA 3 — Los tres pasos, en cifras.

      El número es lo que ordena la lectura, así que va grande y el texto se
      cuelga de él. Sin cajas: tres columnas separadas por una línea alcanzan.
    -->
    <section
      class="a-sangre mt-16 bg-campo px-sangre-4 py-10 text-on-campo aparece-al-pasar
             sm:px-sangre-8"
      aria-labelledby="como-funciona"
    >
      <h2 id="como-funciona" class="titular text-5xl sm:text-6xl">Cómo se reserva</h2>

      <ol class="mt-6 grid gap-8 md:grid-cols-3">
        @for (paso of PASOS; track paso.titulo; let i = $index) {
          <li>
            <p class="font-display text-marcador-lg leading-none" aria-hidden="true">
              {{ i + 1 }}
            </p>
            <h3 class="mt-2 titulo-tarjeta">
              {{ paso.titulo }}
            </h3>
            <p class="mt-1 text-on-campo/85">{{ paso.detalle }}</p>
          </li>
        }
      </ol>
    </section>

    <!--
      La tienda y la cafetería (T186), con todas sus fotos. Antes de «Dónde
      encontrarnos»: es lo que hay en el lugar, y a continuación, cómo llegar. La
      portada enlaza a esta sección por su ancla.
    -->
    <app-tienda-y-cafeteria forma="completa" />

    <!--
      BANDA 4 — Dónde encontrarnos. Datos, sin cajas alrededor.

      **El horario ya no está acá.** Decía "todos los días de 08:00 a 22:00"
      escrito a mano en esta plantilla, mientras treinta líneas más abajo el
      componente de tarifas publicaba el horario real que el club edita desde su
      panel: sábado y domingo de 09:00 a 20:00. La misma pantalla se contradecía
      a sí misma. Un dato del club se muestra una vez y sale de la configuración.
    -->
    <section class="mt-16 aparece-al-pasar" aria-labelledby="horarios-y-contacto">
      <h2 id="horarios-y-contacto" class="titular text-5xl sm:text-6xl">
        Dónde encontrarnos
      </h2>

      <div class="mt-6 grid gap-8 border-t border-border pt-6 sm:grid-cols-2">
        <dl>
          <div>
            <dt
              class="flex items-center gap-2 font-display text-lg font-bold tracking-wide uppercase"
            >
              <mat-icon class="text-primary" aria-hidden="true">place</mat-icon>
              Dónde y cómo ubicarnos
            </dt>
            <dd class="mt-2 grid gap-1 text-muted-foreground">
              @if (club().direccion) {
                <span>{{ club().direccion }}</span>
              }
              @if (club().telefono) {
                <a [href]="club().telefono | enlaceTelefono" class="underline hover:text-primary">
                  {{ club().telefono | telefono }}
                </a>
              }
              @if (club().email) {
                <a [href]="'mailto:' + club().email" class="underline hover:text-primary">
                  {{ club().email }}
                </a>
              }
              <!-- Con la configuración en blanco no queda una ficha a medias: queda
                   una frase que sirve igual. -->
              @if (!club().direccion && !club().telefono && !club().email) {
                <span>Pregunta en el mesón: te atienden todos los días.</span>
              }
              <!-- T141. Bajo el contacto: son otra forma de escribirle al club. -->
              <app-redes-sociales clase="-ms-3" />
            </dd>
          </div>
        </dl>

        @if (mapa(); as mapa) {
          <!-- T101. OpenStreetMap y no Google: cargar el mapa no le pasa a nadie la IP de
               quien mira. Google Maps y Waze van como enlaces, que la persona elige abrir. -->
          <div>
            <iframe
              [src]="mapa.incrustado"
              [title]="'Mapa con la ubicación de ' + club().nombre"
              loading="lazy"
              referrerpolicy="no-referrer"
              class="aspect-[4/3] w-full border border-border"
            ></iframe>
            <p class="mt-3 flex flex-wrap gap-3">
              <a
                matButton="outlined"
                [href]="mapa.googleMaps"
                target="_blank"
                rel="noopener"
              >
                Cómo llegar con Google Maps
                <span class="sr-only">(se abre en otra pestaña)</span>
              </a>
              <a matButton="outlined" [href]="mapa.waze" target="_blank" rel="noopener">
                Cómo llegar con Waze
                <span class="sr-only">(se abre en otra pestaña)</span>
              </a>
            </p>
          </div>
        }
      </div>
    </section>

    <section class="mt-16 aparece-al-pasar">
      <app-tarifas />
    </section>

    <section class="mt-16 aparece-al-pasar">
      <!-- T146. Antes de escribir: puede que la respuesta ya esté publicada. -->
      <p class="mb-6 max-w-prose text-muted-foreground">
        ¿Tienes una duda? Puede que ya esté en las
        <a routerLink="/preguntas-frecuentes" class="font-semibold text-primary underline">preguntas frecuentes</a>.
      </p>
      <app-formulario-contacto />
    </section>

    <section class="mt-16 flex flex-wrap justify-center gap-3 aparece-al-pasar">
      <a matButton="filled" routerLink="/disponibilidad">
        Reservar cancha
      </a>
      <a matButton="outlined" routerLink="/registro">Crear cuenta</a>
    </section>
  `,
})
export class ElClub {
  private readonly disponibilidad = inject(Disponibilidad);

  protected readonly club = inject(Club).datos;

  private readonly sanitizador = inject(DomSanitizer);

  /**
   * El mapa y cómo llegar, si el club cargó su ubicación (T101).
   *
   * El `src` del `<iframe>` se marca como confiable porque `enlacesDelMapa` lo arma
   * solo con dos números: no puede traer nada que no sean coordenadas.
   */
  protected readonly mapa = computed(() => {
    const enlaces = enlacesDelMapa(this.club());
    return (
      enlaces && {
        ...enlaces,
        incrustado: this.sanitizador.bypassSecurityTrustResourceUrl(enlaces.incrustado),
      }
    );
  });

  /** Solo el catálogo: esta página no muestra horas, así que no las pide. */
  protected readonly catalogo = resource({
    loader: () => this.disponibilidad.canchas(),
    defaultValue: [],
  });

  /** Si el catálogo no carga, la sección se calla: `value()` lanza en error. */
  protected readonly canchas = computed(() =>
    this.catalogo.hasValue() ? this.catalogo.value() : [],
  );

  /**
   * Las canchas partidas por lo único que las distingue de verdad.
   *
   * Son ocho y todas de la misma superficie: una lista de ocho tarjetas iguales
   * obliga a leerlas todas para descubrir que no hay nada que elegir. Lo que sí
   * cambia entre ellas es si tienen techo, que es lo que decide si se juega con
   * lluvia. Un grupo vacío no se pinta.
   */
  protected readonly gruposDeCanchas = computed(() =>
    [
      {
        titulo: 'techadas',
        detalle: 'Se juega igual con lluvia, y en invierno son las primeras que se toman.',
        canchas: this.canchas().filter((cancha) => cancha.techada),
      },
      {
        titulo: 'al aire libre',
        detalle: 'Las de siempre, con la cancha entera a la vista.',
        canchas: this.canchas().filter((cancha) => !cancha.techada),
      },
    ].filter((grupo) => grupo.canchas.length > 0),
  );

  protected readonly PASOS = [
    {
      titulo: 'Elige día y hora',
      detalle:
        'La grilla muestra las canchas libres con su precio, sin tener que preguntar.',
    },
    {
      titulo: 'Reserva',
      detalle:
        'Si eres socio, confirmas y listo. Si no, pagas en línea con Webpay y la hora ' +
        'queda tuya al tiro.',
    },
    {
      titulo: 'Ven a jugar',
      detalle:
        'Llega 10 minutos antes y anúnciate en recepción con tu folio.',
    },
  ];

  protected readonly superficie = nombreDeSuperficie;

  constructor() {
    this.sostenerElAncla();
  }

  /**
   * Llegar con un ancla, como «Hazte socio» a `#titulo-contacto` (SPEC-sitio.md, Decimoséptima
   * parte): el router salta al llegar, pero arriba todavía cargan las canchas y las tarifas, y
   * la página crece. Chrome y Firefox corrigen el salto solos (scroll anchoring); Safari no, y
   * en un iPhone se quedaba en las tarifas. Mientras crece, se vuelve a buscar el ancla.
   *
   * Solo hasta que la persona tome el control, o 10 segundos: después, moverla sería quitársela
   * de las manos. Tomar el control es la rueda, el teclado o `pointerdown`, que a diferencia de
   * `touchstart` cubre también el mouse y el lápiz. El tope es de 10 y no de 3 segundos porque
   * con una conexión lenta las canchas y las tarifas llegan después de los 3, y Safari volvía a
   * dejar a la persona en las tarifas; un tope largo no estorba, porque el primer gesto suelta
   * el ancla al tiro.
   */
  private sostenerElAncla(): void {
    const ancla = inject(ActivatedRoute).snapshot.fragment;
    if (!ancla) return;
    const desplazador = inject(ViewportScroller);
    const destruir = inject(DestroyRef);

    afterNextRender(() => {
      const observador = new ResizeObserver(() => desplazador.scrollToAnchor(ancla));
      const gestos = ['wheel', 'pointerdown', 'keydown'] as const;
      const soltar = () => {
        observador.disconnect();
        clearTimeout(plazo);
        for (const gesto of gestos) removeEventListener(gesto, soltar);
      };
      const plazo = setTimeout(soltar, 10_000);

      observador.observe(document.body);
      for (const gesto of gestos) addEventListener(gesto, soltar, { passive: true });
      destruir.onDestroy(soltar);
    });
  }
}
