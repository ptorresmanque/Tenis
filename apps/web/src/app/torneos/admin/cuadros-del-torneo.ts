import {
  Component,
  computed,
  inject,
  input,
  output,
  resource,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Insignia } from '../../ui/insignia';
import {
  CategoriaJuego,
  CategoriaTorneo,
  Torneos,
} from '../torneos.service';

/**
 * Qué categorías corre un torneo, y con cuántos jugadores cada una.
 *
 * **Un torneo corre 4ª, 3ª y Honor a la vez, y cada una juega su propio cuadro.** El
 * cupo es de la categoría y no del torneo: Honor cierra con 8 y la 4ª con 32, así que
 * un número único no describía nada.
 *
 * No confundir con la pantalla de configuración: allá se administra **el catálogo del
 * club** —qué categorías existen— y acá se elige cuáles corre **este** torneo.
 */
@Component({
  selector: 'app-cuadros-del-torneo',
  imports: [FormsModule, Aviso, Insignia],
  template: `
    <section
      class="mt-4 rounded-xl border border-border bg-muted/30 p-4"
      aria-labelledby="titulo-categorias-torneo"
    >
      <h2 id="titulo-categorias-torneo" class="rotulo-seccion">Categorías del torneo</h2>

      @if (cuadros.isLoading()) {
        <p class="mt-2 text-sm text-muted-foreground">Cargando…</p>
      } @else if (cuadros.error()) {
        <p class="mt-2 text-sm text-destructive">
          No se pudieron cargar las categorías del torneo. Reintenta en un momento.
        </p>
      } @else if (cuadros.value().length === 0) {
        <p class="mt-2 max-w-prose text-sm text-muted-foreground">
          Este torneo todavía no corre ninguna categoría.
          <strong>Sin al menos una no se puede inscribir a nadie</strong>, porque el
          cupo y la lista de espera son de la categoría.
        </p>
      } @else {
        <ul class="mt-3 grid gap-2">
          @for (cuadro of cuadros.value(); track cuadro.id) {
            <li class="flex flex-wrap items-center gap-3 rounded-lg bg-card p-3">
              <span class="font-medium">{{ cuadro.categoria }}</span>

              <label class="flex items-center gap-2 text-sm">
                <span class="text-muted-foreground">Vale</span>
                <select
                  class="campo"
                  [value]="cuadro.categoriaId"
                  [disabled]="trabajando()"
                  (change)="cambiarValor(cuadro.id, $event)"
                >
                  @if (valores.hasValue()) {
                    @for (valor of valores.value(); track valor.id) {
                      <option [value]="valor.id">
                        {{ valor.nombre }} ({{ valor.puntosCampeon }})
                      </option>
                    }
                  }
                </select>
              </label>

              <label class="flex items-center gap-2 text-sm">
                <span class="text-muted-foreground">Cupo</span>
                <input
                  class="campo w-20"
                  type="number"
                  min="2"
                  max="256"
                  [value]="cuadro.cupo"
                  [disabled]="trabajando()"
                  (change)="cambiarCupo(cuadro.id, $event)"
                />
              </label>

              @if (cuadro.semillaSorteo !== null) {
                <app-insignia variante="info" icono="lock">Armado</app-insignia>
              }

              <button
                type="button"
                class="boton boton-secundario boton-chico ms-auto
                       border-destructive text-destructive"
                [disabled]="trabajando()"
                (click)="quitar(cuadro.id, cuadro.categoria)"
              >
                Quitar
                <span class="sr-only">la categoría {{ cuadro.categoria }}</span>
              </button>
            </li>
          }
        </ul>
      }

      <form class="mt-3 flex flex-wrap items-end gap-3" (ngSubmit)="agregar()">
        <label class="block">
          <span class="text-sm font-medium">Agregar categoría</span>
          <select class="campo mt-1" name="categoria" [(ngModel)]="categoriaId">
            <option [value]="0" disabled>Elige una</option>
            @for (categoria of disponibles(); track categoria.id) {
              <option [value]="categoria.id">{{ categoria.nombre }}</option>
            }
          </select>
        </label>

        <label class="block">
          <!-- **Cuánto vale ganarlo, por cuadro y no por torneo** (T70): el mismo fin
               de semana, Honor puede ser un Máster y la 5ª un torneo de club. -->
          <span class="text-sm font-medium">Vale</span>
          <select class="campo mt-1" name="valor" [(ngModel)]="valorId">
            <option [value]="0" disabled>Elige uno</option>
            @if (valores.hasValue()) {
              @for (valor of valores.value(); track valor.id) {
                <option [value]="valor.id">
                  {{ valor.nombre }} ({{ valor.puntosCampeon }} al campeón)
                </option>
              }
            }
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Cupo</span>
          <input
            class="campo mt-1 w-24"
            type="number"
            name="cupo"
            min="2"
            max="256"
            [(ngModel)]="cupo"
          />
        </label>

        <button
          type="submit"
          class="boton boton-secundario"
          [disabled]="trabajando() || disponibles().length === 0"
        >
          Agregar
        </button>

        @if (categorias.error()) {
          <span class="text-sm text-destructive">
            No se pudieron cargar las categorías del club.
          </span>
        } @else if (disponibles().length === 0 && !cuadros.isLoading()) {
          <span class="text-sm text-muted-foreground">
            Ya corre todas las categorías activas del club.
          </span>
        }
      </form>

      <p class="mt-2 text-sm text-muted-foreground">
        El cuadro no hace falta que sea potencia de dos: se completa con byes.
        <!-- **Dicho en pantalla y no solo en un comentario.** Cambiar el valor de un
             cuadro ya jugado mueve puestos en el ranking, que se cuelga en el mural, y
             el admin tiene que saberlo antes de tocar el selector. -->
        Cambiar lo que vale un cuadro <strong>ya jugado</strong> recalcula el ranking.
      </p>

      @if (error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      }
    </section>
  `,
})
export class CuadrosDelTorneo {
  private readonly api = inject(Torneos);

  readonly torneoId = input.required<number>();

  /** Avisa al padre para que recargue: la lista de torneos muestra sus cuadros. */
  readonly cambiaron = output<void>();

  protected categoriaId = 0;
  protected valorId = 0;
  protected cupo = 16;

  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly cuadros = resource({
    params: () => ({ id: this.torneoId(), version: this.version() }),
    loader: ({ params }) => this.api.cuadrosDelTorneo(params.id),
    defaultValue: [],
  });

  protected readonly categorias = resource({
    loader: () => this.api.categoriasDeJuego(true),
    defaultValue: [] as CategoriaJuego[],
  });

  /** Cuánto puede valer ganar un cuadro: "Club 250", "Máster 500". */
  protected readonly valores = resource({
    loader: () => this.api.categorias(true),
    defaultValue: [] as CategoriaTorneo[],
  });

  /**
   * Las que el torneo todavía no corre.
   *
   * Ofrecer una que ya está puesta produce un 409 que el admin no puede prevenir
   * mirando la pantalla, y el servidor ya lo rechaza: acá se evita el viaje.
   */
  protected readonly disponibles = computed(() => {
    // Se lee en el formulario, que se ve aunque alguna de las dos no haya cargado.
    const puestas = new Set(
      (this.cuadros.hasValue() ? this.cuadros.value() : []).map(
        (cuadro) => cuadro.categoriaJuegoId,
      ),
    );

    return (this.categorias.hasValue() ? this.categorias.value() : []).filter(
      (c) => !puestas.has(c.id),
    );
  });

  protected async agregar(): Promise<void> {
    const categoriaJuegoId = Number(this.categoriaId);
    const categoriaId = Number(this.valorId);

    if (!categoriaJuegoId) {
      this.error.set('Elige la categoría que se va a correr.');
      return;
    }

    if (!categoriaId) {
      this.error.set('Elige cuánto vale ganar este cuadro.');
      return;
    }

    await this.intentar(async () => {
      await this.api.agregarCuadro(this.torneoId(), {
        categoriaJuegoId,
        categoriaId,
        cupo: Number(this.cupo),
      });
      this.categoriaId = 0;
    });
  }

  /**
   * Cambia cuánto vale ganar un cuadro **que ya existe**.
   *
   * Con el torneo terminado, esto reescribe la tabla del ranking. Es lo que se quiere
   * cuando el club se equivocó al crearlo, y por eso se puede: la alternativa era
   * borrar el cuadro con sus partidos jugados adentro.
   */
  protected async cambiarValor(id: number, evento: Event): Promise<void> {
    const categoriaId = Number((evento.target as HTMLSelectElement).value);

    if (!categoriaId) return;

    await this.intentar(() =>
      this.api.editarCuadro(this.torneoId(), id, { categoriaId }),
    );
  }

  protected async cambiarCupo(id: number, evento: Event): Promise<void> {
    const cupo = Number((evento.target as HTMLInputElement).value);

    if (!Number.isInteger(cupo) || cupo < 2) {
      this.error.set('El cupo tiene que ser un número de 2 para arriba.');
      return;
    }

    await this.intentar(() =>
      this.api.editarCuadro(this.torneoId(), id, { cupo }),
    );
  }

  protected async quitar(id: number, categoria: string): Promise<void> {
    await this.intentar(async () => {
      await this.api.quitarCuadro(this.torneoId(), id);
      this.error.set(null);
    }, `No se pudo quitar ${categoria}.`);
  }

  /**
   * Recarga siempre, incluso al fallar.
   *
   * El servidor rechaza quitar un cuadro con gente adentro, y en ese caso el campo de
   * cupo puede haber quedado escrito con un número que no se guardó.
   */
  private async intentar(
    accion: () => Promise<unknown>,
    porDefecto = 'No se pudo cambiar las categorías del torneo.',
  ): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);

    try {
      await accion();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, porDefecto));
    } finally {
      this.trabajando.set(false);
      this.version.update((veces) => veces + 1);
      this.cambiaron.emit();
    }
  }
}
