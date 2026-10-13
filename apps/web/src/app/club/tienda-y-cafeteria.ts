import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { enPesos } from '../catalogo-canchas/reloj-del-club';
import { Galeria } from '../torneos/publico/galeria';
import { Club, LugarDelClub } from './club.service';
import { LOGOS } from './redes-sociales';

/** Lo que cambia entre los lugares: cómo se nombran. "De el" y "a el" no se dicen (T237). */
const LUGARES = [
  {
    clave: 'tienda',
    nombre: 'Tienda',
    conArticulo: 'la tienda',
    de: 'de la tienda',
    a: 'a la tienda',
  },
  {
    clave: 'cafeteria',
    nombre: 'Cafetería',
    conArticulo: 'la cafetería',
    de: 'de la cafetería',
    a: 'a la cafetería',
  },
  {
    clave: 'gimnasio',
    nombre: 'Gimnasio',
    conArticulo: 'el gimnasio',
    de: 'del gimnasio',
    a: 'al gimnasio',
  },
] as const;

const LISTA = new Intl.ListFormat('es', { type: 'conjunction' });

/**
 * La tienda y la cafetería del club (T186), como información: qué son, cuándo atienden,
 * cómo escribirles y cómo se ven. **El sitio no vende nada**; eso es la Etapa 2.
 *
 * Dos formas, porque las dos páginas cuentan lo mismo con distinto largo:
 *
 * - **`resumen`**, en la portada: una tarjeta por lugar con la primera foto en grande.
 * - **`completa`**, en «El club»: todas las fotos en la galería, bajo el ancla
 *   `#tienda-y-cafeteria` a la que lleva la portada.
 *
 * **Sin descripción, el lugar no aparece**, aunque tenga fotos; sin ninguno, no se dibuja
 * nada, ni el título. Así el cambio pudo salir antes de que el club escribiera algo.
 */
@Component({
  selector: 'app-tienda-y-cafeteria',
  imports: [RouterLink, Galeria],
  // Sin caja propia: la sección es la que lleva el margen, y sin lugares no queda ni eso.
  host: { class: 'contents' },
  template: `
    @if (lugares().length > 0) {
      <section
        class="mt-16 aparece-al-pasar"
        [id]="forma() === 'completa' ? 'tienda-y-cafeteria' : null"
        [attr.aria-labelledby]="idDelTitulo()"
      >
        <h2 [id]="idDelTitulo()" class="titular text-5xl sm:text-6xl">
          {{ forma() === 'resumen' ? 'También en el club' : titulo() }}
        </h2>

        <!-- Dos columnas aunque haya un solo lugar: a todo el ancho, su foto 4/3 medía
             más de 800 px de alto en escritorio. En la portada, con los tres, tres desde lg
             (T237); en «El club» siguen dos, porque cada uno lleva su galería. -->
        <div class="mt-8 grid gap-8 md:grid-cols-2" [class]="columnas()">
          @for (lugar of lugares(); track lugar.clave) {
            <article class="flex flex-col">
              <!-- El rótulo de la transmisión, encima de la foto y no sobre ella: un
                   letrero encima de una imagen tapa justo lo que se quiere mostrar. -->
              <h3
                class="self-start bg-rotulo px-4 py-1.5 font-display text-lg font-bold
                       tracking-wider text-on-rotulo uppercase corte-fin"
              >
                {{ lugar.nombre }}
              </h3>

              @if (forma() === 'resumen' && lugar.fotos.length > 0) {
                <!-- La versión grande y no la miniatura: la tarjeta mide media pantalla,
                     y la de 400 px se vería borrosa. Diferida: está bajo el pliegue. -->
                <img
                  class="aspect-[4/3] w-full bg-muted object-cover shadow-md"
                  [src]="lugar.fotos[0].imagen"
                  [alt]="lugar.fotos[0].descripcion ?? lugar.porOmision"
                  width="1600"
                  height="1200"
                  loading="lazy"
                  decoding="async"
                />
              }

              <div class="flex flex-1 flex-col border-t-4 border-primary pt-4"
                   [class.mt-4]="forma() === 'resumen' && lugar.fotos.length > 0">
                <p class="max-w-prose text-lg whitespace-pre-line">{{ lugar.descripcion }}</p>

                @if (lugar.horario) {
                  <p data-horario class="mt-3 flex items-center gap-2 text-muted-foreground">
                    <span class="icono text-primary" aria-hidden="true">schedule</span>
                    {{ lugar.horario }}
                  </p>
                }

                <!-- T237. Las tarifas del gimnasio, para mirar y no para pagar: se pagan en el
                     mesón. Una tabla, porque son dos precios por plan. -->
                @if (lugar.tarifas.length > 0) {
                  <!-- La primitiva, como las tarifas de las canchas: cifras tabulares y una
                       línea por fila. En su caja con scroll propio, también como allá: a 375 px
                       un nombre largo no empuja la página, y el encabezado fijo se queda en
                       la tabla. -->
                  <div class="mt-4 overflow-x-auto">
                    <table class="tabla">
                      <caption class="sr-only">Tarifas {{ lugar.de }}</caption>
                      <thead>
                        <tr>
                          <th scope="col">Plan</th>
                          <th scope="col">Socio</th>
                          <th scope="col">No socio</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (tarifa of lugar.tarifas; track $index) {
                          <tr>
                            <th scope="row">{{ tarifa.nombre }}</th>
                            <td class="whitespace-nowrap">{{ pesos(tarifa.precioSocioClp) }}</td>
                            <td class="whitespace-nowrap">{{ pesos(tarifa.precioNoSocioClp) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }

                @if (forma() === 'completa') {
                  <app-galeria [fotos]="lugar.fotos" titulo="" [porOmision]="lugar.porOmision" />
                }

                @if (lugar.whatsapp || (forma() === 'resumen' && lugar.fotos.length > 1)) {
                  <p class="mt-auto flex flex-wrap items-center gap-3 pt-5">
                    @if (lugar.whatsapp) {
                      <a
                        class="boton boton-secundario"
                        [href]="lugar.enlaceWhatsapp"
                        target="_blank"
                        rel="noopener"
                        [attr.aria-label]="
                          'Escribir por WhatsApp ' + lugar.a + ' (se abre en otra pestaña)'
                        "
                      >
                        <svg
                          viewBox="0 0 24 24"
                          class="size-5"
                          fill="currentColor"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path [attr.d]="LOGO_WHATSAPP" />
                        </svg>
                        Escribir por WhatsApp
                      </a>
                    }
                    @if (forma() === 'resumen' && lugar.fotos.length > 1) {
                      <a
                        routerLink="/el-club"
                        fragment="tienda-y-cafeteria"
                        class="font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        Ver las {{ lugar.fotos.length }} fotos
                      </a>
                    }
                  </p>
                }
              </div>
            </article>
          }
        </div>
      </section>
    }
  `,
})
export class TiendaYCafeteria {
  readonly forma = input<'resumen' | 'completa'>('resumen');

  private readonly club = inject(Club).datos;

  protected readonly LOGO_WHATSAPP = LOGOS.whatsapp;
  protected readonly pesos = enPesos;

  /** Ids distintos en cada forma: las dos podrían estar en la misma página algún día. */
  protected readonly idDelTitulo = computed(() => `titulo-tienda-y-cafeteria-${this.forma()}`);

  /** Los lugares que se muestran, ya con su enlace, su texto por omisión y sus tarifas. */
  protected readonly lugares = computed(() =>
    LUGARES.map((lugar) => {
      const datos = this.club()[lugar.clave];

      // Solo el gimnasio tiene tarifas: los otros dos, una lista vacía y no una rama más.
      return { ...lugar, ...datos, tarifas: 'tarifas' in datos ? datos.tarifas : [] };
    })
      .filter((lugar) => lugar.descripcion.trim() !== '')
      .map((lugar) => ({
        ...lugar,
        porOmision: `Foto ${lugar.de} del club`,
        enlaceWhatsapp: enlaceDeWhatsapp(lugar, lugar.conArticulo),
      })),
  );

  /** "Tienda, cafetería y gimnasio": los que aparecen, para el título de «El club». */
  protected readonly titulo = computed(() =>
    LISTA.format(this.lugares().map(({ nombre }, i) => (i === 0 ? nombre : nombre.toLowerCase()))),
  );

  protected readonly columnas = computed(() =>
    this.forma() === 'resumen' && this.lugares().length === 3 ? 'lg:grid-cols-3' : '',
  );
}

/**
 * El enlace de `wa.me` con el mensaje ya escrito, para que el club sepa desde qué parte
 * del sitio le escriben. El número viene en la forma que guarda la API: 56 y 9 dígitos.
 */
function enlaceDeWhatsapp(lugar: LugarDelClub, conArticulo: string): string {
  const mensaje = `Hola, quería consultar por ${conArticulo} del club.`;

  return `https://wa.me/${lugar.whatsapp}?text=${encodeURIComponent(mensaje)}`;
}
