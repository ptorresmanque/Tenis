import {
  Component,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';

import { Esqueleto } from '../ui/esqueleto';
import { FormsModule } from '@angular/forms';

import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { Campo, CampoControl } from '../ui/campo';
import { Insignia } from '../ui/insignia';
import {
  CategoriaDeJuego,
  CategoriasDeJuego as ApiCategoriasDeJuego,
} from './categorias-juego.service';

/**
 * Las categorías con que juega el club.
 *
 * **No son las categorías de torneo**, que viven en la pantalla de torneos y llevan
 * los puntos del campeón. Estas separan cuadros: la 4ª no juega contra Honor. El
 * encabezado lo dice en pantalla y no solo en el código, porque el club usa la misma
 * palabra para las dos cosas.
 *
 * El club arranca con seis del seed y casi nunca las toca; la pantalla está para el
 * año en que invente una "Sub-18" o deje de correr la 5ª.
 */
@Component({
  selector: 'app-categorias-juego',
  imports: [Esqueleto, FormsModule, Aviso, Campo, CampoControl, Insignia],
  template: `
    <section aria-labelledby="agregar">
      <h2 id="agregar" class="font-display text-xl font-semibold">
        Categorías de juego
      </h2>
      <p class="mt-1 max-w-prose text-sm text-muted-foreground">
        El nivel con que se inscribe un jugador. Cada torneo corre las que quiera, y
        cada una juega su propio cuadro. No confundir con la categoría del torneo —
        "Club 250", "Club 500"— que es la que reparte los puntos del ranking.
      </p>

      <form class="mt-4 flex flex-wrap items-end gap-3" (ngSubmit)="agregar()">
        <app-campo etiqueta="Nombre" class="min-w-48 flex-1">
          <input
            appCampoControl
            name="nombre"
            type="text"
            maxlength="40"
            class="campo"
            [(ngModel)]="nombre"
          />
        </app-campo>

        <app-campo
          etiqueta="Lugar"
          ayuda="Mayor es más alta. Honor arriba, la 5ª abajo."
          class="min-w-40"
        >
          <!-- Enlace de ida y vuelta escrito a mano y no con la forma corta de dos
               vías: el destino es un linkedSignal, y hay que llamarle set(). -->
          <input
            appCampoControl
            name="orden"
            type="number"
            min="1"
            max="1000"
            class="campo"
            [ngModel]="orden()"
            (ngModelChange)="orden.set($event)"
          />
        </app-campo>

        <button type="submit" class="boton boton-primario" [disabled]="enviando()">
          Agregar
        </button>
      </form>

      @if (error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      } @else if (aviso(); as texto) {
        <app-aviso variante="exito" class="mt-3 block">{{ texto }}</app-aviso>
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
          <table class="tabla">
            <caption class="sr-only">
              Categorías de juego, de la más baja a la más alta
            </caption>
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col">Lugar</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (categoria of categorias.value() ?? []; track categoria.id) {
                <tr>
                  <td class="font-medium">{{ categoria.nombre }}</td>
                  <td class="text-sm text-muted-foreground">
                    <label class="sr-only" [for]="'orden-' + categoria.id">
                      Lugar de {{ categoria.nombre }}
                    </label>
                    <input
                      [id]="'orden-' + categoria.id"
                      type="number"
                      min="1"
                      max="1000"
                      class="campo w-24"
                      [value]="categoria.orden"
                      [disabled]="enviando()"
                      (change)="mover(categoria, $event)"
                    />
                  </td>
                  <td>
                    <div class="flex flex-wrap items-center gap-2">
                      @if (categoria.activa) {
                        <app-insignia variante="exito" icono="check_circle">
                          Se ofrece
                        </app-insignia>
                      } @else {
                        <app-insignia variante="neutro" icono="visibility_off">
                          Retirada
                        </app-insignia>
                      }

                      <button
                        type="button"
                        class="boton boton-secundario boton-chico"
                        [disabled]="enviando()"
                        (click)="alternar(categoria)"
                      >
                        {{ categoria.activa ? 'Retirar' : 'Volver a ofrecer' }}
                        <span class="sr-only">{{ categoria.nombre }}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
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
  private readonly api = inject(ApiCategoriasDeJuego);

  protected nombre = '';

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  private readonly version = signal(0);

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

    await this.contra(async () => {
      await this.api.crear(nombre, orden);
      this.aviso.set(`${nombre} ya se puede elegir al inscribirse.`);
      this.nombre = '';
      // El lugar no se avanza a mano: la recarga de `contra` trae la categoría recién
      // creada y `orden` se recalcula sola desde la lista.
    }, 'No se pudo agregar la categoría.');
  }

  protected async alternar(categoria: CategoriaDeJuego): Promise<void> {
    this.limpiarMensajes();

    await this.contra(async () => {
      await this.api.editar(categoria.id, { activa: !categoria.activa });
      this.aviso.set(
        categoria.activa
          ? `${categoria.nombre} deja de ofrecerse.`
          : `${categoria.nombre} vuelve a ofrecerse.`,
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

    await this.contra(async () => {
      await this.api.editar(categoria.id, { orden });
      this.aviso.set(`${categoria.nombre} quedó en el lugar ${orden}.`);
    }, 'No se pudo mover la categoría.');
  }

  /**
   * Recarga siempre, incluso al fallar: el mensaje del servidor puede ser un choque
   * de lugares, y entonces el número que quedó escrito en la fila no es el guardado.
   */
  private async contra(
    accion: () => Promise<void>,
    porDefecto: string,
  ): Promise<void> {
    this.enviando.set(true);

    try {
      await accion();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, porDefecto));
    } finally {
      this.enviando.set(false);
      this.version.update((veces) => veces + 1);
    }
  }

  private limpiarMensajes(): void {
    this.error.set(null);
    this.aviso.set(null);
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

const LUGAR_INVALIDO = 'El lugar tiene que ser un número entero mayor que cero.';

/**
 * Un campo `type="number"` vacío llega como `0` y uno con basura como `NaN`.
 *
 * Los dos producirían un 400 que el club lee como "no se pudo mover" sin saber qué
 * arreglar, así que se atajan acá con el mensaje que sí lo dice.
 */
function esLugar(valor: number): boolean {
  return Number.isInteger(valor) && valor >= 1;
}
