import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import { diaConAnioEnPalabras } from '../../catalogo-canchas/reloj-del-club';
import { Esqueleto } from '../../ui/esqueleto';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Tours } from '../tours.service';

/**
 * `/tours`, sin cuenta (T195): las ligas a las que suman los torneos del club, cada una
 * con su imagen, la temporada que se está jugando y el comienzo de su descripción.
 *
 * **La cabecera va sobre el campo y no sobre una foto**: no hay una foto del club que sea
 * de todos los tours, y la de cada uno ya está en su tarjeta.
 */
@Component({
  selector: 'app-tours-publicos',
  imports: [RouterLink, Esqueleto, EstadoVacio],
  template: `
    <section
      class="a-sangre bg-campo px-sangre-6 py-10 text-on-campo sm:px-sangre-10"
      aria-labelledby="tours"
    >
      <h1 id="tours" class="titular text-6xl sm:text-7xl lg:text-8xl">Tours</h1>
      <p class="mt-3 max-w-prose text-lg text-on-campo/90">
        Juega la temporada completa: cada torneo suma puntos en las ligas del club y te sube en el
        ranking.
      </p>
    </section>

    <!-- Lo que viene de la API va en @defer (T363, SPEC-seo.md D1): el HTML del build
         trae el esqueleto, no un error de carga. -->
    @defer (on immediate) {
      @if (tours.isLoading()) {
        <app-esqueleto class="mt-8 block" [filas]="4" etiqueta="Cargando los tours…" />
      } @else if (tours.error()) {
        <p class="mt-8 text-destructive">
          No se pudieron cargar los tours. Reintenta en un momento.
        </p>
      } @else if (tours.value().length === 0) {
        <app-estado-vacio
          class="mt-8 block"
          icono="military_tech"
          titulo="Todavía no hay tours"
          detalle="Cuando el club arme el primero, aparece acá con su temporada y su ranking."
        />
      } @else {
        <ul class="mt-8 grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
          @for (tour of tours.value(); track tour.id) {
            <!-- Enlace estirado: el enlace es solo el nombre, que es lo que el lector de
                 pantalla anuncia, y su ::after cubre la tarjeta para tocarla en cualquier
                 parte. Con la tarjeta entera dentro del enlace, el lector leía como su nombre
                 la imagen, la temporada y el extracto completo. -->
            <li class="relative overflow-hidden bg-card shadow-md aparece-al-pasar">
              @if (tour.imagen; as imagen) {
                <img
                  class="aspect-[16/9] w-full bg-muted object-cover"
                  [src]="imagen.web"
                  [alt]="'Imagen de ' + tour.nombre"
                  width="1600"
                  height="900"
                  loading="lazy"
                  decoding="async"
                />
              } @else {
                <!-- Sin imagen, el nombre sobre el campo: un hueco gris diría que falta algo. -->
                <div
                  class="flex aspect-[16/9] items-end bg-campo p-5 text-on-campo"
                  aria-hidden="true"
                >
                  <span class="titular text-4xl">{{ tour.nombre }}</span>
                </div>
              }
              <div class="p-5">
                <h2 class="titulo-tarjeta">
                  <a
                    [routerLink]="['/tours', tour.id]"
                    class="text-primary after:absolute after:inset-0 hover:underline"
                  >
                    {{ tour.nombre }}
                  </a>
                </h2>
                @if (tour.temporadaVigente; as temporada) {
                  <p class="mt-1 text-sm font-medium text-muted-foreground">
                    Temporada {{ temporada.nombre }}: del {{ enPalabras(temporada.fechaInicio) }} al
                    {{ enPalabras(temporada.fechaFin) }}
                  </p>
                }
                @if (tour.extracto) {
                  <p class="mt-3">{{ tour.extracto }}</p>
                }
              </div>
            </li>
          }
        </ul>
      }
    } @placeholder {
      <app-esqueleto class="mt-8 block" [filas]="4" etiqueta="Cargando los tours…" />
    }
  `,
})
export class ToursPublicos {
  /**
   * RouterLink se usa solo dentro del @defer: sin nombrarlo acá, Angular lo difiere con un import()
   * de @angular/router entero, y como esa librería ya está en el arranque, ahí queda completa, sin
   * poda (unos 15 kB, T363). Nombrado en la clase, se carga como siempre.
   */
  protected readonly sinDiferir = [RouterLink];

  private readonly api = inject(Tours);

  protected readonly tours = resource({
    loader: () => this.api.publicos(),
    defaultValue: [],
  });

  /** Con el año y sin el día de la semana: es una temporada, no un día de reserva. */
  protected readonly enPalabras = diaConAnioEnPalabras;
}
