import { Component, computed, inject, model, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Tours } from '../../tours/tours.service';

/** Lo elegido: un tour y uno de sus niveles. Nulos mientras no se elija. */
export interface NivelElegido {
  tourId: number | null;
  nivelId: number | null;
}

/**
 * El tour y el nivel con que suma un torneo (T197): en el formulario de crear y en
 * Ajustes.
 *
 * **Se elige el nivel, y el nivel trae su temporada**: por eso cada opción se lee
 * "2027 · 500". No hay un campo de temporada aparte que pueda contradecirlo
 * (`SPEC-tours.md` § La asociación con el torneo). Y no se filtra por las fechas del
 * torneo: el admin puede sumar un torneo de diciembre a la temporada siguiente (D13).
 *
 * Selects sueltos y no `ngModel`: vive dentro de los formularios de otros, y un control
 * registrado en su `ngForm` sería un campo más que esos formularios no mandan.
 */
@Component({
  selector: 'app-elegir-nivel',
  imports: [RouterLink],
  template: `
    @if (tours.error()) {
      <p class="text-sm text-destructive">
        No se pudieron cargar los tours. Reintenta en un momento.
      </p>
    } @else if (!tours.isLoading() && tours.value().length === 0) {
      <!-- Una lista vacía no dice qué hacer; esto sí. -->
      <p class="text-sm text-muted-foreground">
        Todavía no hay tours, y todo torneo suma para uno.
        <a routerLink="/administracion/tours" class="font-semibold text-primary underline"
          >Crea el primero</a
        >.
      </p>
    } @else {
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="text-sm font-medium">Tour</span>
          <select class="campo mt-1" name="tourId" (change)="elegirTour($event)">
            <option value="" disabled [selected]="eleccion().tourId === null">Elige un tour</option>
            @for (tour of tours.value(); track tour.id) {
              <option [value]="tour.id" [selected]="tour.id === eleccion().tourId">
                {{ tour.nombre }}
              </option>
            }
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Nivel</span>
          <select
            class="campo mt-1"
            name="nivelId"
            [disabled]="niveles().length === 0"
            (change)="elegirNivel($event)"
          >
            <option value="" disabled [selected]="eleccion().nivelId === null">
              {{ eleccion().tourId === null ? 'Primero el tour' : 'Elige el nivel' }}
            </option>
            @for (nivel of niveles(); track nivel.id) {
              <option [value]="nivel.id" [selected]="nivel.id === eleccion().nivelId">
                {{ nivel.nombre }}
              </option>
            }
          </select>
        </label>

        @if (ficha.error()) {
          <p class="text-sm text-destructive sm:col-span-2">
            No se pudieron cargar los niveles de ese tour. Reintenta en un momento.
          </p>
        } @else if (sinNiveles(); as tourId) {
          <p class="text-sm text-muted-foreground sm:col-span-2">
            Ese tour todavía no tiene niveles.
            <a
              [routerLink]="['/administracion/tours', tourId]"
              class="font-semibold text-primary underline"
              >Agrégalos en su ficha</a
            >.
          </p>
        }
      </div>
    }
  `,
})
export class ElegirNivel {
  private readonly api = inject(Tours);

  readonly eleccion = model<NivelElegido>({ tourId: null, nivelId: null });

  protected readonly tours = resource({
    loader: () => this.api.listar(),
    defaultValue: [],
  });

  /** La ficha del tour elegido, que es la que trae sus temporadas con sus niveles. */
  protected readonly ficha = resource({
    params: () => this.eleccion().tourId ?? undefined,
    loader: ({ params }) => this.api.ficha(params),
  });

  /** Los niveles del tour elegido, de la temporada más nueva a la más vieja. */
  protected readonly niveles = computed(() => {
    const ficha = this.ficha.hasValue() ? this.ficha.value() : null;

    // La del tour anterior no sirve mientras llega la del nuevo.
    if (!ficha || ficha.id !== this.eleccion().tourId) return [];

    return ficha.temporadas.flatMap((temporada) =>
      temporada.niveles.map((nivel) => ({
        id: nivel.id,
        nombre: `${temporada.nombre} · ${nivel.nombre}`,
      })),
    );
  });

  /** El tour elegido si ya cargó y no tiene niveles: hay que decir dónde se agregan. */
  protected readonly sinNiveles = computed(() => {
    const tourId = this.eleccion().tourId;
    const cargada = this.ficha.hasValue() && this.ficha.value().id === tourId;

    return cargada && this.niveles().length === 0 ? tourId : null;
  });

  protected elegirTour(evento: Event): void {
    const tourId = Number((evento.target as HTMLSelectElement).value);

    // El nivel era del tour anterior: se vuelve a elegir.
    this.eleccion.set({ tourId, nivelId: null });
  }

  protected elegirNivel(evento: Event): void {
    const nivelId = Number((evento.target as HTMLSelectElement).value);

    this.eleccion.update((eleccion) => ({ ...eleccion, nivelId }));
  }
}
