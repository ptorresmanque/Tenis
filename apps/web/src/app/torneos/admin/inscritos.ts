import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Insignia } from '../../ui/insignia';
import { InscripcionTorneo, Torneos } from '../torneos.service';

/**
 * Quién juega un torneo.
 *
 * **Pasado el cupo, el jugador entra en lista de espera y no se lo rechaza.** El club
 * llama por teléfono antes de meter a alguien en un cuadro que ya anunció, así que
 * promover es un botón y no un automatismo: quien quedó fuera hace dos semanas ya hizo
 * otros planes.
 */
@Component({
  selector: 'app-inscritos-torneo',
  imports: [FormsModule, Aviso, Insignia],
  template: `
    @if (lista.value(); as datos) {
      <div class="mt-3 rounded-xl border border-border bg-background p-4">
        <div class="flex flex-wrap items-baseline gap-2">
          <h3 class="font-display font-semibold">Inscritos</h3>
          <app-insignia
            [variante]="datos.inscritos.length >= datos.cupo ? 'aviso' : 'neutro'"
            icono="group"
          >
            {{ datos.inscritos.length }} de {{ datos.cupo }}
          </app-insignia>
        </div>

        @if (error(); as falla) {
          <app-aviso variante="error" class="mt-2 block">{{ falla }}</app-aviso>
        }

        @if (datos.inscritos.length === 0) {
          <p class="mt-2 text-sm text-muted-foreground">Todavía no hay nadie inscrito.</p>
        } @else {
          <ul class="mt-2 grid gap-2">
            @for (quien of datos.inscritos; track quien.id) {
              <li class="flex flex-wrap items-center gap-2 text-sm">
                <span class="font-medium">{{ quien.jugador }}</span>
                @if (quien.numeroSocio) {
                  <app-insignia variante="info" icono="badge">
                    Socio {{ quien.numeroSocio }}
                  </app-insignia>
                }
                @if (quien.siembra) {
                  <app-insignia variante="exito" icono="star">
                    Sembrado {{ quien.siembra }}
                  </app-insignia>
                }
                <button
                  type="button"
                  class="boton boton-texto boton-chico ms-auto"
                  [disabled]="trabajando()"
                  (click)="retirar(quien)"
                >
                  Retirar
                </button>
              </li>
            }
          </ul>
        }

        @if (datos.enEspera.length > 0) {
          <h4 class="mt-3 font-medium">
            Lista de espera
            <span class="text-sm font-normal text-muted-foreground">
              · en orden de llegada
            </span>
          </h4>
          <ul class="mt-1 grid gap-2">
            @for (quien of datos.enEspera; track quien.id) {
              <li class="flex flex-wrap items-center gap-2 text-sm">
                <span>{{ quien.jugador }}</span>
                <button
                  type="button"
                  class="boton boton-secundario boton-chico ms-auto"
                  [disabled]="trabajando()"
                  (click)="promover(quien)"
                >
                  Meter al cuadro
                </button>
              </li>
            }
          </ul>
          <p class="mt-1 text-sm text-muted-foreground">
            No entran solos: el club llama antes de meter a alguien en el cuadro.
          </p>
        }

        @if (datos.retirados.length > 0) {
          <p class="mt-3 text-sm text-muted-foreground">
            Se bajaron: {{ nombresRetirados() }}
          </p>
        }

        @if (datos.estado === 'INSCRIPCION') {
          <form class="mt-3 border-t border-border pt-3" (ngSubmit)="inscribir()">
            <div class="flex flex-wrap items-end gap-2">
              <label class="min-w-64 flex-1">
                <span class="text-sm font-medium">Inscribir a</span>
                <select
                  class="campo campo-chico mt-1"
                  name="jugadorId"
                  [(ngModel)]="jugadorId"
                >
                  <option [value]="0" disabled>Elige un jugador</option>
                  @for (jugador of porInscribir(); track jugador.id) {
                    <option [value]="jugador.id">
                      {{ jugador.apellido }}, {{ jugador.nombre }}
                    </option>
                  }
                </select>
              </label>

              <button
                type="submit"
                class="boton boton-secundario boton-chico"
                [disabled]="trabajando()"
              >
                Inscribir
              </button>
            </div>

            @if (datos.inscritos.length >= datos.cupo) {
              <p class="mt-2 text-sm text-muted-foreground">
                El cuadro está lleno: el que se inscriba queda en lista de espera.
              </p>
            }
          </form>
        } @else {
          <p class="mt-3 text-sm text-muted-foreground">
            La inscripción de este torneo está cerrada.
          </p>
        }
      </div>
    }
  `,
})
export class InscritosDelTorneo {
  private readonly api = inject(Torneos);

  readonly torneoId = input.required<number>();

  protected jugadorId = 0;

  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly lista = resource({
    params: () => ({ id: this.torneoId(), version: this.version() }),
    loader: ({ params }) => this.api.inscripciones(params.id),
  });

  protected readonly jugadores = resource({
    loader: () => this.api.jugadores(true),
    defaultValue: [],
  });

  /**
   * Los que todavía no están en este torneo.
   *
   * Elegir a alguien que ya está responde 409 con un mensaje claro, pero la lista lo
   * seguiría ofreciendo. El que se retiró vuelve a aparecer: puede reinscribirse.
   */
  protected readonly porInscribir = computed(() => {
    const yaEstan = new Set(
      [
        ...(this.lista.value()?.inscritos ?? []),
        ...(this.lista.value()?.enEspera ?? []),
      ].map((quien) => quien.jugadorId),
    );

    return this.jugadores.value().filter((jugador) => !yaEstan.has(jugador.id));
  });

  protected readonly nombresRetirados = computed(() =>
    (this.lista.value()?.retirados ?? [])
      .map((quien) => quien.jugador)
      .join(', '),
  );

  protected async inscribir(): Promise<void> {
    await this.intentar(async () => {
      await this.api.inscribir(this.torneoId(), {
        jugadorId: Number(this.jugadorId),
      });
      this.jugadorId = 0;
    });
  }

  protected async retirar(quien: InscripcionTorneo): Promise<void> {
    await this.intentar(() => this.api.retirar(this.torneoId(), quien.id));
  }

  protected async promover(quien: InscripcionTorneo): Promise<void> {
    await this.intentar(() => this.api.promover(this.torneoId(), quien.id));
  }

  private async intentar(accion: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: dice si la inscripción se cerró, si el cuadro está lleno o
      // si ese jugador ya está.
      this.error.set(mensajeDelServidor(falla, 'No se pudo inscribir.'));
    } finally {
      this.trabajando.set(false);
    }
  }
}
