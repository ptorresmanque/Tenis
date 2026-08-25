import { Component, computed, inject, input, resource, signal } from '@angular/core';

import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Insignia } from '../../ui/insignia';
import { PartidoDelCuadro, Torneos } from '../torneos.service';

/**
 * El cuadro del torneo.
 *
 * **Es lo que la gente mira en el mural del club**, así que se dibuja entero desde el
 * primer día: todas las rondas, con los lugares vacíos donde todavía no se sabe quién
 * llega. Una mitad en blanco no dice nada; una mitad dibujada dice a quién te toca si
 * ganás.
 */
@Component({
  selector: 'app-cuadro-torneo',
  imports: [Aviso, Insignia],
  template: `
    @if (cuadro.value(); as datos) {
      <div class="mt-3 rounded-xl border border-border bg-background p-4">
        <div class="flex flex-wrap items-baseline gap-2">
          <h3 class="font-display font-semibold">Cuadro</h3>
          @if (datos.semillaSorteo !== null) {
            <!-- La semilla a la vista: si alguien pregunta por qué le tocó ese cruce,
                 el sorteo se puede rehacer con este número. -->
            <span class="text-sm text-muted-foreground">
              sorteo n.º {{ datos.semillaSorteo }}
            </span>
          }
        </div>

        @if (error(); as falla) {
          <app-aviso variante="error" class="mt-2 block">{{ falla }}</app-aviso>
        }

        @if (datos.partidos.length === 0) {
          <p class="mt-2 text-sm text-muted-foreground">
            El cuadro se arma cuando cierra la inscripción. Siembra a los que
            correspondan y aprieta el botón: los demás se sortean.
          </p>
          <button
            type="button"
            class="boton boton-primario boton-chico mt-2"
            [disabled]="trabajando()"
            (click)="armar()"
          >
            Armar el cuadro
          </button>
        } @else {
          <div class="mt-3 flex gap-4 overflow-x-auto pb-2">
            @for (ronda of porRonda(); track ronda.numero) {
              <div class="min-w-56 flex-1">
                <h4 class="text-sm font-semibold text-muted-foreground">
                  {{ ronda.nombre }}
                </h4>
                <ul class="mt-2 grid gap-2">
                  @for (partido of ronda.partidos; track partido.id) {
                    <li class="rounded-lg border border-border bg-card p-2 text-sm">
                      <p [class.font-semibold]="partido.ganadorId === partido.jugadorAId">
                        {{ partido.jugadorA ?? nombreVacio(partido) }}
                      </p>
                      <p [class.font-semibold]="partido.ganadorId === partido.jugadorBId">
                        {{ partido.jugadorB ?? nombreVacio(partido) }}
                      </p>
                      @if (partido.marcador) {
                        <p class="text-xs text-muted-foreground">
                          {{ partido.marcador }}
                        </p>
                      }
                    </li>
                  }
                </ul>
              </div>
            }
          </div>

          <button
            type="button"
            class="boton boton-texto boton-chico mt-2"
            [disabled]="trabajando()"
            (click)="deshacer()"
          >
            Deshacer el cuadro
          </button>
          <p class="mt-1 text-sm text-muted-foreground">
            Solo mientras no haya resultados cargados.
          </p>
        }
      </div>
    }
  `,
})
export class CuadroDelTorneo {
  private readonly api = inject(Torneos);

  readonly torneoId = input.required<number>();

  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly cuadro = resource({
    params: () => ({ id: this.torneoId(), version: this.version() }),
    loader: ({ params }) => this.api.cuadro(params.id),
  });

  /** Los partidos agrupados por ronda, que es como se dibuja un cuadro. */
  protected readonly porRonda = computed(() => {
    const partidos = this.cuadro.value()?.partidos ?? [];
    const rondas = new Map<number, PartidoDelCuadro[]>();

    for (const partido of partidos) {
      rondas.set(partido.ronda, [...(rondas.get(partido.ronda) ?? []), partido]);
    }

    return [...rondas].map(([numero, suyos]) => ({
      numero,
      nombre: suyos[0].ronda_nombre,
      partidos: suyos,
    }));
  });

  /**
   * Qué decir en un lugar vacío.
   *
   * Un hueco en primera ronda es un **bye** —alguien pasa sin jugar— y en las demás es
   * un lugar que todavía no se sabe. Poner "—" en los dos casos haría parecer que el
   * cuadro está a medio armar.
   */
  protected nombreVacio(partido: PartidoDelCuadro): string {
    return partido.ronda === 1 ? 'Bye' : 'Por definir';
  }

  protected async armar(): Promise<void> {
    await this.intentar(() => this.api.armarCuadro(this.torneoId()));
  }

  protected async deshacer(): Promise<void> {
    await this.intentar(() => this.api.deshacerCuadro(this.torneoId()));
  }

  private async intentar(accion: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: dice si faltan jugadores o si el cuadro ya tiene resultados.
      this.error.set(mensajeDelServidor(falla, 'No se pudo armar el cuadro.'));
    } finally {
      this.trabajando.set(false);
    }
  }
}
