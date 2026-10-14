import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';

import { diaEnPalabras, fechaEnElClub, horaEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { Auth } from '../../core/auth/auth';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Agenda, ObservacionDeReserva, ReservaDelDia } from './agenda.service';
import { HistorialDeObservaciones } from './historial-de-observaciones';

/**
 * Las notas del mesón bajo una reserva de la agenda (T226, `SPEC-reservas.md` §
 * Observaciones del mesón): el socio que se pasó de su hora, el que dejó la cancha sucia.
 *
 * Las anotan el admin y el gestor; corregirlas y borrarlas es del autor o de un admin,
 * y la pantalla solo ofrece esos botones donde el servidor los va a aceptar. De un socio
 * se puede abrir lo que tiene de antes.
 */
@Component({
  selector: 'app-observaciones-de-reserva',
  imports: [MatButton, FormsModule, Aviso, HistorialDeObservaciones],
  template: `
    @if (reserva().observaciones.length > 0) {
      <ul class="mt-3 grid gap-2 text-sm">
        @for (observacion of reserva().observaciones; track observacion.id) {
          <li class="rounded-lg bg-muted p-2">
            @if (corrigiendo() === observacion.id) {
              <form (ngSubmit)="guardarCorreccion(observacion.id)">
                <label class="sr-only" [attr.for]="'corregir-' + observacion.id">
                  Corregir la observación
                </label>
                <textarea
                  class="campo"
                  rows="2"
                  maxlength="500"
                  [attr.id]="'corregir-' + observacion.id"
                  [attr.name]="'corregir-' + observacion.id"
                  [(ngModel)]="textoCorregido"
                  [ngModelOptions]="{ standalone: true }"
                ></textarea>
                <div class="mt-2 flex flex-wrap gap-2">
                  <!-- Corregir una y anotar otra son formularios distintos, cada uno con su envío.
                       mat-guidelines-ignore: multiples-filled -->
                  <button
                    matButton="filled"
                    type="submit"
                    class="chico"
                    [disabled]="trabajando()"
                    [attr.aria-busy]="trabajando()"
                  >
                    Guardar
                  </button>
                  <button
                    matButton
                    type="button"
                    class="chico"
                    (click)="corrigiendo.set(null)"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            } @else {
              <p>{{ observacion.texto }}</p>
              <p class="text-xs text-muted-foreground">
                {{ observacion.autorNombre }} · {{ cuando(observacion.creadaEn) }}
                @if (observacion.editadaEn) {
                  · corregida
                }
              </p>
              @if (puedeTocar(observacion)) {
                <div class="mt-1 flex flex-wrap gap-2">
                  <button
                    matButton
                    type="button"
                    class="chico"
                    [disabled]="trabajando()"
                    (click)="editarObservacion(observacion)"
                  >
                    Corregir
                  </button>
                  <button
                    matButton
                    type="button"
                    class="peligro chico"
                    [disabled]="trabajando()"
                    [attr.aria-busy]="borrando() === observacion.id"
                    (click)="borrar(observacion.id)"
                  >
                    Borrar
                  </button>
                </div>
              }
            }
          </li>
        }
      </ul>
    }

    <div class="mt-2 flex flex-wrap gap-2">
      @if (!anotando()) {
        <button matButton type="button" class="chico" (click)="abrirNueva()">
          Anotar observación
        </button>
      }
      @if (reserva().socioId !== null && reserva().observacionesAnteriores > 0) {
        <button
          matButton
          type="button"
          class="chico"
          [attr.aria-expanded]="viendoAnteriores()"
          (click)="viendoAnteriores.set(!viendoAnteriores())"
        >
          {{ reserva().observacionesAnteriores }}
          {{
            reserva().observacionesAnteriores === 1
              ? 'observación anterior'
              : 'observaciones anteriores'
          }}
        </button>
      }
    </div>

    @if (anotando()) {
      <form class="mt-2" (ngSubmit)="anotar()">
        <label class="sr-only" [attr.for]="'nueva-' + reserva().id">Nueva observación</label>
        <textarea
          class="campo"
          rows="2"
          maxlength="500"
          name="nueva-observacion"
          placeholder="Qué pasó con esta reserva"
          [attr.id]="'nueva-' + reserva().id"
          [(ngModel)]="textoNuevo"
        ></textarea>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            matButton="filled"
            type="submit"
            class="chico"
            [disabled]="trabajando()"
            [attr.aria-busy]="trabajando()"
          >
            Guardar
          </button>
          <button matButton type="button" class="chico" (click)="anotando.set(false)">
            Cancelar
          </button>
        </div>
      </form>
    }

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-2 block">{{ falla }}</app-aviso>
    }

    @if (viendoAnteriores() && reserva().socioId; as socioId) {
      <div class="mt-2">
        <app-historial-de-observaciones [socioId]="socioId" [excluirReservaId]="reserva().id" />
      </div>
    }
  `,
})
export class ObservacionesDeReserva {
  private readonly agenda = inject(Agenda);
  private readonly yo = inject(Auth).usuario;

  readonly reserva = input.required<ReservaDelDia>();
  /** Algo cambió: la agenda vuelve a pedir el día. */
  readonly cambio = output<void>();

  protected readonly anotando = signal(false);
  protected readonly corrigiendo = signal<number | null>(null);
  protected readonly viendoAnteriores = signal(false);
  protected readonly trabajando = signal(false);
  protected readonly borrando = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);

  protected textoNuevo = '';
  protected textoCorregido = '';

  /** Lo mismo que decide el servidor: el autor, o un admin. */
  protected puedeTocar(observacion: ObservacionDeReserva): boolean {
    const yo = this.yo();
    return yo !== null && (yo.esAdmin || yo.id === observacion.autorId);
  }

  protected cuando(instante: string): string {
    return `${diaEnPalabras(fechaEnElClub(instante))}, ${horaEnElClub(instante)}`;
  }

  protected abrirNueva(): void {
    this.textoNuevo = '';
    this.anotando.set(true);
  }

  protected editarObservacion(observacion: ObservacionDeReserva): void {
    this.textoCorregido = observacion.texto;
    this.corrigiendo.set(observacion.id);
  }

  protected async anotar(): Promise<void> {
    const listo = await this.intentar(() => this.agenda.anotar(this.reserva().id, this.textoNuevo));
    if (listo) this.anotando.set(false);
  }

  protected async guardarCorreccion(id: number): Promise<void> {
    const listo = await this.intentar(() => this.agenda.corregir(id, this.textoCorregido));
    if (listo) this.corrigiendo.set(null);
  }

  protected async borrar(id: number): Promise<void> {
    if (!window.confirm('¿Borrar esta observación? No queda rastro de ella.')) return;

    this.borrando.set(id);
    await this.intentar(() => this.agenda.borrar(id));
    this.borrando.set(null);
  }

  private async intentar(accion: () => Promise<unknown>): Promise<boolean> {
    this.error.set(null);
    this.trabajando.set(true);

    try {
      await accion();
      this.cambio.emit();
      return true;
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar la observación.'));
      return false;
    } finally {
      this.trabajando.set(false);
    }
  }
}
