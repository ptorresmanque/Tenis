import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Disponibilidad } from '../catalogo-canchas/disponibilidad';
import { nombreDeSuperficie } from '../catalogo-canchas/superficies';
import { Club } from './club.service';
import { Foto } from '../ui/foto';
import { Insignia } from '../ui/insignia';
import { FormularioContacto } from './formulario-contacto';
import { Tarifas } from './tarifas';

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
 * solo si tiene contenido. El mapa sigue fuera: necesita un proveedor.
 */
@Component({
  selector: 'app-el-club',
  imports: [RouterLink, Foto, Insignia, FormularioContacto, Tarifas],
  template: `
    <!-- BANDA 1 — El club, con su cara. -->
    <section
      class="relative isolate -mx-4 overflow-hidden sm:mx-0 sm:rounded-region"
      aria-labelledby="el-club"
    >
      <app-foto
        descripcion="El club visto desde la entrada, con las canchas y el edificio al fondo"
        proporcion="16/9"
        [prioritaria]="true"
        claseCaja="min-h-[24rem]"
      />
      <div
        class="absolute inset-0 bg-gradient-to-t from-campo via-campo/90 to-campo/65"
        aria-hidden="true"
      ></div>

      <div class="absolute inset-0 flex flex-col justify-end gap-3 p-6 text-on-campo sm:p-10">
        <h1 id="el-club" class="titular text-6xl sm:text-7xl lg:text-8xl">
          FEDAL Tennis Center
        </h1>
        <p class="max-w-prose text-lg text-on-campo/90">
          Un club de barrio con canchas de torneo. Desde 2008, abierto a socios y a
          quien quiera venir a jugar una hora.
        </p>
      </div>
    </section>

    <!--
      BANDA 2 — Las canchas, agrupadas y no listadas.

      Ocho tarjetas idénticas no dicen nada que la persona pueda usar: todas son
      de la misma superficie. Lo que cambia entre ellas —techo e iluminación— es
      lo que decide si se puede jugar con lluvia o de noche, así que se agrupan
      por eso y el nombre queda como etiqueta.
    -->
    <section class="mt-16" aria-labelledby="las-canchas">
      <h2 id="las-canchas" class="titular text-5xl sm:text-6xl">Las canchas</h2>
      <p class="mt-2 max-w-prose text-muted-foreground">
        Todas de superficie dura y velocidad media, como el Australian Open. Las dos
        centrales se llaman Basilea y Manacor, y el club no da más explicaciones.
      </p>

      @if (canchas().length > 0) {
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
                      <app-insignia variante="info" icono="sports_tennis">
                        {{ superficie(cancha.superficie) }}
                      </app-insignia>
                      @if (cancha.iluminacion) {
                        <app-insignia variante="neutro" icono="lightbulb">
                          Con iluminación
                        </app-insignia>
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
      class="-mx-4 mt-16 bg-campo px-4 py-10 text-on-campo sm:mx-0 sm:rounded-region sm:px-8"
      aria-labelledby="como-funciona"
    >
      <h2 id="como-funciona" class="titular text-5xl sm:text-6xl">Cómo se reserva</h2>

      <ol class="mt-6 grid gap-8 md:grid-cols-3">
        @for (paso of PASOS; track paso.titulo; let i = $index) {
          <li>
            <p class="font-display text-marcador-lg leading-none" aria-hidden="true">
              {{ i + 1 }}
            </p>
            <h3 class="mt-2 font-display text-xl font-bold tracking-wide uppercase">
              {{ paso.titulo }}
            </h3>
            <p class="mt-1 text-on-campo/85">{{ paso.detalle }}</p>
          </li>
        }
      </ol>
    </section>

    <!--
      BANDA 4 — Dónde encontrarnos. Datos, sin cajas alrededor.

      **El horario ya no está acá.** Decía "todos los días de 08:00 a 22:00"
      escrito a mano en esta plantilla, mientras treinta líneas más abajo el
      componente de tarifas publicaba el horario real que el club edita desde su
      panel: sábado y domingo de 09:00 a 20:00. La misma pantalla se contradecía
      a sí misma. Un dato del club se muestra una vez y sale de la configuración.
    -->
    <section class="mt-16" aria-labelledby="horarios-y-contacto">
      <h2 id="horarios-y-contacto" class="titular text-5xl sm:text-6xl">
        Dónde encontrarnos
      </h2>

      <dl class="mt-6 grid gap-8 border-t border-border pt-6 sm:grid-cols-2">
        <div>
          <dt
            class="flex items-center gap-2 font-display text-lg font-bold tracking-wide uppercase"
          >
            <span class="icono text-primary" aria-hidden="true">place</span>
            Dónde y cómo ubicarnos
          </dt>
          <dd class="mt-2 grid gap-1 text-muted-foreground">
            @if (club().direccion) {
              <span>{{ club().direccion }}</span>
            }
            @if (club().telefono) {
              <a [href]="'tel:' + club().telefono" class="underline hover:text-primary">
                {{ club().telefono }}
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
          </dd>
        </div>
      </dl>
    </section>

    <section class="mt-16">
      <app-tarifas />
    </section>

    <section class="mt-16">
      <app-formulario-contacto />
    </section>

    <section class="mt-16 flex flex-wrap justify-center gap-3">
      <a routerLink="/disponibilidad" class="boton boton-primario">
        Ver disponibilidad
      </a>
      <a routerLink="/registro" class="boton boton-secundario">Crear cuenta</a>
    </section>
  `,
})
export class ElClub {
  private readonly disponibilidad = inject(Disponibilidad);

  protected readonly club = inject(Club).datos;

  /** Solo el catálogo: esta página no muestra horas, así que no las pide. */
  private readonly catalogo = resource({
    loader: () => this.disponibilidad.canchas(),
    defaultValue: [],
  });

  protected readonly canchas = this.catalogo.value;

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
        'El socio usa su cupo. Quien no lo es deja su nombre y paga en línea al momento.',
    },
    {
      titulo: 'Ven a jugar',
      detalle:
        'Llega 10 minutos antes y anúnciate en recepción con tu folio.',
    },
  ];

  protected readonly superficie = nombreDeSuperficie;
}
