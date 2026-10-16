import {
  Component,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';

import { proveerCampos } from '../ui/campos';
import { Esqueleto } from '../ui/esqueleto';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';

import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import {
  CategoriaDeJuego,
  CategoriasDeJuego as ApiCategoriasDeJuego,
} from './categorias-juego.service';
import { LO_HECHO } from '../ui/material';

/**
 * Las categorías con que juega el club.
 *
 * Separan cuadros —la 4ª no juega contra Honor— y, desde T198, las tablas del ranking:
 * cada tour tiene una por categoría. Lo que vale ganar un torneo no está acá: lo pone el
 * nivel con que entra a cada tour (la categoría de torneo se eliminó en T199).
 *
 * El club arranca con seis del seed y casi nunca las toca; la pantalla está para el
 * año en que invente una "Sub-18" o deje de correr la 5ª.
 */
@Component({
  selector: 'app-categorias-juego',
  imports: [
    MatFormFieldModule,
    MatInput,
    MatButton,
    Esqueleto,
    FormsModule,
    Aviso,
    MatTableModule,
    MatChipsModule,
    MatIcon,
  ],
  providers: [proveerCampos()],
  template: `
    <section aria-labelledby="agregar">
      <h2 id="agregar" class="rotulo-seccion">
        Categorías de juego
      </h2>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        El nivel con que se inscribe un jugador. Cada torneo corre las que quiera, y
        cada una juega su propio cuadro. El ranking de cada tour tiene una tabla por
        categoría; lo que vale ganar un torneo lo pone su nivel en el tour.
      </p>

      <form class="mt-4 flex flex-wrap items-end gap-3" (ngSubmit)="agregar()">
        <mat-form-field class="min-w-48 flex-1">
          <mat-label>Nombre</mat-label>
          <input
            matInput
            name="nombre"
            type="text"
            maxlength="40"
            [(ngModel)]="nombre"
          />
        </mat-form-field>

        <mat-form-field class="min-w-40">
          <mat-label>Orden</mat-label>
          <!-- Enlace de ida y vuelta escrito a mano y no con la forma corta de dos
               vías: el destino es un linkedSignal, y hay que llamarle set(). -->
          <input
            matInput
            name="orden"
            type="number"
            min="1"
            max="1000"
            [ngModel]="orden()"
            (ngModelChange)="orden.set($event)"
          />
          <mat-hint>Mayor es más alta. Honor arriba, la 5ª abajo.</mat-hint>
        </mat-form-field>

        <button
          matButton="filled"
          type="submit"
          [disabled]="enviando()"
          [attr.aria-busy]="enCurso() === 'agregar'"
        >
          Agregar
        </button>
      </form>

      @if (error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      }
    </section>

    <section class="mt-8" aria-labelledby="listado">
      <h2 id="listado" class="sr-only">Categorías configuradas</h2>

      @if (categorias.isLoading()) {
        <app-esqueleto class="block" [filas]="4" etiqueta="Cargando las categorías…" />
      } @else if (categorias.error()) {
        <p class="text-destructive">
          No se pudieron cargar las categorías. Reintenta en un momento.
        </p>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-border bg-card">
          <!-- Densa, con el lugar más angosto en el teléfono y el botón sin cortes
               (TV7.3): con el aire de la tabla normal no cabía ni a 375, se
               desplazaba 6px y partía "Volver a ofrecer" en dos líneas. Así
               mide justo los 326px que quedan a 360. -->
          <table mat-table aria-label="Categorías de juego, de la más baja a la más alta" class="densa" [dataSource]="categorias.value() ?? []">
            <ng-container matColumnDef="categoria">
              <th mat-header-cell *matHeaderCellDef scope="col">Categoría</th>
              <td mat-cell *matCellDef="let categoria" class="font-medium">
                {{ categoria.nombre }}
              </td>
            </ng-container>
            <ng-container matColumnDef="orden">
              <th mat-header-cell *matHeaderCellDef scope="col">Orden</th>
              <td mat-cell *matCellDef="let categoria" class="text-sm text-muted-foreground">
                <mat-form-field class="w-18 sm:w-24">
                  <mat-label>Orden de {{ categoria.nombre }}</mat-label>
                  <input
                    matInput
                    [id]="'orden-' + categoria.id"
                    type="number"
                    min="1"
                    max="1000"
                    [value]="categoria.orden"
                    [disabled]="enviando()"
                    (change)="mover(categoria, $event)"
                  />
                </mat-form-field>
              </td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef scope="col">Estado</th>
              <td mat-cell *matCellDef="let categoria">
                <div class="flex flex-wrap items-center gap-2">
                  @if (categoria.activa) {
                    <mat-chip-set class="insignias">
                      <mat-chip class="insignia exito">
                        <mat-icon matChipAvatar aria-hidden="true">check_circle</mat-icon>
                        Se ofrece
                      </mat-chip>
                    </mat-chip-set>
                  } @else {
                    <mat-chip-set class="insignias">
                      <mat-chip class="insignia neutro">
                        <mat-icon matChipAvatar aria-hidden="true">visibility_off</mat-icon>
                        Retirada
                      </mat-chip>
                    </mat-chip-set>
                  }

                  <button
                    matButton="outlined"
                    type="button"
                    class="chico whitespace-nowrap"
                    [disabled]="enviando()"
                    [attr.aria-busy]="enCurso() === 'alternar-' + categoria.id"
                    (click)="alternar(categoria)"
                  >
                    {{ categoria.activa ? 'Retirar' : 'Volver a ofrecer' }}
                    <span class="sr-only">{{ categoria.nombre }}</span>
                  </button>
                </div>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="COLUMNAS; sticky: true"></tr>
            <tr mat-row *matRowDef="let categoria; columns: COLUMNAS"></tr>
          </table>
        </div>

        <p class="mt-3 max-w-prose text-sm text-muted-foreground">
          Retirar una categoría la saca del formulario de inscripción, pero
          <strong>no la borra</strong>: los torneos que ya la jugaron la siguen
          nombrando, y el año que viene se vuelve a ofrecer sin escribirla de nuevo.
        </p>
      }
    </section>
  `,
})
export class CategoriasDeJuegoPanel {
  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(ApiCategoriasDeJuego);

  protected nombre = '';

  protected readonly enviando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T153). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly COLUMNAS = ['categoria', 'orden', 'estado'];

  protected readonly categorias = resource({
    params: () => ({ version: this.version() }),
    loader: () => this.api.listar(),
  });

  /**
   * El primer lugar libre: diez más que la categoría más alta que hay.
   *
   * **Se deriva de la lista y no es un número fijo.** Con un `70` escrito a mano
   * funciona el primer día —el seed llega hasta 60— y falla el segundo: agregada una
   * séptima categoría en 70, el siguiente que abra la pantalla recibe un 409 al primer
   * intento contra el único de `orden`.
   *
   * `linkedSignal` y no `computed` porque el admin tiene que poder escribir otro
   * número encima —intercalar una "Sub-18" en el 35 es justo para lo que existen los
   * huecos de diez—, y el valor se recalcula solo cuando la lista vuelve del servidor.
   */
  protected readonly orden = linkedSignal(() => {
    const lugares = (this.categorias.hasValue() ? this.categorias.value() : []).map(
      (c) => c.orden,
    );

    return (lugares.length ? Math.max(...lugares) : 0) + PASO;
  });

  protected async agregar(): Promise<void> {
    const nombre = this.nombre.trim();
    const orden = Number(this.orden());

    this.limpiarMensajes();

    if (!nombre) {
      this.error.set('Escribe el nombre de la categoría.');
      return;
    }

    if (!esLugar(orden)) {
      this.error.set(LUGAR_INVALIDO);
      return;
    }

    await this.contra('agregar', async () => {
      await this.api.crear(nombre, orden);
      this.snackBar.open(`${nombre} ya se puede elegir al inscribirse.`, undefined, LO_HECHO);
      this.nombre = '';
      // El lugar no se avanza a mano: la recarga de `contra` trae la categoría recién
      // creada y `orden` se recalcula sola desde la lista.
    }, 'No se pudo agregar la categoría.');
  }

  protected async alternar(categoria: CategoriaDeJuego): Promise<void> {
    this.limpiarMensajes();

    await this.contra(`alternar-${categoria.id}`, async () => {
      await this.api.editar(categoria.id, { activa: !categoria.activa });
      this.snackBar.open(
        categoria.activa
          ? `${categoria.nombre} deja de ofrecerse.`
          : `${categoria.nombre} vuelve a ofrecerse.`,
        undefined,
        LO_HECHO,
      );
    }, 'No se pudo cambiar la categoría.');
  }

  /**
   * Cambiar el lugar es cómo se reordena.
   *
   * No hay flechas de subir y bajar: el `orden` es único, así que intercambiar dos
   * filas exigiría un endpoint que las mueva juntas para no chocar contra el único a
   * mitad de camino. Con los lugares de diez en diez, escribir el número alcanza.
   */
  protected async mover(
    categoria: CategoriaDeJuego,
    evento: Event,
  ): Promise<void> {
    const orden = Number((evento.target as HTMLInputElement).value);

    this.limpiarMensajes();

    if (!esLugar(orden)) {
      this.error.set(LUGAR_INVALIDO);
      return;
    }

    await this.contra(`mover-${categoria.id}`, async () => {
      await this.api.editar(categoria.id, { orden });
      this.snackBar.open(`${categoria.nombre} quedó con el orden ${orden}.`, undefined, LO_HECHO);
    }, 'No se pudo mover la categoría.');
  }

  /**
   * Recarga siempre, incluso al fallar: el mensaje del servidor puede ser un choque
   * de lugares, y entonces el número que quedó escrito en la fila no es el guardado.
   */
  private async contra(
    clave: string,
    accion: () => Promise<void>,
    porDefecto: string,
  ): Promise<void> {
    this.enviando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, porDefecto));
    } finally {
      this.enviando.set(false);
      this.enCurso.set(null);
      this.version.update((veces) => veces + 1);
    }
  }

  private limpiarMensajes(): void {
    this.error.set(null);
  }
}

/**
 * De cuánto en cuánto se dejan los lugares.
 *
 * Diez, igual que el seed. Es lo que permite intercalar una categoría entre dos que ya
 * están sin renumerar ninguna, que con un único sobre `orden` sería una cascada de
 * choques.
 */
const PASO = 10;

const LUGAR_INVALIDO = 'El orden tiene que ser un número entero mayor que cero.';

/**
 * Un campo `type="number"` vacío llega como `0` y uno con basura como `NaN`.
 *
 * Los dos producirían un 400 que el club lee como "no se pudo mover" sin saber qué
 * arreglar, así que se atajan acá con el mensaje que sí lo dice.
 */
function esLugar(valor: number): boolean {
  return Number.isInteger(valor) && valor >= 1;
}
