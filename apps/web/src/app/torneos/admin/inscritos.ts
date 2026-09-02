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
              <li class="grid gap-1 text-sm">
                <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ quien.jugador }}</span>
                @if (quien.numeroSocio) {
                  <app-insignia variante="info" icono="badge">
                    Socio {{ quien.numeroSocio }}
                  </app-insignia>
                } @else if (quien.procedencia) {
                  <span class="text-muted-foreground">{{ quien.procedencia }}</span>
                }
                <label class="ms-auto flex items-center gap-1">
                  <span class="text-sm text-muted-foreground">Siembra</span>
                  <input
                    class="campo campo-chico w-16"
                    type="number"
                    min="1"
                    [name]="'siembra-' + quien.id"
                    [value]="quien.siembra ?? ''"
                    [disabled]="trabajando() || datos.estado !== 'INSCRIPCION'"
                    (change)="sembrar(quien, $any($event.target).value)"
                  />
                </label>
                <button
                  type="button"
                  class="boton boton-texto boton-chico"
                  [disabled]="trabajando()"
                  (click)="retirar(quien)"
                >
                  Retirar
                </button>
                </div>

                <!-- **Cuándo NO puede jugar** (T65). Va acá y no en lo público: dice a
                     qué hora esa persona no está en su casa. Es lo que el club mira al
                     programar los partidos, así que se lee de un vistazo. -->
                @if (quien.restricciones.length > 0) {
                  <p class="text-xs text-muted-foreground">
                    <span class="icono align-middle text-sm" aria-hidden="true">
                      schedule
                    </span>
                    No puede
                    {{ enPalabras(quien.restricciones) }}
                  </p>
                }
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

  /** El id del **cuadro**: el cupo y la lista de espera son suyos, no del torneo. */
  readonly cuadroId = input.required<number>();

  protected jugadorId = 0;

  /**
   * Las franjas en palabras: "los martes de 18:00 a 21:00 y los jueves de 09:00 a 12:00".
   *
   * En una línea y no en una lista: el admin las lee al pasar, mientras decide a qué
   * hora poner un partido, y una lista por inscrito llenaría la pantalla de viñetas.
   */
  protected enPalabras(
    franjas: { diaSemana: number; horaDesde: string; horaHasta: string }[],
  ): string {
    return franjas
      .map(
        (franja) =>
          `los ${DIAS[franja.diaSemana]} de ${franja.horaDesde} a ${franja.horaHasta}`,
      )
      .join(' y ');
  }

  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly lista = resource({
    params: () => ({ id: this.cuadroId(), version: this.version() }),
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
      await this.api.inscribir(this.cuadroId(), {
        jugadorId: Number(this.jugadorId),
      });
      this.jugadorId = 0;
    });
  }

  /**
   * Pone o quita la siembra.
   *
   * **La decide el admin, no el ranking**: es lo que hace hoy y lo que le permite
   * separar a dos socios que ya jugaron la final el mes pasado.
   */
  protected async sembrar(quien: InscripcionTorneo, valor: string): Promise<void> {
    await this.intentar(() =>
      this.api.sembrar(
        this.cuadroId(),
        quien.id,
        valor === '' ? null : Number(valor),
      ),
    );
  }

  protected async retirar(quien: InscripcionTorneo): Promise<void> {
    await this.intentar(() => this.api.retirar(this.cuadroId(), quien.id));
  }

  protected async promover(quien: InscripcionTorneo): Promise<void> {
    await this.intentar(() => this.api.promover(this.cuadroId(), quien.id));
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

/** 0 = domingo, con la convención de `HorarioApertura`. Solo se usan 1 a 5. */
const DIAS = [
  'domingos',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábados',
];
