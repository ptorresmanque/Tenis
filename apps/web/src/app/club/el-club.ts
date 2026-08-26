import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Disponibilidad } from '../catalogo-canchas/disponibilidad';
import { nombreDeSuperficie } from '../catalogo-canchas/superficies';
import { Club } from './club.service';
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
  imports: [RouterLink, Insignia, FormularioContacto, Tarifas],
  template: `
    <section class="py-8 text-center">
      <h1 class="font-display text-4xl font-black tracking-tight text-balance">
        FEDAL Tennis Center
      </h1>
      <p class="mx-auto mt-4 max-w-prose text-lg text-muted-foreground">
        Un club de barrio con canchas de torneo. Desde 2008, abierto a socios y a
        quien quiera venir a jugar una hora.
      </p>
    </section>

    <section class="mt-8" aria-labelledby="las-canchas">
      <h2 id="las-canchas" class="font-display text-2xl font-semibold">
        Las canchas
      </h2>
      <p class="mt-1 max-w-prose text-muted-foreground">
        Todas de superficie dura y velocidad media, como el Australian Open. Las dos
        centrales se llaman Basilea y Manacor, y el club no da más explicaciones.
      </p>

      @if (canchas().length > 0) {
        <ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (cancha of canchas(); track cancha.id) {
            <li class="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h3 class="font-display text-lg font-semibold">{{ cancha.nombre }}</h3>
              <p class="mt-2 flex flex-wrap gap-2">
                <app-insignia variante="info" icono="sports_tennis">
                  {{ superficie(cancha.superficie) }}
                </app-insignia>
                @if (cancha.techada) {
                  <app-insignia variante="neutro" icono="roofing">Techada</app-insignia>
                } @else {
                  <app-insignia variante="neutro" icono="wb_sunny">
                    Al aire libre
                  </app-insignia>
                }
                @if (cancha.iluminacion) {
                  <app-insignia variante="neutro" icono="lightbulb">
                    Con iluminación
                  </app-insignia>
                }
              </p>
            </li>
          }
        </ul>
      }
    </section>

    <section class="mt-16" aria-labelledby="como-funciona">
      <h2 id="como-funciona" class="font-display text-2xl font-semibold">
        Cómo se reserva
      </h2>

      <ol class="mt-4 grid gap-4 md:grid-cols-3">
        @for (paso of PASOS; track paso.titulo; let i = $index) {
          <li class="rounded-xl border border-border bg-card p-6 shadow-sm">
            <p
              class="flex size-9 items-center justify-center rounded-full bg-selected
                     font-display font-bold text-primary"
              aria-hidden="true"
            >
              {{ i + 1 }}
            </p>
            <h3 class="mt-3 font-display text-lg font-semibold">{{ paso.titulo }}</h3>
            <p class="mt-1 text-sm text-muted-foreground">{{ paso.detalle }}</p>
          </li>
        }
      </ol>
    </section>

    <section class="mt-16" aria-labelledby="horarios-y-contacto">
      <h2 id="horarios-y-contacto" class="font-display text-2xl font-semibold">
        Horarios y contacto
      </h2>

      <dl class="mt-4 grid gap-4 sm:grid-cols-2">
        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <dt class="flex items-center gap-2 font-semibold">
            <span class="icono text-primary" aria-hidden="true">schedule</span>
            Horario de canchas
          </dt>
          <dd class="mt-2 text-muted-foreground">
            Todos los días, de 08:00 a 22:00. La última hora empieza a las 21:00.
          </dd>
        </div>

        <div class="rounded-xl border border-border bg-card p-6 shadow-sm">
          <dt class="flex items-center gap-2 font-semibold">
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
      <a routerLink="/registro" class="boton boton-secundario">Crear una cuenta</a>
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
