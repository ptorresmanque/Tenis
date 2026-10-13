import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { diaConAnioEnPalabras } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { CampoFecha } from '../../ui/campo-fecha';
import { FichaDeTour, TemporadaDelPanel, Tours } from '../tours.service';
import { NivelDelTour } from './nivel-del-tour';

interface DatosDeTemporada {
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
}

/**
 * La pestaña Temporadas de la ficha de un tour (T192): crear una, corregir su nombre y
 * sus fechas, y borrarla si no tiene torneos. Los niveles de cada una son
 * `app-nivel-del-tour`, uno por fila más el de agregar.
 *
 * **Las fechas no se comparan con las de los torneos** (D13): sirven para mostrarse y para
 * elegir la temporada vigente. La API solo exige que el inicio no pase al término.
 */
@Component({
  selector: 'app-temporadas-del-tour',
  imports: [FormsModule, Aviso, CampoFecha, NivelDelTour],
  template: `
    <form
      class="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm"
      aria-label="Nueva temporada"
      (ngSubmit)="crear()"
    >
      <h2 class="rotulo-seccion">Nueva temporada</h2>
      @if (tour().temporadas[0]; as anterior) {
        <p class="mt-2 text-sm text-muted-foreground">
          Copia los niveles de {{ anterior.nombre }}, con sus tablas: después se corrigen
          sin tocar los de {{ anterior.nombre }}.
        </p>
      } @else {
        <p class="mt-2 text-sm text-muted-foreground">
          La primera temporada nace sin niveles: se agregan después, uno por uno.
        </p>
      }
      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        <label class="block">
          <span class="text-sm font-medium">Nombre</span>
          <input
            class="campo mt-1"
            name="nombre"
            maxlength="40"
            placeholder="2027"
            [(ngModel)]="nueva.nombre"
          />
        </label>
        <div class="grid gap-1">
          <label class="text-sm font-medium" for="nueva-temporada-inicio">Empieza</label>
          <app-campo-fecha
            inputId="nueva-temporada-inicio"
            name="fechaInicio"
            [(ngModel)]="nueva.fechaInicio"
          />
        </div>
        <div class="grid gap-1">
          <label class="text-sm font-medium" for="nueva-temporada-fin">Termina</label>
          <app-campo-fecha
            inputId="nueva-temporada-fin"
            name="fechaFin"
            [(ngModel)]="nueva.fechaFin"
          />
        </div>
      </div>
      <button
        type="submit"
        class="boton boton-primario mt-3"
        [disabled]="enCurso() !== null"
        [attr.aria-busy]="enCurso() === 'crear'"
      >
        {{ enCurso() === 'crear' ? 'Creando…' : 'Crear la temporada' }}
      </button>
      @if (origen() === 'crear' && error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      }
    </form>

    @for (temporada of tour().temporadas; track temporada.id) {
      <article class="mt-6 border-t border-border pt-4">
        <header class="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h3 class="titulo-tarjeta">{{ temporada.nombre }}</h3>
          <p class="text-sm text-muted-foreground">
            Del {{ enPalabras(temporada.fechaInicio) }} al {{ enPalabras(temporada.fechaFin) }}
          </p>
          <div class="ms-auto flex flex-wrap gap-2">
            <button
              type="button"
              class="boton boton-texto boton-chico"
              (click)="editar(temporada)"
            >
              Editar
              <span class="sr-only">la temporada {{ temporada.nombre }}</span>
            </button>
            <!-- Con torneos no se ofrece borrar: se quedarían sin nivel y sin puntos. -->
            @if (torneosDe(temporada) === 0) {
              <button
                type="button"
                class="boton boton-texto boton-chico"
                (click)="porBorrar.set(temporada.id)"
              >
                Borrar la temporada
                <span class="sr-only">{{ temporada.nombre }}</span>
              </button>
            }
          </div>
        </header>

        @if (torneosDe(temporada) > 0) {
          <p class="mt-1 text-sm text-muted-foreground">
            Tiene {{ torneosDe(temporada) }}
            {{ torneosDe(temporada) === 1 ? 'torneo' : 'torneos' }}: no se puede borrar.
          </p>
        }

        @if (porBorrar() === temporada.id) {
          <app-aviso variante="aviso" [urgente]="true" class="mt-3 block">
            {{ temporada.nombre }} se borra con sus niveles. Esto no se puede deshacer.
          </app-aviso>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="boton boton-destructivo boton-chico"
              [disabled]="enCurso() !== null"
              [attr.aria-busy]="enCurso() === 'borrar-' + temporada.id"
              (click)="borrar(temporada)"
            >
              Sí, borrar
            </button>
            <button type="button" class="boton boton-texto boton-chico" (click)="porBorrar.set(null)">
              Mejor no
            </button>
          </div>
        }

        @if (editando() === temporada.id) {
          <form
            class="mt-3 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3"
            [attr.aria-label]="'Editar la temporada ' + temporada.nombre"
            (ngSubmit)="guardar(temporada)"
          >
            <label class="block">
              <span class="text-sm font-medium">Nombre</span>
              <input class="campo mt-1" name="nombre" maxlength="40" [(ngModel)]="borrador.nombre" />
            </label>
            <div class="grid gap-1">
              <label class="text-sm font-medium" [for]="'inicio-' + temporada.id">Empieza</label>
              <app-campo-fecha
                [inputId]="'inicio-' + temporada.id"
                name="fechaInicio"
                [(ngModel)]="borrador.fechaInicio"
              />
            </div>
            <div class="grid gap-1">
              <label class="text-sm font-medium" [for]="'fin-' + temporada.id">Termina</label>
              <app-campo-fecha
                [inputId]="'fin-' + temporada.id"
                name="fechaFin"
                [(ngModel)]="borrador.fechaFin"
              />
            </div>
            <div class="flex flex-wrap gap-2 sm:col-span-3">
              <button
                type="submit"
                class="boton boton-primario boton-chico"
                [disabled]="enCurso() !== null"
                [attr.aria-busy]="enCurso() === 'guardar-' + temporada.id"
              >
                Guardar la temporada
              </button>
              <button type="button" class="boton boton-texto boton-chico" (click)="editando.set(null)">
                Cancelar
              </button>
            </div>
          </form>
        }

        @if (origen() === temporada.id && error(); as falla) {
          <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
        }

        <h4 class="subtitulo mt-4">Niveles</h4>
        @if (temporada.niveles.length === 0) {
          <p class="mt-1 text-sm text-muted-foreground">
            Todavía no tiene niveles. Sin niveles, ningún torneo puede sumar a esta temporada.
          </p>
        }
        <div class="mt-2 grid gap-3">
          @for (nivel of temporada.niveles; track nivel.id) {
            <app-nivel-del-tour
              [nivel]="nivel"
              [temporadaId]="temporada.id"
              [temporada]="temporada.nombre"
              (cambio)="cambio.emit()"
            />
          }
          <app-nivel-del-tour
            [nivel]="null"
            [temporadaId]="temporada.id"
            [temporada]="temporada.nombre"
            (cambio)="cambio.emit()"
          />
        </div>
      </article>
    } @empty {
      <p class="mt-6 text-muted-foreground">
        Todavía no tiene temporadas. Crea la primera con su nombre y sus fechas.
      </p>
    }
  `,
})
export class TemporadasDelTour {
  private readonly api = inject(Tours);

  readonly tour = input.required<FichaDeTour>();

  /** Algo cambió en la API: la ficha tiene que recargar. */
  readonly cambio = output<void>();

  protected readonly enPalabras = diaConAnioEnPalabras;

  protected nueva: DatosDeTemporada = { nombre: '', fechaInicio: '', fechaFin: '' };
  /** Lo que hay en los campos de la temporada que se está corrigiendo. */
  protected borrador: DatosDeTemporada = { nombre: '', fechaInicio: '', fechaFin: '' };

  protected readonly editando = signal<number | null>(null);
  protected readonly porBorrar = signal<number | null>(null);
  /** Qué acción está viajando, para que gire su botón y no todos (T153). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  /** Dónde va el error: junto al formulario de crear o junto a la temporada que lo causó. */
  protected readonly origen = signal<'crear' | number | null>(null);

  /** Los torneos de una temporada son los de sus niveles. */
  protected torneosDe(temporada: TemporadaDelPanel): number {
    return temporada.niveles.reduce((suma, nivel) => suma + nivel.torneos, 0);
  }

  protected editar(temporada: TemporadaDelPanel): void {
    this.borrador = {
      nombre: temporada.nombre,
      fechaInicio: temporada.fechaInicio,
      fechaFin: temporada.fechaFin,
    };
    this.editando.set(temporada.id);
  }

  protected async crear(): Promise<void> {
    const listo = await this.intentar('crear', 'crear', () =>
      this.api.crearTemporada(this.tour().id, { ...this.nueva, nombre: this.nueva.nombre.trim() }),
    );

    if (listo) this.nueva = { nombre: '', fechaInicio: '', fechaFin: '' };
  }

  protected async guardar(temporada: TemporadaDelPanel): Promise<void> {
    const listo = await this.intentar(temporada.id, `guardar-${temporada.id}`, () =>
      this.api.editarTemporada(temporada.id, {
        ...this.borrador,
        nombre: this.borrador.nombre.trim(),
      }),
    );

    if (listo) this.editando.set(null);
  }

  protected async borrar(temporada: TemporadaDelPanel): Promise<void> {
    await this.intentar(temporada.id, `borrar-${temporada.id}`, () =>
      this.api.borrarTemporada(temporada.id),
    );
    this.porBorrar.set(null);
  }

  /** Corre la acción, avisa a la ficha si salió bien y dice si salió bien. */
  private async intentar(
    origen: 'crear' | number,
    clave: string,
    accion: () => Promise<unknown>,
  ): Promise<boolean> {
    this.error.set(null);
    this.origen.set(origen);
    this.enCurso.set(clave);

    try {
      await accion();
      this.cambio.emit();
      return true;
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar la temporada.'));
      return false;
    } finally {
      this.enCurso.set(null);
    }
  }
}
