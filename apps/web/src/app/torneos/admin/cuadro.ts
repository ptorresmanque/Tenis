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
                      @if (partido.walkover) {
                        <app-insignia variante="neutro" icono="block">
                          No se presentó
                        </app-insignia>
                      }

                      @if (sePuedeCargar(partido)) {
                        <button
                          type="button"
                          class="boton boton-texto boton-chico mt-1"
                          [disabled]="trabajando()"
                          (click)="abrir(partido)"
                        >
                          {{ partido.ganadorId ? 'Corregir' : 'Cargar resultado' }}
                        </button>
                      }
                    </li>
                  }
                </ul>
              </div>
            }
          </div>

          @if (cargando(); as partido) {
            <div
              role="alertdialog"
              aria-labelledby="titulo-resultado"
              class="mt-3 rounded-xl border border-border bg-card p-4 text-sm"
            >
              <h4 id="titulo-resultado" class="font-display font-semibold">
                {{ partido.jugadorA }} contra {{ partido.jugadorB }}
              </h4>

              @if (deshace() > 0) {
                <!-- Lo que se confirma no es "¿seguro?", es este número: corregir una
                     semifinal borra la final que ya se jugó. -->
                <p class="mt-1 text-destructive">
                  Cambiar este resultado deshace {{ deshace() }}
                  {{ deshace() === 1 ? 'partido ya jugado' : 'partidos ya jugados' }}
                  más adelante en el cuadro.
                </p>
              }

              <fieldset class="mt-2">
                <legend class="text-sm font-medium">Quién ganó</legend>
                <label class="mt-1 flex items-center gap-2">
                  <input
                    type="radio"
                    name="ganador"
                    [value]="partido.jugadorAId"
                    [checked]="ganadorId() === partido.jugadorAId"
                    (change)="ganadorId.set(partido.jugadorAId)"
                  />
                  {{ partido.jugadorA }}
                </label>
                <label class="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ganador"
                    [value]="partido.jugadorBId"
                    [checked]="ganadorId() === partido.jugadorBId"
                    (change)="ganadorId.set(partido.jugadorBId)"
                  />
                  {{ partido.jugadorB }}
                </label>
              </fieldset>

              <label class="mt-2 block">
                <span class="text-sm font-medium">Marcador</span>
                <input
                  class="campo campo-chico mt-1"
                  name="marcador"
                  placeholder="6-4 3-6 7-5"
                  [value]="marcador()"
                  (input)="marcador.set($any($event.target).value)"
                />
              </label>

              <label class="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  [checked]="walkover()"
                  (change)="walkover.set($any($event.target).checked)"
                />
                <span>El rival no se presentó</span>
              </label>

              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="boton boton-primario boton-chico"
                  [disabled]="trabajando() || ganadorId() === null"
                  (click)="guardar()"
                >
                  Guardar resultado
                </button>
                <button
                  type="button"
                  class="boton boton-texto boton-chico"
                  (click)="cargando.set(null)"
                >
                  Cancelar
                </button>
              </div>
            </div>
          }

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

  /** El partido que se está cargando, con su formulario abierto. */
  protected readonly cargando = signal<PartidoDelCuadro | null>(null);
  protected readonly ganadorId = signal<number | null>(null);
  protected readonly marcador = signal('');
  protected readonly walkover = signal(false);

  /** Cuántos partidos se deshacen si se guarda este cambio. */
  protected readonly deshace = signal(0);

  /** Solo los que tienen sus dos jugadores: el resto todavía no se jugó. */
  protected sePuedeCargar(partido: PartidoDelCuadro): boolean {
    return partido.jugadorAId !== null && partido.jugadorBId !== null;
  }

  /**
   * Abre el formulario y **pregunta antes qué se va a deshacer**.
   *
   * Es el mismo paso previo del cierre de una cancha: lo que se confirma no es
   * "¿seguro?", es el número de partidos ya jugados que este cambio borra.
   */
  protected async abrir(partido: PartidoDelCuadro): Promise<void> {
    this.cargando.set(partido);
    this.ganadorId.set(partido.ganadorId);
    this.marcador.set(partido.marcador ?? '');
    this.walkover.set(partido.walkover);
    this.deshace.set(0);

    if (partido.ganadorId !== null) {
      const aviso = await this.api.consecuencias(this.torneoId(), partido.id);
      this.deshace.set(aviso.deshace);
    }
  }

  protected async guardar(): Promise<void> {
    const partido = this.cargando();
    const ganadorId = this.ganadorId();

    if (partido === null || ganadorId === null) return;

    await this.intentar(async () => {
      await this.api.cargarResultado(this.torneoId(), partido.id, {
        ganadorId,
        marcador: this.marcador(),
        walkover: this.walkover(),
      });
      this.cargando.set(null);
    });
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
