import { Component, computed, inject, resource, signal } from '@angular/core';

import { diaConAnioEnPalabras, hoyEnElClub } from '../catalogo-canchas/reloj-del-club';
import { Auth } from '../core/auth/auth';
import { Aviso } from '../ui/aviso';
import { EstadoVacio } from '../ui/estado-vacio';
import { Insignia } from '../ui/insignia';
import { ESTADOS_PARTIDO, EstadoPartidoInterno, PartidoMio, Ranking } from './ranking.service';

/**
 * Los partidos amistosos del socio: los que cargó y los que tiene que contestar.
 *
 * **Un partido no puntúa hasta que el rival lo confirma**, y esta pantalla es donde
 * eso ocurre. El spec la describe llegando por correo; el proyecto todavía no manda
 * correos, así que el aviso vive acá, que es donde el socio ya entra a ver sus cosas.
 *
 * El botón de contestar sale **solo** en los partidos que esperan mi respuesta. Quien
 * lo cargó no puede confirmarlo: si pudiera, la confirmación no existiría.
 */
@Component({
  selector: 'app-mis-partidos',
  imports: [Aviso, EstadoVacio, Insignia],
  template: `
    <h1 class="font-display text-3xl font-bold">Mis partidos</h1>
    <p class="mt-2 max-w-prose text-muted-foreground">
      Los amistosos que juegas con otros socios. Cárgalos acá y, cuando el rival los confirme,
      entran al ranking interno.
    </p>

    <section class="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 class="font-display text-lg font-semibold">Cargar un partido</h2>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label class="grid gap-1 text-sm">
          <span class="font-medium">Contra quién jugaste</span>
          <select
            name="rival"
            class="campo"
            [value]="rival()"
            (change)="rival.set(valorDe($event))"
          >
            <option value="">Elige un socio…</option>
            @for (quien of rivales.value(); track quien.socioId) {
              <option [value]="quien.socioId">{{ quien.nombre }}</option>
            }
          </select>
        </label>

        <label class="grid gap-1 text-sm">
          <span class="font-medium">Quién ganó</span>
          <select
            name="ganador"
            class="campo"
            [value]="ganador()"
            (change)="ganador.set(valorDe($event) === 'rival' ? 'rival' : 'yo')"
          >
            <option value="yo">Gané yo</option>
            <option value="rival">Ganó el rival</option>
          </select>
        </label>

        <label class="grid gap-1 text-sm">
          <span class="font-medium">Cuándo</span>
          <input
            type="date"
            name="jugadoEn"
            class="campo"
            [max]="hoy"
            [value]="jugadoEn()"
            (change)="jugadoEn.set(valorDe($event))"
          />
        </label>

        <label class="grid gap-1 text-sm">
          <span class="font-medium">Marcador (opcional)</span>
          <input
            type="text"
            name="marcador"
            class="campo"
            placeholder="6-4 6-2"
            [value]="marcador()"
            (change)="marcador.set(valorDe($event))"
          />
        </label>
      </div>

      <!-- Dicho antes de que apriete, no después: quien carga un partido y no ve
           moverse su ranking tiene que saber que falta el otro. -->
      <p class="mt-3 text-sm text-muted-foreground">
        El partido no suma hasta que tu rival lo confirme.
      </p>

      @if (error(); as texto) {
        <app-aviso variante="error" class="mt-3 block">{{ texto }}</app-aviso>
      }

      <button
        type="button"
        class="boton boton-primario mt-3"
        [disabled]="rival() === '' || enviando()"
        (click)="cargar()"
      >
        Cargar el partido
      </button>
    </section>

    <h2 class="mt-8 font-display text-lg font-semibold">Tus partidos</h2>

    @if (partidos.value().length === 0) {
      <app-estado-vacio
        class="mt-3 block"
        icono="sports_tennis"
        titulo="Todavía no cargaste ninguno"
        detalle="Cuando juegues con otro socio, cárgalo acá y pídele que lo confirme."
      />
    } @else {
      <ul class="mt-3 grid gap-3">
        @for (partido of partidos.value(); track partido.id) {
          <li
            class="rounded-xl border border-border bg-card p-4 shadow-sm"
            [attr.data-partido]="partido.id"
          >
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <!-- "Perdiste con" y no "perdiste a": en español "perdiste a
                   Carolina" dice otra cosa, y bastante peor. -->
              <p class="font-semibold">
                @if (partido.ganeYo) {
                  Le ganaste a {{ partido.rival }}
                } @else {
                  Perdiste con {{ partido.rival }}
                }
              </p>
              <app-insignia [variante]="color(partido.estado)" icono="flag">
                {{ nombreEstado(partido.estado) }}
              </app-insignia>
            </div>

            <p class="mt-1 text-sm text-muted-foreground">
              {{ enPalabras(partido.jugadoEn) }}
              @if (partido.marcador) {
                · {{ partido.marcador }}
              }
            </p>

            @if (partido.estado === 'RECHAZADO') {
              <p class="mt-1 text-sm text-muted-foreground">
                Tu rival dijo que no fue así, y por eso no suma al ranking. Si crees que hay un
                error, habla con el club.
              </p>
            }

            @if (partido.resueltoPorAdmin) {
              <p class="mt-1 text-sm text-muted-foreground">Lo resolvió el club.</p>
            }

            @if (partido.esperaMiRespuesta) {
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="boton boton-primario boton-chico"
                  [disabled]="enviando()"
                  (click)="responder(partido.id, true)"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  class="boton boton-secundario boton-chico"
                  [disabled]="enviando()"
                  (click)="responder(partido.id, false)"
                >
                  No fue así
                </button>
              </div>
            } @else if (partido.estado === 'PENDIENTE') {
              <p class="mt-1 text-sm text-muted-foreground">
                Esperando que {{ partido.rival }} lo confirme.
              </p>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class MisPartidos {
  private readonly api = inject(Ranking);

  /**
   * Mi ficha de socio, para poder decir que gané yo.
   *
   * La lista de rivales viene **sin** uno mismo, así que el id propio solo está en la
   * sesión. `inject` acá arriba y no dentro del `computed`: adentro correría fuera del
   * contexto de inyección y reventaría al primer clic.
   */
  private readonly sesion = inject(Auth);
  private readonly miSocioId = computed(() => this.sesion.usuario()?.socioId ?? null);

  protected readonly partidos = resource({
    loader: () => this.api.misPartidos(),
    defaultValue: [] as PartidoMio[],
  });

  protected readonly rivales = resource({
    loader: () => this.api.rivales(),
    defaultValue: [],
  });

  protected readonly rival = signal('');
  protected readonly ganador = signal<'yo' | 'rival'>('yo');
  protected readonly jugadoEn = signal(hoyEnElClub());
  protected readonly marcador = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Hoy, para que el `<input type="date">` no ofrezca el futuro. */
  protected readonly hoy = hoyEnElClub();

  protected readonly enPalabras = diaConAnioEnPalabras;

  /** Cuántos me están esperando, por si algún día esto va en la barra. */
  protected readonly porContestar = computed(
    () => this.partidos.value().filter((uno) => uno.esperaMiRespuesta).length,
  );

  protected valorDe(evento: Event): string {
    return (evento.target as HTMLSelectElement | HTMLInputElement).value;
  }

  protected nombreEstado(estado: EstadoPartidoInterno): string {
    return ESTADOS_PARTIDO[estado] ?? estado;
  }

  protected color(estado: EstadoPartidoInterno): 'exito' | 'error' | 'neutro' {
    if (estado === 'CONFIRMADO') return 'exito';
    if (estado === 'RECHAZADO') return 'error';

    return 'neutro';
  }

  protected async cargar(): Promise<void> {
    const rivalSocioId = Number(this.rival());
    if (!rivalSocioId) return;

    this.enviando.set(true);
    this.error.set(null);

    try {
      await this.api.cargarPartido({
        rivalSocioId,
        // Mi id sale de la sesión, no de la lista de rivales —que viene sin uno
        // mismo—. El servidor lo vuelve a comprobar igual: acá se elige entre dos
        // opciones, pero el cuerpo lo puede escribir cualquiera.
        ganadorSocioId: this.ganador() === 'rival' ? rivalSocioId : (this.miSocioId() ?? 0),
        marcador: this.marcador().trim() || null,
        jugadoEn: this.jugadoEn(),
      });

      this.rival.set('');
      this.marcador.set('');
      this.partidos.reload();
    } catch {
      this.error.set('No se pudo cargar el partido. Reintenta en un momento.');
    } finally {
      this.enviando.set(false);
    }
  }

  protected async responder(id: number, acepto: boolean): Promise<void> {
    this.enviando.set(true);
    this.error.set(null);

    try {
      await this.api.responderPartido(id, acepto);
      // Recargar y no editar la lista en memoria: el estado lo decide el servidor,
      // y una tarjeta que se pinta sola queda mintiendo si la petición no era la
      // que ganó la carrera.
      this.partidos.reload();
    } catch {
      this.error.set('No se pudo contestar el partido. Reintenta en un momento.');
    } finally {
      this.enviando.set(false);
    }
  }
}
