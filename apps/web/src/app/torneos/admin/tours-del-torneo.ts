import { Component, computed, inject, input, output, signal } from '@angular/core';

import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Torneo, Torneos } from '../torneos.service';
import { ElegirNivel, NivelElegido } from './elegir-nivel';

const SIN_ELEGIR: NivelElegido = { tourId: null, nivelId: null };

/**
 * Para qué tours suma un torneo, en Ajustes (T197, `SPEC-torneos.md` § Tours del
 * torneo).
 *
 * **Un solo selector para agregar y para cambiar**: si el tour elegido ya está, el
 * botón cambia su nivel. Es lo que permite cambiar el nivel del único tour, que no se
 * puede quitar para volver a ponerlo.
 */
@Component({
  selector: 'app-tours-del-torneo',
  imports: [Aviso, ElegirNivel],
  template: `
    <section
      class="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm"
      aria-labelledby="titulo-tours-del-torneo"
    >
      <h2 id="titulo-tours-del-torneo" class="rotulo-seccion">Tours</h2>
      <p class="mt-1 max-w-prose text-sm text-muted-foreground">
        Para qué tours suma, y con qué nivel. Suma el torneo completo: cada cuadro a la tabla de su
        categoría.
      </p>

      <!-- Regla 5: se puede cambiar en cualquier estado, pero no sin saberlo. -->
      @if (torneo().estado === 'FINALIZADO') {
        <app-aviso variante="aviso" class="mt-3 block">
          Este torneo ya se jugó: quitarle un tour o cambiarle el nivel cambia el ranking de esa
          temporada.
        </app-aviso>
      }

      @if (torneo().tours.length === 0) {
        <p class="mt-3 text-sm text-muted-foreground">
          Todavía no suma para ningún tour: agrégale uno.
        </p>
      } @else {
        <ul class="mt-3 grid gap-2">
          @for (tour of torneo().tours; track tour.tourId) {
            <li class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="font-medium">{{ tour.tour }}</span>
              <span class="text-sm text-muted-foreground">
                {{ tour.temporada }} · {{ tour.nivel }}
              </span>
              <!-- **La última no tiene botón** (regla 1): el servidor la rechaza, y un
                   botón que siempre falla es peor que no tenerlo. -->
              @if (torneo().tours.length > 1) {
                <button
                  type="button"
                  class="boton boton-texto boton-chico ms-auto"
                  [attr.aria-label]="'Quitar ' + tour.tour"
                  [attr.aria-busy]="enCurso() === 'quitar-' + tour.tourId"
                  [disabled]="trabajando()"
                  (click)="quitar(tour.tourId)"
                >
                  Quitar
                </button>
              }
            </li>
          }
        </ul>
      }

      <div class="mt-4 border-t border-border pt-4">
        <app-elegir-nivel [(eleccion)]="eleccion" />
        <button
          type="button"
          class="boton boton-secundario mt-3"
          [attr.aria-busy]="enCurso() === 'guardar'"
          [disabled]="eleccion().nivelId === null || trabajando()"
          (click)="guardar()"
        >
          {{ yaSuma() ? 'Cambiar el nivel' : 'Agregar el tour' }}
        </button>
      </div>

      @if (error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      }
    </section>
  `,
})
export class ToursDelTorneo {
  private readonly api = inject(Torneos);

  readonly torneo = input.required<Pick<Torneo, 'id' | 'estado' | 'tours'>>();
  /** Para que la ficha recargue el torneo: la lista de tours sale de ahí. */
  readonly cambiaron = output<void>();

  protected readonly eleccion = signal<NivelElegido>(SIN_ELEGIR);

  /** Si el tour elegido ya está: entonces guardar cambia su nivel. */
  protected readonly yaSuma = computed(() =>
    this.torneo().tours.some((tour) => tour.tourId === this.eleccion().tourId),
  );

  protected readonly trabajando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async guardar(): Promise<void> {
    const { tourId, nivelId } = this.eleccion();
    if (tourId === null || nivelId === null) return;

    const id = this.torneo().id;

    await this.intentar('guardar', async () => {
      await (this.yaSuma()
        ? this.api.cambiarNivelDelTour(id, tourId, nivelId)
        : this.api.agregarTour(id, { tourId, nivelId }));
      this.eleccion.set(SIN_ELEGIR);
    });
  }

  protected async quitar(tourId: number): Promise<void> {
    await this.intentar(`quitar-${tourId}`, () => this.api.quitarTour(this.torneo().id, tourId));
  }

  private async intentar(clave: string, accion: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
      this.cambiaron.emit();
    } catch (falla) {
      // El del servidor: dice si ese nivel no es del tour, o si es el último.
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar el tour.'));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
    }
  }
}
