import { Component, computed, inject, resource, signal } from '@angular/core';
import { MatRadioModule } from '@angular/material/radio';
import { MatButton } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';

import { proveerCampos } from '../ui/campos';
import { fechaATexto, proveerFechaYHora, textoAFecha } from '../ui/fecha-y-hora';
import { diaConAnioEnPalabras, hoyEnElClub } from '../catalogo-canchas/reloj-del-club';
import { Auth } from '../core/auth/auth';
import { Aviso } from '../ui/aviso';
import { EstadoVacio } from '../ui/estado-vacio';
import { ESTADOS_PARTIDO, EstadoPartidoInterno, PartidoMio, Ranking } from './ranking.service';
import { Esqueleto } from '../ui/esqueleto';

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
  imports: [
    MatRadioModule,
    MatSelectModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    Aviso,
    EstadoVacio,
    Esqueleto,
    MatChipsModule,
    MatIcon,
  ],
  providers: [proveerCampos(), proveerFechaYHora()],
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Mis partidos</h1>
    <p class="mt-2 max-w-prose text-muted-foreground">
      Los amistosos que juegas con otros socios. Cárgalos acá y, cuando el rival los confirme,
      entran al ranking interno.
    </p>

    <section class="mt-6 bg-card p-5 shadow-md">
      <h2 class="font-display text-lg font-bold tracking-wide uppercase">Cargar un partido</h2>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <mat-form-field>
          <mat-label>Contra quién jugaste</mat-label>
          <mat-select
            name="rival"
            [value]="rival()"
            (selectionChange)="rival.set($event.value)"
          >
            <mat-option value="">Elige un socio…</mat-option>
            <!-- Con el número al lado: dos socios que se llaman igual no es un caso
                 raro en un club, y elegir al equivocado le crea un partido a un
                 tercero que después tiene que rechazarlo. -->
            @if (rivales.hasValue()) {
              @for (quien of rivales.value(); track quien.socioId) {
                <mat-option [value]="quien.socioId">{{ quien.nombre }} · {{ quien.numeroSocio }}</mat-option>
              }
            }
          </mat-select>
        </mat-form-field>

        <!-- Dos opciones opuestas, a la vista: botones de opción y no una lista (T250,
             corrección 5 de la auditoría). -->
        <div>
          <span id="quien-gano" class="text-sm font-medium">Quién ganó</span>
          <mat-radio-group
            class="mt-1 flex flex-wrap gap-x-4"
            name="ganador"
            aria-labelledby="quien-gano"
            [value]="ganador()"
            (change)="ganador.set($event.value === 'rival' ? 'rival' : 'yo')"
          >
            <mat-radio-button value="yo">Gané yo</mat-radio-button>
            <mat-radio-button value="rival">Ganó el rival</mat-radio-button>
          </mat-radio-group>
        </div>

        <mat-form-field class="w-48">
          <mat-label>Cuándo</mat-label>
          <input
            matInput
            id="jugado-en"
            name="jugadoEn"
            placeholder="dd-mm-aaaa"
            autocomplete="off"
            [matDatepicker]="calendarioJugadoEn"
            [max]="hoy"
            [value]="jugadoEn()"
            (dateChange)="jugadoEn.set($event.value)"
          />
          <mat-datepicker-toggle matIconSuffix [for]="calendarioJugadoEn" />
          <mat-datepicker #calendarioJugadoEn />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Marcador (opcional)</mat-label>
          <input
            matInput
            type="text"
            name="marcador"
            placeholder="6-4 6-2"
            [value]="marcador()"
            (change)="marcador.set(valorDe($event))"
          />
        </mat-form-field>
      </div>

      <!-- Dicho antes de que apriete, no después: quien carga un partido y no ve
           moverse su ranking tiene que saber que falta el otro. -->
      <p class="mt-3 text-sm text-muted-foreground">
        El partido no suma hasta que tu rival lo confirme.
      </p>

      @if (error(); as texto) {
        <app-aviso variante="error" class="mt-3 block">{{ texto }}</app-aviso>
      }

      <!-- El del formulario va en su section; el de cada partido, en la tarjeta de ese partido.
           mat-guidelines-ignore: multiples-filled -->
      <button
        matButton="filled"
        type="button"
        class="mt-3"
        [disabled]="rival() === '' || enviando()"
        [attr.aria-busy]="enviando()"
        (click)="cargar()"
      >
        Cargar el partido
      </button>
    </section>

    <h2 class="titular mt-10 text-4xl">Tus partidos</h2>

    @if (partidos.error()) {
      <p class="mt-3 text-destructive">
        No se pudieron cargar tus partidos. Reintenta en un momento.
      </p>
    } @else if (partidos.status() === 'loading') {
      <!-- Antes del vacío: el recurso arranca con la lista vacía, y mientras viajaba
           la consulta la pantalla decía que no había partidos (T152). -->
      <app-esqueleto class="mt-3 block" [filas]="3" etiqueta="Cargando tus partidos…" />
    } @else if (partidos.value().length === 0) {
      <app-estado-vacio
        class="mt-3 block"
        icono="sports_tennis"
        titulo="Todavía no cargaste ninguno"
        detalle="Cuando juegues con otro socio, cárgalo acá y pídele que lo confirme."
      />
    } @else {
      <ul class="mt-3 grid gap-3">
        @for (partido of partidos.value(); track partido.id) {
          <!-- Cada partido como un marcador de resultado (TV5.4): el resultado en
               la condensada y el marcador grande a la derecha, en azul si ganaste. -->
          <li class="bg-card p-4 shadow-md" [attr.data-partido]="partido.id">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <!-- "Perdiste con" y no "perdiste a": en español "perdiste a
                   Carolina" dice otra cosa, y bastante peor. -->
              <p class="font-display text-lg font-bold tracking-wide uppercase">
                @if (partido.ganeYo) {
                  Le ganaste a {{ partido.rival }}
                } @else {
                  Perdiste con {{ partido.rival }}
                }
              </p>
              <mat-chip-set class="insignias">
                <mat-chip class="insignia" [class]="color(partido.estado)">
                  <mat-icon matChipAvatar aria-hidden="true">flag</mat-icon>
                  {{ nombreEstado(partido.estado) }}
                </mat-chip>
              </mat-chip-set>
              @if (partido.marcador) {
                <p
                  class="ms-auto font-display text-3xl font-bold tabular-nums"
                  [class.text-primary]="partido.ganeYo"
                  [class.text-muted-foreground]="!partido.ganeYo"
                >
                  {{ partido.marcador }}
                </p>
              }
            </div>

            <p class="mt-1 text-sm text-muted-foreground">{{ enPalabras(partido.jugadoEn) }}</p>

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
                <!-- Gira solo el que se tocó: los dos comparten enviando(). -->
                <button
                  matButton="filled"
                  type="button"
                  class="chico"
                  [disabled]="enviando()"
                  [attr.aria-busy]="esLaRespuesta(partido.id, true)"
                  (click)="responder(partido.id, true)"
                >
                  Confirmar
                </button>
                <button
                  matButton="outlined"
                  type="button"
                  class="chico"
                  [disabled]="enviando()"
                  [attr.aria-busy]="esLaRespuesta(partido.id, false)"
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
  /** Como lo entrega el calendario de Material, y a texto al cargar el partido (A5, T244). */
  protected readonly jugadoEn = signal(textoAFecha(hoyEnElClub()));
  protected readonly marcador = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Hoy, para que el calendario no ofrezca el futuro. */
  /** El último día que se puede elegir: un partido no se carga antes de jugarse. */
  protected readonly hoy = textoAFecha(hoyEnElClub());

  protected readonly enPalabras = diaConAnioEnPalabras;

  protected valorDe(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
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
        jugadoEn: fechaATexto(this.jugadoEn()),
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

  /** La respuesta que está viajando, para que gire su botón y no el de al lado (T150). */
  private readonly respondiendo = signal<{ id: number; acepto: boolean } | null>(null);

  protected esLaRespuesta(id: number, acepto: boolean): boolean {
    const enCurso = this.respondiendo();

    return enCurso?.id === id && enCurso.acepto === acepto;
  }

  protected async responder(id: number, acepto: boolean): Promise<void> {
    this.respondiendo.set({ id, acepto });
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
      this.respondiendo.set(null);
    }
  }
}
