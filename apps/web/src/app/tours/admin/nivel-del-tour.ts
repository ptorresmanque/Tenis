import { Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { proveerCampos } from '../../ui/campos';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { NivelDelPanel, TablaDePuntos, Tours } from '../tours.service';

/** Las siete filas de la tabla, de la final hacia atrás, con cómo se rotulan. */
const FILAS: { clave: keyof TablaDePuntos; etiqueta: string }[] = [
  { clave: 'campeon', etiqueta: 'Campeón' },
  { clave: 'finalista', etiqueta: 'Finalista' },
  { clave: 'semifinal', etiqueta: 'Semifinal' },
  { clave: 'cuartos', etiqueta: 'Cuartos' },
  { clave: 'octavos', etiqueta: 'Octavos' },
  { clave: 'dieciseisavos', etiqueta: 'Dieciseisavos' },
  { clave: 'treintaidosavos', etiqueta: 'Treintaidosavos' },
];

const VACIA: TablaDePuntos = {
  campeon: 0,
  finalista: 0,
  semifinal: 0,
  cuartos: 0,
  octavos: 0,
  dieciseisavos: 0,
  treintaidosavos: 0,
};

/**
 * Un nivel de una temporada (T192): su nombre y su tabla de puntos, en siete casillas.
 * **Sin `nivel`, es el formulario para agregar uno.**
 *
 * La API valida la escala (`leerTabla`) y su mensaje nombra la fila que sobra; acá no se
 * repite la regla, se muestra el mensaje junto al nivel que lo causó.
 */
@Component({
  selector: 'app-nivel-del-tour',
  imports: [MatFormFieldModule, MatInput, MatButton, FormsModule, Aviso],
  providers: [proveerCampos()],
  template: `
    <!-- El de agregar, con borde punteado: sin eso se veía igual a los guardados y solo
         el botón decía que era otra cosa. -->
    <form
      class="rounded-xl border border-border bg-card p-3"
      [class.border-dashed]="!nivel()"
      [attr.aria-label]="nivel() ? 'Nivel ' + nivel()!.nombre : 'Nivel nuevo'"
      (ngSubmit)="guardar()"
    >
      <div class="flex flex-wrap items-end gap-3">
        <mat-form-field class="w-36">
          <mat-label>Nivel</mat-label>
          <input
            matInput
            name="nombre"
            maxlength="40"
            placeholder="500"
            [ngModel]="nombre()"
            (ngModelChange)="nombre.set($event)"
          />
        </mat-form-field>
        @if (nivel(); as suyo) {
          <p class="pb-2 text-sm text-muted-foreground">
            @switch (suyo.torneos) {
              @case (0) {
                Todavía no se usa en ningún torneo.
              }
              @case (1) {
                Se usa en 1 torneo.
              }
              @default {
                Se usa en {{ suyo.torneos }} torneos.
              }
            }
          </p>
        }
      </div>

      <!-- Dos columnas en el teléfono, siete en escritorio: las siete en fila no caben
           en 375 px y obligarían a desplazar el formulario de lado. -->
      <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        @for (fila of FILAS; track fila.clave) {
          <mat-form-field>
            <mat-label>{{ fila.etiqueta }}</mat-label>
            <input
              matInput
              class="tabular-nums"
              type="number"
              inputmode="numeric"
              min="0"
              step="1"
              [name]="fila.clave"
              [ngModel]="tabla()[fila.clave]"
              (ngModelChange)="escribir(fila.clave, $event)"
            />
          </mat-form-field>
        }
      </div>

      @if (preguntando(); as pregunta) {
        <app-aviso variante="aviso" [urgente]="true" class="mt-3 block">
          {{ pregunta }}
        </app-aviso>
        <div class="mt-3 flex flex-wrap gap-2">
          <!-- Cada lleno va en una rama distinta del mismo if: se ve uno a la vez.
               mat-guidelines-ignore: multiples-filled -->
          <button
            matButton="filled"
            type="button"
            class="chico"
            [disabled]="enCurso() !== null"
            [attr.aria-busy]="enCurso() === 'guardar'"
            (click)="enviar()"
          >
            Sí, guardar
          </button>
          <button matButton type="button" class="chico" (click)="preguntando.set(null)">
            Mejor no
          </button>
        </div>
      } @else if (porBorrar()) {
        <!-- La confirmación en la fila, como al borrar una pregunta frecuente. -->
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            matButton="filled"
            type="button"
            class="peligro chico"
            [disabled]="enCurso() !== null"
            [attr.aria-busy]="enCurso() === 'borrar'"
            (click)="borrar()"
          >
            Sí, borrar
          </button>
          <button matButton type="button" class="chico" (click)="porBorrar.set(false)">
            Mejor no
          </button>
        </div>
      } @else {
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            matButton="outlined"
            type="submit"
            class="chico"
            [disabled]="enCurso() !== null"
            [attr.aria-busy]="enCurso() === 'guardar'"
          >
            {{ nivel() ? 'Guardar' : 'Agregar el nivel' }}
          </button>
          <!-- Con torneos no se ofrece: se quedarían sin nivel y sin puntos. -->
          @if (nivel(); as suyo) {
            @if (suyo.torneos === 0) {
              <button matButton type="button" class="chico" (click)="porBorrar.set(true)">
                Borrar
                <span class="sr-only">el nivel {{ suyo.nombre }}</span>
              </button>
            }
          }
        </div>
      }

      @if (error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      }
    </form>
  `,
})
export class NivelDelTour {
  private readonly api = inject(Tours);

  /** El nivel que se edita, o nulo para agregar uno nuevo. */
  readonly nivel = input.required<NivelDelPanel | null>();
  readonly temporadaId = input.required<number>();
  /** El nombre de su temporada, para el aviso: "el ranking de la temporada 2027". */
  readonly temporada = input.required<string>();

  /** Algo cambió en la API: la ficha tiene que recargar. */
  readonly cambio = output<void>();

  protected readonly FILAS = FILAS;

  /** Lo que hay en las casillas; vuelve a lo guardado cuando la ficha recarga. */
  protected readonly nombre = linkedSignal(() => this.nivel()?.nombre ?? '');
  protected readonly tabla = linkedSignal<TablaDePuntos>(() => ({
    ...(this.nivel()?.tabla ?? VACIA),
  }));

  protected readonly preguntando = signal<string | null>(null);
  protected readonly porBorrar = signal(false);
  protected readonly enCurso = signal<'guardar' | 'borrar' | null>(null);
  protected readonly error = signal<string | null>(null);

  protected escribir(clave: keyof TablaDePuntos, valor: number | string | null): void {
    // Una casilla vacía es cero, y la API rechaza lo que no sea un entero.
    this.tabla.update((actual) => ({ ...actual, [clave]: Number(valor ?? 0) }));
  }

  /**
   * Guarda, o pregunta antes si el nivel ya cuenta en torneos terminados: cambiar su tabla
   * cambia el ranking de esa temporada en la consulta siguiente.
   */
  protected guardar(): void {
    const terminados = this.nivel()?.torneosTerminados ?? 0;

    if (terminados > 0) {
      const torneos = terminados === 1 ? '1 torneo terminado' : `${terminados} torneos terminados`;
      this.preguntando.set(
        `Este nivel ya cuenta en ${torneos}: cambiarlo cambia el ranking de la temporada ` +
          `${this.temporada()}.`,
      );
      return;
    }

    void this.enviar();
  }

  protected async enviar(): Promise<void> {
    const datos = { nombre: this.nombre().trim(), tabla: this.tabla() };
    const nivel = this.nivel();

    const listo = await this.intentar('guardar', () =>
      nivel ? this.api.editarNivel(nivel.id, datos) : this.api.crearNivel(this.temporadaId(), datos),
    );
    this.preguntando.set(null);

    // El formulario de agregar queda en blanco para el siguiente: su `nivel` sigue nulo,
    // así que el `linkedSignal` no se entera de que hubo un cambio.
    if (listo && !nivel) {
      this.nombre.set('');
      this.tabla.set({ ...VACIA });
    }
  }

  protected async borrar(): Promise<void> {
    const nivel = this.nivel();
    if (!nivel) return;

    await this.intentar('borrar', () => this.api.borrarNivel(nivel.id));
    this.porBorrar.set(false);
  }

  /** Corre la acción y dice si salió bien. */
  private async intentar(
    clave: 'guardar' | 'borrar',
    accion: () => Promise<unknown>,
  ): Promise<boolean> {
    this.error.set(null);
    this.enCurso.set(clave);

    try {
      await accion();
      this.cambio.emit();
      return true;
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar el nivel.'));
      return false;
    } finally {
      this.enCurso.set(null);
    }
  }
}
