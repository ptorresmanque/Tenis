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
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';

import { proveerCampos } from '../../ui/campos';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { CategoriaJuego, Torneos } from '../torneos.service';
import { Esqueleto } from '../../ui/esqueleto';

const MONTO_INVALIDO =
  'La inscripción tiene que ser un monto en pesos, sin decimales: 0 si es gratis.';

/**
 * El monto escrito, o nulo si no es válido. El mismo tope que la API: diez millones es
 * un cero de más, no una inscripción. El campo vacío no es gratis: es no haber escrito.
 */
function enPesos(texto: string): number | null {
  const monto = Number(texto);
  const valido =
    texto.trim() !== '' &&
    Number.isInteger(monto) &&
    monto >= 0 &&
    monto <= 10_000_000;

  return valido ? monto : null;
}

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
  imports: [
    MatSelectModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    FormsModule,
    Aviso,
    Esqueleto,
    MatChipsModule,
    MatIcon,
  ],
  providers: [proveerCampos()],
  template: `
    <section
      class="mt-4 rounded-xl border border-border bg-muted/30 p-4"
      aria-labelledby="titulo-cuadros-del-torneo"
    >
      <h2 id="titulo-cuadros-del-torneo" class="rotulo-seccion">Categorías del torneo</h2>

      @if (cuadros.isLoading()) {
        <app-esqueleto class="mt-2 block" [filas]="3" etiqueta="Cargando los cuadros…" />
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

              <mat-form-field class="w-20">
                <mat-label>Cupo</mat-label>
                <input
                  matInput
                  type="number"
                  min="2"
                  max="256"
                  [value]="cuadro.cupo"
                  [disabled]="trabajando()"
                  (change)="cambiarCupo(cuadro.id, $event)"
                />
              </mat-form-field>

              <!-- El ancho lo pide la etiqueta, que va dentro del borde y no puede pasarse. -->
              <mat-form-field class="w-36">
                <mat-label>Inscripción $</mat-label>
                <input
                  matInput
                  type="number"
                  min="0"
                  step="1"
                  [attr.aria-label]="
                    'Inscripción de ' + cuadro.categoria + ', en pesos'
                  "
                  [value]="cuadro.montoInscripcionClp"
                  [disabled]="trabajando()"
                  (change)="cambiarMonto(cuadro.id, $event)"
                />
              </mat-form-field>

              @if (cuadro.semillaSorteo !== null) {
                <mat-chip-set class="insignias">
                  <mat-chip class="insignia info">
                    <mat-icon matChipAvatar aria-hidden="true">lock</mat-icon>
                    Armado
                  </mat-chip>
                </mat-chip-set>
              }

              <button
                matButton="outlined"
                type="button"
                class="peligro chico ms-auto"
                [disabled]="trabajando()"
                [attr.aria-busy]="enCurso() === 'quitar-' + cuadro.id"
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
        <mat-form-field>
          <mat-label>Agregar categoría</mat-label>
          <mat-select name="categoriaJuego" [(ngModel)]="categoriaJuegoId">
            <mat-option [value]="0" disabled>Elige una</mat-option>
            @for (categoria of disponibles(); track categoria.id) {
              <mat-option [value]="categoria.id">{{ categoria.nombre }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field class="w-24">
          <mat-label>Cupo</mat-label>
          <input
            matInput
            type="number"
            name="cupo"
            min="2"
            max="256"
            [(ngModel)]="cupo"
          />
        </mat-form-field>

        <!-- Por cuadro y no por torneo: Honor puede costar más que la 5ª. -->
        <!-- «0 es gratis» va en la ayuda: dentro de la etiqueta no cabía y se cortaba. -->
        <mat-form-field class="w-36">
          <mat-label>Inscripción $</mat-label>
          <input
            matInput
            type="number"
            name="monto"
            min="0"
            step="1"
            [(ngModel)]="monto"
          />
          <mat-hint>0 es gratis</mat-hint>
        </mat-form-field>

        <button
          matButton="outlined"
          type="submit"
          [disabled]="trabajando() || disponibles().length === 0"
          [attr.aria-busy]="enCurso() === 'agregar'"
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
        Cambiar la inscripción no toca a quien ya pagó ni a quien se inscribió gratis;
        quien tiene el pago pendiente <strong>paga el monto nuevo</strong>.
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

  protected categoriaJuegoId = 0;
  protected cupo = 16;
  protected monto: number | null = 0;

  protected readonly trabajando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
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
    const categoriaJuegoId = Number(this.categoriaJuegoId);

    if (!categoriaJuegoId) {
      this.error.set('Elige la categoría que se va a correr.');
      return;
    }

    const montoInscripcionClp = enPesos(String(this.monto ?? ''));

    if (montoInscripcionClp === null) {
      this.error.set(MONTO_INVALIDO);
      return;
    }

    await this.intentar('agregar', async () => {
      await this.api.agregarCuadro(this.torneoId(), {
        categoriaJuegoId,
        cupo: Number(this.cupo),
        montoInscripcionClp,
      });
      this.categoriaJuegoId = 0;
    });
  }

  protected async cambiarCupo(id: number, evento: Event): Promise<void> {
    const cupo = Number((evento.target as HTMLInputElement).value);

    if (!Number.isInteger(cupo) || cupo < 2) {
      this.error.set('El cupo tiene que ser un número de 2 para arriba.');
      return;
    }

    await this.intentar(`cambiarCupo-${id}`, () =>
      this.api.editarCuadro(this.torneoId(), id, { cupo }),
    );
  }

  /**
   * Quien ya pagó no cambia, y quien se inscribió gratis queda exento. Quien tiene el pago
   * pendiente —Webpay sin terminar o un comprobante sin revisar— paga el monto nuevo:
   * `pago-de-inscripcion` lo lee al pagar. Por eso la pantalla lo dice.
   */
  protected async cambiarMonto(id: number, evento: Event): Promise<void> {
    const montoInscripcionClp = enPesos(
      (evento.target as HTMLInputElement).value,
    );

    if (montoInscripcionClp === null) {
      this.error.set(MONTO_INVALIDO);
      return;
    }

    await this.intentar(`cambiarMonto-${id}`, () =>
      this.api.editarCuadro(this.torneoId(), id, { montoInscripcionClp }),
    );
  }

  protected async quitar(id: number, categoria: string): Promise<void> {
    await this.intentar(`quitar-${id}`, async () => {
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
    clave: string,
    accion: () => Promise<unknown>,
    porDefecto = 'No se pudo cambiar las categorías del torneo.',
  ): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, porDefecto));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
      this.version.update((veces) => veces + 1);
      this.cambiaron.emit();
    }
  }
}
