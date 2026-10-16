import { Component, computed, input } from '@angular/core';
import { MatCard } from '@angular/material/card';

import { Foto as FotoDelClub } from '../../ui/foto';
import { GaleriaDeFotos } from '../../ui/galeria-de-fotos';
import { Foto } from '../torneos.service';

/**
 * El torneo con su afiche (T314, SPEC-sitio.md D2 y D3): la portada y Torneos lo muestran igual.
 *
 * **A la izquierda, el afiche entero.** Es la primera foto de antes del torneo (A1), y va sin
 * recortar sobre un fondo neutro: el afiche y las bases tienen texto, y recortados no se leen.
 * Debajo, las otras fotos de antes en miniatura. Tocar cualquiera abre la galería en esa foto.
 * Sin fotos de antes, la foto del club, como antes de T314, y sin galería (A3).
 *
 * **A la derecha, lo de cada pantalla**, por proyección: la portada pone la tabla y el botón de
 * inscribirse, y Torneos además la insignia del estado y el cuadro.
 */
@Component({
  selector: 'app-cartel-del-torneo',
  imports: [FotoDelClub, GaleriaDeFotos, MatCard],
  template: `
    <!-- La grilla va adentro: mat-card trae su propio display flex en columna, y le gana a
         una clase grid puesta en él (el cartel salía apilado en el escritorio). -->
    <mat-card appearance="outlined" class="overflow-hidden">
      <div class="grid lg:grid-cols-[minmax(0,2fr)_3fr]">
        <div data-afiche class="flex flex-col bg-muted">
          @if (afiche(); as foto) {
            <button
              type="button"
              class="group relative block w-full cursor-pointer"
              [attr.aria-label]="etiquetaDelAfiche()"
              (click)="visor.abrir(0)"
            >
              <img
                class="aspect-[3/4] max-h-[36rem] w-full object-contain"
                [src]="foto.imagen"
                [alt]="foto.descripcion ?? 'Afiche de ' + nombre()"
                loading="lazy"
              />
              @if (afiches().length > 1) {
                <span
                  class="absolute end-3 bottom-3 bg-rotulo px-2 py-1 font-display text-xs font-bold
                         tracking-wider text-on-rotulo uppercase"
                  aria-hidden="true"
                >
                  {{ afiches().length }} fotos
                </span>
              }
            </button>

            @if (otras().length > 0) {
              <ul data-otras class="flex gap-2 overflow-x-auto p-3">
                @for (otra of otras(); track otra.id) {
                  <li class="shrink-0">
                    <button
                      type="button"
                      class="block cursor-pointer overflow-hidden"
                      [attr.aria-label]="'Ver la foto: ' + (otra.descripcion ?? 'Foto de ' + nombre())"
                      (click)="visor.abrir($index + 1)"
                    >
                      <!-- Entera y no recortada (T322): suelen ser el reglamento o las bases. -->
                      <img
                        class="size-16 object-contain transition-opacity hover:opacity-80"
                        [src]="otra.miniatura"
                        [alt]="otra.descripcion ?? 'Foto de ' + nombre()"
                        loading="lazy"
                      />
                    </button>
                  </li>
                }
              </ul>
            }
            <app-galeria-de-fotos #visor [fotos]="afiches()" [etiqueta]="'Fotos de ' + nombre()" />
          } @else {
            <!-- Crece con la columna: al lado de la tabla, el cartel es más alto que la foto. -->
            <app-foto
              class="block flex-1"
              descripcion="Un jugador golpea de derecha en una cancha al aire libre, con el cielo
                           despejado detrás"
              src="/fotos/jugador_fondo.jpg"
              proporcion="4/3"
              claseCaja="h-full"
            />
          }
        </div>

        <div class="flex flex-col p-4 sm:p-7">
          <ng-content />
        </div>
      </div>
    </mat-card>
  `,
})
export class CartelDelTorneo {
  readonly nombre = input.required<string>();

  /** Sus fotos de antes, de la más vieja a la más nueva: la primera es el afiche. */
  readonly afiches = input.required<Foto[]>();

  protected readonly afiche = computed(() => this.afiches()[0] ?? null);
  protected readonly otras = computed(() => this.afiches().slice(1));

  /** Lo que oye el lector en el afiche: el rótulo «3 fotos» de encima es solo para la vista. */
  protected readonly etiquetaDelAfiche = computed(() => {
    const cuantas = this.afiches().length;
    return `Ver el afiche de ${this.nombre()}${cuantas > 1 ? `, ${cuantas} fotos` : ''}`;
  });
}
