import { Component, computed, inject, resource, signal } from '@angular/core';

import { diaEnPalabras } from '../../catalogo-canchas/reloj-del-club';
import { nombreDeSuperficie } from '../../catalogo-canchas/superficies';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import {
  CuadroPublico,
  ESTADOS_TORNEO,
  EstadoTorneo,
  PartidoPublico,
  Torneos,
} from '../torneos.service';

/**
 * Los torneos del club, para quien mira desde afuera.
 *
 * **El calendario es de las pocas cosas que un tercero mira antes de asociarse**: un
 * club con torneos es un club con vida. Y el cuadro es el mismo mural del club en el
 * teléfono de quien está sentado en la cancha de al lado esperando su turno.
 *
 * De las personas sale el nombre y nada más. El teléfono de un jugador lo tiene el club
 * para llamarlo, no para publicarlo.
 */
@Component({
  selector: 'app-torneos-publicos',
  imports: [EstadoVacio, Insignia],
  template: `
    <h1 class="font-display text-4xl font-bold">Torneos</h1>
    <p class="mt-2 max-w-prose text-lg text-muted-foreground">
      Lo que se juega este año en el club: cuándo es cada torneo, cuántos cupos quedan
      y cómo va el cuadro.
    </p>

    @if (torneos.value(); as lista) {
      @if (lista.length === 0) {
        <app-estado-vacio
          class="mt-6 block"
          icono="emoji_events"
          titulo="Todavía no hay torneos este año"
          detalle="El calendario se publica acá en cuanto el club lo cierra."
        />
      } @else {
        <ul class="mt-6 grid gap-3">
          @for (torneo of lista; track torneo.id) {
            <li class="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 class="font-display text-xl font-semibold">{{ torneo.nombre }}</h2>
                <app-insignia variante="info" icono="emoji_events">
                  {{ torneo.categoria }}
                </app-insignia>
                <app-insignia
                  [variante]="torneo.estado === 'INSCRIPCION' ? 'exito' : 'neutro'"
                  icono="flag"
                >
                  {{ nombreEstado(torneo.estado) }}
                </app-insignia>
              </div>

              <p class="mt-1 text-sm text-muted-foreground">
                {{ enPalabras(torneo.fechaInicio) }} —
                {{ enPalabras(torneo.fechaFin) }}
                @if (torneo.superficie) {
                  · {{ superficie(torneo.superficie) }}
                }
              </p>

              @if (torneo.estado === 'INSCRIPCION') {
                <p class="mt-1 text-sm">
                  @if (torneo.cuposLibres > 0) {
                    Quedan
                    <strong>{{ torneo.cuposLibres }}</strong>
                    {{ torneo.cuposLibres === 1 ? 'cupo' : 'cupos' }} · inscripción
                    hasta el {{ enPalabras(torneo.cierreInscripcion) }}
                  } @else {
                    Sin cupos: quien se inscriba ahora queda en lista de espera.
                  }
                </p>
              }

              <button
                type="button"
                class="boton boton-secundario boton-chico mt-2"
                [attr.aria-expanded]="abierto() === torneo.id"
                (click)="alternar(torneo.id)"
              >
                {{ abierto() === torneo.id ? 'Ocultar' : 'Ver quiénes juegan' }}
              </button>

              <!-- Se comprueba de quién es el cuadro que se tiene en la mano: al
                   cambiar de torneo se conserva el anterior hasta que llega el nuevo,
                   y sin esto la tarjeta del segundo dibujaba el del primero con el
                   nombre equivocado encima. -->
              @if (detalleDe(torneo.id); as detalle) {
                @if (detalle.partidos.length === 0) {
                  <div class="mt-3 rounded-lg border border-border bg-background p-3">
                    <h3 class="text-sm font-semibold">Inscritos</h3>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {{ detalle.inscritos.join(', ') || 'Todavía nadie.' }}
                    </p>
                  </div>
                } @else {
                  <!-- En columnas que se desplazan de lado y no una tabla que se
                       encoge: en 375px una tabla de cuatro rondas queda ilegible, y
                       este cuadro se mira sobre todo desde el teléfono, en el club. -->
                  <div class="mt-3 flex gap-3 overflow-x-auto pb-2">
                    @for (ronda of porRonda(); track ronda.numero) {
                      <div class="min-w-48 shrink-0">
                        <h3 class="text-sm font-semibold text-muted-foreground">
                          {{ ronda.nombre }}
                        </h3>
                        <ul class="mt-2 grid gap-2">
                          @for (partido of ronda.partidos; track partido.posicion) {
                            <li
                              class="rounded-lg border border-border bg-background p-2
                                     text-sm"
                            >
                              <p [class.font-semibold]="ganoEl(partido, partido.jugadorA)">
                                {{ partido.jugadorA ?? vacio(partido) }}
                              </p>
                              <p [class.font-semibold]="ganoEl(partido, partido.jugadorB)">
                                {{ partido.jugadorB ?? vacio(partido) }}
                              </p>
                              @if (partido.marcador) {
                                <p class="text-xs text-muted-foreground">
                                  {{ partido.marcador }}
                                </p>
                              }
                              @if (partido.walkover) {
                                <p class="text-xs text-muted-foreground">
                                  No se presentó
                                </p>
                              }
                            </li>
                          }
                        </ul>
                      </div>
                    }
                  </div>
                }
              }
            </li>
          }
        </ul>
      }
    } @else if (torneos.isLoading()) {
      <p class="mt-6 text-muted-foreground">Cargando el calendario…</p>
    }
  `,
})
export class TorneosPublicos {
  private readonly api = inject(Torneos);

  protected readonly torneos = resource({ loader: () => this.api.calendario() });

  /** Qué torneo tiene su cuadro abierto. Uno a la vez: el año entero no cabe. */
  protected readonly abierto = signal<number | null>(null);

  protected readonly cuadro = resource({
    params: () => this.abierto(),
    loader: ({ params }) =>
      params === null
        ? Promise.resolve(undefined)
        : this.api.cuadroPublico(params),
  });

  protected readonly porRonda = computed(() => {
    const partidos = this.cuadro.value()?.partidos ?? [];
    const rondas = new Map<number, PartidoPublico[]>();

    for (const partido of partidos) {
      rondas.set(partido.ronda, [...(rondas.get(partido.ronda) ?? []), partido]);
    }

    return [...rondas].map(([numero, suyos]) => ({
      numero,
      nombre: suyos[0].ronda_nombre,
      partidos: suyos,
    }));
  });

  protected readonly enPalabras = diaEnPalabras;
  protected readonly superficie = nombreDeSuperficie;

  /** El cuadro abierto, **solo si es el de este torneo**. */
  protected detalleDe(torneoId: number): CuadroPublico | null {
    const detalle = this.cuadro.value();

    return this.abierto() === torneoId && detalle?.id === torneoId
      ? detalle
      : null;
  }

  protected alternar(id: number): void {
    this.abierto.update((actual) => (actual === id ? null : id));
  }

  protected nombreEstado(estado: EstadoTorneo): string {
    return ESTADOS_TORNEO[estado] ?? estado;
  }

  /** Un hueco de primera ronda es un bye; en las demás, todavía no se sabe. */
  protected vacio(partido: PartidoPublico): string {
    return partido.ronda === 1 ? 'Bye' : 'Por definir';
  }

  /**
   * Si ese jugador ganó el partido.
   *
   * Se compara por nombre y no por id: la respuesta pública no trae ids de jugadores,
   * y no los trae a propósito —lo que se publica es quién jugó, no la ficha de nadie—.
   */
  protected ganoEl(partido: PartidoPublico, jugador: string | null): boolean {
    return jugador !== null && partido.ganador === jugador;
  }
}
