import {
  afterNextRender,
  Component,
  inject,
  Injector,
  resource,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCard } from '@angular/material/card';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { proveerCampos } from '../ui/campos';
import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { Esqueleto } from '../ui/esqueleto';
import { EstadoVacio } from '../ui/estado-vacio';
import { PreguntaFrecuente, PreguntasFrecuentes } from './preguntas-frecuentes.service';
import { LO_HECHO } from '../ui/material';

/** Lo que cabe: el largo de la columna de la pregunta y el tope de la API (T144). */
const LARGO_DE_LA_PREGUNTA = 191;
const LARGO_DE_LA_RESPUESTA = 2000;

/**
 * Las preguntas frecuentes del club (T145), que publica `/preguntas-frecuentes`.
 *
 * Con el patrón de las categorías de juego: el formulario de agregar arriba y la lista
 * abajo, y el orden es un número en cada fila. Corregir y borrar pasan en la propia
 * fila —la confirmación también, como al cancelar una reserva—, así que no hay un
 * diálogo que atrape el foco ni una pantalla aparte.
 */
@Component({
  selector: 'app-preguntas-frecuentes',
  imports: [MatCard, MatFormFieldModule, MatInput, MatButton, FormsModule, Aviso, Esqueleto, EstadoVacio],
  providers: [proveerCampos()],
  template: `
    <section aria-labelledby="titulo-preguntas">
      <!-- Para el lector y no a la vista (T290): va dentro del panel «Preguntas frecuentes» de
           Configuración, que ya lo dice. Sigue siendo adonde vuelve el foco al borrar. -->
      <h2 id="titulo-preguntas" class="sr-only" tabindex="-1">Preguntas frecuentes</h2>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        Salen en la página «Preguntas frecuentes», enlazada desde el pie de cada página y
        desde «El club». Van en el orden de la lista: el número menor, más arriba.
      </p>

      <form class="mt-4 grid max-w-xl gap-4" (ngSubmit)="agregar()">
        <mat-form-field>
          <mat-label>Pregunta <span aria-hidden="true">*</span></mat-label>
          <input
            matInput
            name="pregunta"
            [maxlength]="LARGO_DE_LA_PREGUNTA"
            [(ngModel)]="nueva.pregunta"
          />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Respuesta <span aria-hidden="true">*</span></mat-label>
          <textarea
            matInput
            name="respuesta"
            rows="4"
            [maxlength]="LARGO_DE_LA_RESPUESTA"
            [(ngModel)]="nueva.respuesta"
          ></textarea>
          <mat-hint>
            {{ 'Texto simple: los saltos de línea se respetan. ' + quedan(nueva.respuesta) }}
          </mat-hint>
        </mat-form-field>

        <div>
          <!-- Crear, editar y confirmar el borrado son formularios distintos, uno por pregunta.
               mat-guidelines-ignore: multiples-filled -->
          <button
            matButton="filled"
            type="submit"
            [disabled]="enviando()"
            [attr.aria-busy]="enCurso() === 'agregar'"
          >
            Agregar la pregunta
          </button>
        </div>
      </form>

      <!-- Acá, solo lo de agregar y lo de borrar (la fila ya no está). Lo de una fila
           sale en esa fila: con veinte preguntas, arriba no se vería. -->
      @if (origen() === null) {
        @if (error(); as falla) {
          <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
        }
      }
    </section>

    <section class="mt-8" aria-labelledby="listado-preguntas">
      <h2 id="listado-preguntas" class="sr-only">Preguntas publicadas</h2>

      <!-- El esqueleto, solo la primera vez. Al recargar después de guardar la lista se
           queda puesta: redibujarla destruiría el botón que acaba de recibir el foco. -->
      @if (!preguntas.hasValue() && preguntas.isLoading()) {
        <app-esqueleto class="block" [filas]="3" etiqueta="Cargando las preguntas…" />
      } @else if (preguntas.error()) {
        <p class="text-destructive">
          No se pudieron cargar las preguntas. Reintenta en un momento.
        </p>
      } @else if (lista().length === 0) {
        <app-estado-vacio
          icono="quiz"
          titulo="Todavía no hay preguntas"
          detalle="Mientras tanto, la página pública dice que no hay y ofrece el formulario de contacto. Agrega la primera arriba."
        />
      } @else {
        <ol class="grid gap-3">
          @for (pregunta of lista(); track pregunta.id) {
            <li>
              <mat-card appearance="outlined" class="p-4">
                @if (editando() === pregunta.id) {
                  <form class="grid gap-4" (ngSubmit)="guardar(pregunta)">
                    <mat-form-field>
                      <mat-label>Pregunta <span aria-hidden="true">*</span></mat-label>
                      <input
                        matInput
                        [id]="'editar-pregunta-' + pregunta.id"
                        name="pregunta"
                        [maxlength]="LARGO_DE_LA_PREGUNTA"
                        [(ngModel)]="borrador.pregunta"
                      />
                    </mat-form-field>
                    <mat-form-field>
                      <mat-label>Respuesta <span aria-hidden="true">*</span></mat-label>
                      <textarea
                        matInput
                        name="respuesta"
                        rows="4"
                        [maxlength]="LARGO_DE_LA_RESPUESTA"
                        [(ngModel)]="borrador.respuesta"
                      ></textarea>
                      <mat-hint>{{ quedan(borrador.respuesta) }}</mat-hint>
                    </mat-form-field>
                    <div class="flex flex-wrap gap-2">
                      <!-- Guardar y confirmar el borrado son ramas distintas de la misma tarjeta:
                           nunca están las dos a la vista. mat-guidelines-ignore: multiples-filled -->
                      <button
                        matButton="filled"
                        type="submit"
                        class="chico"
                        [disabled]="enviando()"
                        [attr.aria-busy]="enCurso() === 'guardar-' + pregunta.id"
                      >
                        Guardar
                      </button>
                      <button
                        matButton
                        type="button"
                        class="chico"
                        (click)="cerrarEdicion(pregunta.id)"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                } @else {
                  <div class="flex items-start gap-4">
                    <div class="min-w-0 flex-1">
                      <h3 class="font-semibold">{{ pregunta.pregunta }}</h3>
                      <!-- Un adelanto: la respuesta entera se lee al editarla. -->
                      <p class="mt-1 line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">{{ pregunta.respuesta }}</p>
                    </div>

                    <mat-form-field class="w-18 sm:w-24">
                      <!-- «Orden» a la vista y la pregunta para el lector (T290): el campo es
                           angosto, y la etiqueta entera se cortaba en «Orden de «¿Nec». -->
                      <mat-label
                        >Orden<span class="sr-only"> de «{{ pregunta.pregunta }}»</span></mat-label
                      >
                      <input
                        matInput
                        [id]="'orden-pregunta-' + pregunta.id"
                        type="number"
                        min="0"
                        max="1000"
                        [value]="pregunta.orden"
                        [disabled]="enviando()"
                        (change)="mover(pregunta, $event)"
                      />
                    </mat-form-field>
                  </div>

                  @if (porBorrar() === pregunta.id) {
                    <!-- La confirmación en la fila, como al cancelar una reserva: es la
                         consecuencia de esta pregunta y no hay foco que atrapar. -->
                    <app-aviso variante="aviso" [urgente]="true" class="mt-3 block">
                      «{{ pregunta.pregunta }}» deja de aparecer en el sitio. Esto no se
                      puede deshacer.
                    </app-aviso>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        matButton="filled"
                        type="button"
                        class="peligro chico"
                        [disabled]="enviando()"
                        [attr.aria-busy]="enCurso() === 'borrar-' + pregunta.id"
                        (click)="borrar(pregunta)"
                      >
                        Sí, borrar
                      </button>
                      <button
                        matButton
                        type="button"
                        class="chico"
                        (click)="porBorrar.set(null)"
                      >
                        Mejor no
                      </button>
                    </div>
                  } @else {
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        matButton="outlined"
                        type="button"
                        [id]="'editar-' + pregunta.id"
                        class="chico"
                        (click)="abrirEdicion(pregunta)"
                      >
                        Editar
                        <span class="sr-only">«{{ pregunta.pregunta }}»</span>
                      </button>
                      <button
                        matButton
                        type="button"
                        class="chico"
                        (click)="porBorrar.set(pregunta.id)"
                      >
                        Borrar
                        <span class="sr-only">«{{ pregunta.pregunta }}»</span>
                      </button>
                    </div>
                  }
                }

                @if (origen() === pregunta.id) {
                  @if (error(); as falla) {
                    <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
                  }
                }
              </mat-card>
            </li>
          }
        </ol>
      }
    </section>
  `,
})
export class PreguntasFrecuentesPanel {
  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(PreguntasFrecuentes);
  private readonly injector = inject(Injector);

  protected readonly LARGO_DE_LA_PREGUNTA = LARGO_DE_LA_PREGUNTA;
  protected readonly LARGO_DE_LA_RESPUESTA = LARGO_DE_LA_RESPUESTA;

  protected nueva = { pregunta: '', respuesta: '' };
  /** Lo que hay en la fila que se está corrigiendo. */
  protected borrador = { pregunta: '', respuesta: '' };

  protected readonly editando = signal<number | null>(null);
  protected readonly porBorrar = signal<number | null>(null);

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Qué acción está viajando, para que gire su botón y no todos (T153). */
  protected readonly enCurso = signal<string | null>(null);
  /** De qué fila es el mensaje; nulo si es del formulario de agregar. */
  protected readonly origen = signal<number | null>(null);

  protected readonly preguntas = resource({
    loader: () => this.api.listar(),
  });

  /** `value()` lanza en estado de error. */
  protected lista(): PreguntaFrecuente[] {
    return this.preguntas.hasValue() ? this.preguntas.value() : [];
  }

  protected quedan(texto: string): string {
    const quedan = LARGO_DE_LA_RESPUESTA - texto.length;

    return quedan === 1 ? 'Queda 1 carácter.' : `Quedan ${quedan} caracteres.`;
  }

  protected async agregar(): Promise<void> {
    this.limpiarMensajes(null);

    const falta = queFalta(this.nueva);
    if (falta) {
      this.error.set(falta);
      return;
    }

    await this.contra('agregar', async () => {
      await this.api.crear(this.nueva.pregunta.trim(), this.nueva.respuesta.trim());
      this.snackBar.open('Pregunta agregada al final de la lista.', undefined, LO_HECHO);
      this.nueva = { pregunta: '', respuesta: '' };
    }, 'No se pudo agregar la pregunta.');
  }

  protected abrirEdicion(pregunta: PreguntaFrecuente): void {
    this.limpiarMensajes(pregunta.id);
    this.porBorrar.set(null);
    this.borrador = { pregunta: pregunta.pregunta, respuesta: pregunta.respuesta };
    this.editando.set(pregunta.id);
    this.enfocar(`editar-pregunta-${pregunta.id}`);
  }

  /**
   * De vuelta al botón que la abrió: sin esto, el foco cae al comienzo de la página.
   * Solo si sigue abierta esa: mientras una se guardaba, se puede haber abierto otra, y
   * terminar de guardar la primera no puede cerrarle la segunda a nadie.
   */
  protected cerrarEdicion(id: number): void {
    if (this.editando() !== id) return;

    this.editando.set(null);
    this.enfocar(`editar-${id}`);
  }

  protected async guardar(pregunta: PreguntaFrecuente): Promise<void> {
    this.limpiarMensajes(pregunta.id);

    const falta = queFalta(this.borrador);
    if (falta) {
      this.error.set(falta);
      return;
    }

    await this.contra(`guardar-${pregunta.id}`, async () => {
      await this.api.editar(pregunta.id, {
        pregunta: this.borrador.pregunta.trim(),
        respuesta: this.borrador.respuesta.trim(),
      });
      this.snackBar.open('Pregunta guardada.', undefined, LO_HECHO);
      this.cerrarEdicion(pregunta.id);
    }, 'No se pudo guardar la pregunta.');
  }

  /** Cambiar el número es cómo se reordena, como en las categorías de juego. */
  protected async mover(pregunta: PreguntaFrecuente, evento: Event): Promise<void> {
    const orden = Number((evento.target as HTMLInputElement).value);

    this.limpiarMensajes(pregunta.id);

    // Vacío llega como 0 y basura como NaN: se ataja con un mensaje que dice qué
    // escribir, en vez de un 400 que solo dice que no se pudo.
    if (!Number.isInteger(orden) || orden < 0 || orden > 1000) {
      this.error.set('El orden tiene que ser un número entero entre 0 y 1000.');
      return;
    }

    await this.contra(`mover-${pregunta.id}`, async () => {
      await this.api.editar(pregunta.id, { orden });
      this.snackBar.open(
        `«${pregunta.pregunta}» quedó con el orden ${orden}.`,
        undefined,
        LO_HECHO,
      );
    }, 'No se pudo mover la pregunta.');
  }

  protected async borrar(pregunta: PreguntaFrecuente): Promise<void> {
    this.limpiarMensajes(pregunta.id);

    await this.contra(`borrar-${pregunta.id}`, async () => {
      await this.api.borrar(pregunta.id);
      // La fila se va: el aviso sale arriba, junto al título.
      this.origen.set(null);
      this.snackBar.open(`«${pregunta.pregunta}» ya no aparece en el sitio.`, undefined, LO_HECHO);
      // La fila se va con sus botones y el foco vuelve al título, salvo que mientras
      // tanto se haya abierto otra confirmación: esa sigue siendo de la persona.
      if (this.porBorrar() === pregunta.id) {
        this.porBorrar.set(null);
        this.enfocar('titulo-preguntas');
      }
    }, 'No se pudo borrar la pregunta.');
  }

  /**
   * Recarga siempre, incluso al fallar, como en las categorías de juego: el número que
   * quedó escrito en una fila puede no ser el guardado.
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
      // `reload()` y no un cambio de parámetros: recarga conservando lo que ya se ve.
      this.preguntas.reload();
    }
  }

  /** Después de dibujar: el elemento puede no existir todavía. */
  private enfocar(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }

  private limpiarMensajes(origen: number | null): void {
    this.error.set(null);
    this.origen.set(origen);
  }
}

/** El mismo mensaje en agregar y en corregir: los dos campos son obligatorios. */
function queFalta({ pregunta, respuesta }: { pregunta: string; respuesta: string }): string | null {
  if (!pregunta.trim()) return 'Escribe la pregunta.';
  if (!respuesta.trim()) return 'Escribe la respuesta.';

  return null;
}
