import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatSelectModule } from '@angular/material/select';

import { proveerCampos } from '../../ui/campos';
import { fechaATexto, horaATexto, proveerFechaYHora, textoAHora } from '../../ui/fecha-y-hora';
import {
  diaEnPalabras,
  fechaEnElClub,
  horaEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import {
  AdminCanchas,
  CanchaAdmin,
} from '../../catalogo-canchas/admin/admin-canchas.service';
import { Aviso } from '../../ui/aviso';
import { Insignia } from '../../ui/insignia';
import { Foto, PartidoDelCuadro, Torneos } from '../torneos.service';
import { FotoDelPartido } from './foto-del-partido';

/**
 * El cuadro del torneo.
 *
 * **Es lo que la gente mira en el mural del club**, así que se dibuja entero desde el
 * primer día: todas las rondas, con los lugares vacíos donde todavía no se sabe quién
 * llega. Una mitad en blanco no dice nada; una mitad dibujada dice a quién te toca si
 * ganás.
 */
/** El horario de un partido sin programar: el día por elegir, y de 10 a 12. */
const horarioEnBlanco = () => ({
  canchaId: 0,
  fecha: null as Date | null,
  horaDesde: textoAHora('10:00'),
  horaHasta: textoAHora('12:00'),
});

@Component({
  selector: 'app-cuadro-torneo',
  imports: [
    MatSelectModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInput,
    MatTimepickerModule,
    MatButton,
    MatIcon,
    FormsModule,
    Aviso,
    Insignia,
    FotoDelPartido,
  ],
  providers: [proveerCampos(), proveerFechaYHora()],
  template: `
    @if (cuadro.error()) {
      <p class="mt-3 text-sm text-destructive">
        No se pudo cargar el cuadro. Reintenta en un momento.
      </p>
    } @else if (cuadro.value(); as datos) {
      <div class="mt-3 rounded-xl border border-border bg-background p-4">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="rotulo-seccion">Cuadro</h2>
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
          <!-- Programar y cargar el resultado van cada uno en su diálogo, su propia sección.
               mat-guidelines-ignore: multiples-filled -->
          <button
            matButton="filled"
            type="button"
            class="chico mt-2"
            [disabled]="trabajando()"
            [attr.aria-busy]="enCurso() === 'armar'"
            (click)="armar()"
          >
            Armar el cuadro
          </button>
        } @else {
          <div class="mt-3 flex gap-4 overflow-x-auto pb-2">
            @for (ronda of porRonda(); track ronda.numero) {
              <div class="min-w-56 flex-1">
                <h3 class="subtitulo text-muted-foreground">
                  {{ ronda.nombre }}
                </h3>
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
                        <!-- El resultado en la condensada y con cifras de ancho
                             fijo, como en un marcador: es lo que se busca. -->
                        <p class="font-display font-bold tabular-nums">
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
                          matButton
                          type="button"
                          class="chico mt-1"
                          [disabled]="trabajando()"
                          (click)="abrir(partido)"
                        >
                          {{ partido.ganadorId ? 'Corregir' : 'Cargar resultado' }}
                        </button>
                      }

                      @if (sePuedeCargar(partido)) {
                        <app-foto-del-partido
                          [torneoId]="torneoId()"
                          [partidoId]="partido.id"
                          [fotos]="fotosDe(partido.id)"
                          (subida)="recargarFotos()"
                        />
                      }

                      <!-- **Cuándo y dónde se juega** (T67). Programar cierra la
                           cancha: desaparece de la disponibilidad sola. -->
                      @if (partido.programadoInicio) {
                        <p class="mt-1 text-xs text-muted-foreground">
                          <mat-icon class="align-middle text-sm" aria-hidden="true">
                            event
                          </mat-icon>
                          {{ cuando(partido) }} · {{ partido.cancha }}
                          <button
                            matButton
                            type="button"
                            class="chico"
                            [disabled]="trabajando()"
                            [attr.aria-busy]="enCurso() === 'desprogramar-' + partido.id"
                            (click)="desprogramar(partido)"
                          >
                            Quitar la hora
                          </button>
                        </p>
                      } @else if (sePuedeCargar(partido)) {
                        <button
                          matButton
                          type="button"
                          class="chico mt-1"
                          [disabled]="trabajando()"
                          (click)="abrirHorario(partido)"
                        >
                          Programar
                        </button>
                      }
                    </li>
                  }
                </ul>
              </div>
            }
          </div>



          <button
            matButton
            type="button"
            class="chico mt-2"
            [disabled]="trabajando()"
            [attr.aria-busy]="enCurso() === 'deshacer'"
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

    <!-- **Programar va en un modal.** Es una tarea con foco —cancha, día y dos
         horas, que el servidor puede rechazar por la restricción de un jugador— y
         debajo del cuadro había que buscar el formulario con la vista después de
         cada clic. Se abre con showModal, como la ficha del socio: es lo único
         que vuelve inerte el resto y atrapa el foco. -->
    <dialog
      #programacion
      closedby="any"
      class="m-auto w-[min(40rem,92vw)] rounded-2xl bg-card p-6 shadow-xl
             backdrop:bg-foreground/50"
      aria-labelledby="titulo-programar"
      (close)="programando.set(null)"
    >
      @if (programando(); as partido) {
        <h2 id="titulo-programar" class="titular text-2xl">
          Programar el partido
        </h2>
        <p class="mt-1 max-w-prose text-sm text-muted-foreground">
          Cerrar la cancha a esa hora es parte de programar: deja de ofrecerse en
          la grilla. El servidor rechaza el horario si alguno de los dos jugadores
          dijo que no puede, y <strong>dice quién y cuándo</strong>.
        </p>

        <!-- Dos columnas y no cuatro: con el botón del calendario, una fecha entera no
             cabía en un cuarto del modal (T126). -->
        <form class="mt-3 grid gap-3 sm:grid-cols-2" (ngSubmit)="programar()">
          <mat-form-field>
            <mat-label>Cancha</mat-label>
            <mat-select
              name="cancha"
              [(ngModel)]="horario.canchaId"
            >
              <mat-option [value]="0" disabled>Elige una</mat-option>
        <!-- **Solo las activas.** El servidor responde 404 sobre una
                   cancha fuera de la grilla, y descubrirlo después de elegir
                   día y hora es un formulario perdido. -->
              @for (cancha of activas(); track cancha.id) {
                <mat-option [value]="cancha.id">{{ cancha.nombre }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field>
            <mat-label>Día</mat-label>
            <input
              matInput
              id="programar-fecha"
              name="fecha"
              placeholder="dd-mm-aaaa"
              autocomplete="off"
              [matDatepicker]="calendarioFecha"
              [(ngModel)]="horario.fecha"
            />
            <mat-datepicker-toggle matIconSuffix [for]="calendarioFecha" />
            <mat-datepicker #calendarioFecha />
          </mat-form-field>

          <mat-form-field>
            <mat-label>Desde</mat-label>
            <input
              matInput
              id="programar-desde"
              name="desde"
              placeholder="hh:mm"
              autocomplete="off"
              [matTimepicker]="relojDesde"
              [(ngModel)]="horario.horaDesde"
            />
            <mat-timepicker-toggle matIconSuffix aria-label="Elegir la hora" [for]="relojDesde" />
            <mat-timepicker #relojDesde />
          </mat-form-field>

          <mat-form-field>
            <mat-label>Hasta</mat-label>
            <input
              matInput
              id="programar-hasta"
              name="hasta"
              placeholder="hh:mm"
              autocomplete="off"
              [matTimepicker]="relojHasta"
              [(ngModel)]="horario.horaHasta"
            />
            <mat-timepicker-toggle matIconSuffix aria-label="Elegir la hora" [for]="relojHasta" />
            <mat-timepicker #relojHasta />
          </mat-form-field>

          <div class="flex gap-2 sm:col-span-2">
            <button
              matButton="filled"
              type="submit"
              class="chico"
              [disabled]="trabajando()"
              [attr.aria-busy]="enCurso() === 'programar'"
            >
              Programar
            </button>
            <button
              matButton="outlined"
              type="button"
              class="chico"
              (click)="programacion.close()"
            >
              Cancelar
            </button>
          </div>
        </form>
      }
    </dialog>
    <!-- El resultado también en modal: era un div con role de alertdialog dibujado en
         línea —un modal de mentira— vecino de los dos que sí lo son. -->
    <dialog
      #resultado
      closedby="any"
      class="m-auto w-[min(32rem,92vw)] rounded-2xl bg-card p-6 text-sm shadow-xl
             backdrop:bg-foreground/50"
      aria-labelledby="titulo-resultado"
      (close)="cargando.set(null)"
    >
      @if (cargando(); as partido) {
        <h2 id="titulo-resultado" class="titular text-2xl">
          {{ partido.jugadorA }} contra {{ partido.jugadorB }}
        </h2>

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

        <mat-form-field class="chico">
          <mat-label>Marcador</mat-label>
          <input
            matInput
            name="marcador"
            placeholder="6-4 3-6 7-5"
            [value]="marcador()"
            (input)="marcador.set($any($event.target).value)"
          />
        </mat-form-field>

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
            matButton="filled"
            type="button"
            class="chico"
            [disabled]="trabajando() || ganadorId() === null"
            [attr.aria-busy]="enCurso() === 'guardar'"
            (click)="guardar()"
          >
            Guardar resultado
          </button>
          <button
            matButton
            type="button"
            class="chico"
            (click)="resultado.close()"
          >
            Cancelar
          </button>
        </div>
      }
    </dialog>
  `,
})
export class CuadroDelTorneo {
  private readonly api = inject(Torneos);
  private readonly canchasApi = inject(AdminCanchas);

  private readonly programacion =
    viewChild.required<ElementRef<HTMLDialogElement>>('programacion');

  private readonly resultado =
    viewChild.required<ElementRef<HTMLDialogElement>>('resultado');

  constructor() {
    // Abrir y cerrar siguen a la señal, y no al revés: así la tecla Esc, el clic en el
    // fondo y el botón de cancelar terminan todos en el mismo estado.
    effect(() =>
      this.seguirALaSenal(this.programacion(), this.programando() !== null),
    );
    effect(() => this.seguirALaSenal(this.resultado(), this.cargando() !== null));
  }

  /** El vaivén del `<dialog>`, en un solo sitio para los dos. */
  private seguirALaSenal(
    dialogo: ElementRef<HTMLDialogElement>,
    abierto: boolean,
  ): void {
    const elemento = dialogo.nativeElement;

    if (abierto && !elemento.open) elemento.showModal();
    if (!abierto && elemento.open) elemento.close();
  }

  /**
   * El id del **cuadro**, no el del torneo (T62).
   *
   * Un torneo corre 4ª, 3ª y Honor a la vez y cada uno se arma por su cuenta, así que
   * este componente dibuja uno. El id del torneo lo necesita para cargar resultados y
   * sale de la respuesta del cuadro: pedirlo también como entrada serían dos datos que
   * pueden dejar de coincidir.
   */
  readonly cuadroId = input.required<number>();

  /** Qué partido tiene abierto su formulario de horario (T67). */
  protected readonly programando = signal<PartidoDelCuadro | null>(null);
  /** La fecha y las horas, como las entrega Material; a texto al programar (A5, T244). */
  protected horario = horarioEnBlanco();

  protected readonly canchas = resource({
    loader: () => this.canchasApi.canchas(),
    defaultValue: [] as CanchaAdmin[],
  });

  private readonly versionDeFotos = signal(0);

  /**
   * Las fotos del torneo entero, **en una sola consulta**.
   *
   * Y no una por partido: un cuadro de dieciséis pediría dieciséis veces lo mismo para
   * dibujarse. Cada partido filtra las suyas de acá.
   */
  protected readonly fotos = resource({
    params: () => ({ id: this.torneoId(), version: this.versionDeFotos() }),
    loader: ({ params }) =>
      params.id === 0 ? Promise.resolve([]) : this.api.fotos(params.id),
    defaultValue: [] as Foto[],
  });

  protected fotosDe(partidoId: number): Foto[] {
    // Sin las fotos, el cuadro se dibuja igual: `value()` lanzaría si fallaron.
    if (!this.fotos.hasValue()) return [];

    return this.fotos.value().filter((foto) => foto.partidoId === partidoId);
  }

  protected recargarFotos(): void {
    this.versionDeFotos.update((veces) => veces + 1);
  }

  protected activas() {
    if (!this.canchas.hasValue()) return [];

    return this.canchas.value().filter((cancha) => cancha.activa);
  }

  /**
   * "sábado, 7 de noviembre a las 19:00", **en hora del club**.
   *
   * Con los formateadores de `reloj-del-club` y no con `toLocaleString` pelado: ése
   * usa la zona del navegador, y un partido de las 19:00 se leía a las 17:00 desde
   * fuera de Chile. Es la misma regla que ya cuida la grilla.
   */
  protected cuando(partido: PartidoDelCuadro): string {
    if (!partido.programadoInicio) return '';

    const dia = diaEnPalabras(fechaEnElClub(partido.programadoInicio));

    return `${dia} a las ${horaEnElClub(partido.programadoInicio)}`;
  }

  protected abrirHorario(partido: PartidoDelCuadro): void {
    this.programando.set(partido);
    this.horario = horarioEnBlanco();
  }

  protected async programar(): Promise<void> {
    const partido = this.programando();

    if (partido === null) return;

    if (!Number(this.horario.canchaId) || !this.horario.fecha) {
      this.error.set('Falta la cancha o el día.');
      return;
    }

    await this.intentar('programar', async () => {
      await this.api.programarPartido(this.torneoId(), partido.id, {
        canchaId: Number(this.horario.canchaId),
        fecha: fechaATexto(this.horario.fecha),
        horaDesde: horaATexto(this.horario.horaDesde),
        horaHasta: horaATexto(this.horario.horaHasta),
      });
      this.programando.set(null);
    });
  }

  protected async desprogramar(partido: PartidoDelCuadro): Promise<void> {
    await this.intentar(`desprogramar-${partido.id}`, () =>
      this.api.desprogramarPartido(this.torneoId(), partido.id),
    );
  }

  protected readonly trabajando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly cuadro = resource({
    params: () => ({ id: this.cuadroId(), version: this.version() }),
    loader: ({ params }) => this.api.cuadro(params.id),
  });

  /** De la respuesta y no de una entrada aparte: ver el comentario de `cuadroId`. */
  protected readonly torneoId = computed(() => this.cuadro.value()?.torneoId ?? 0);

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

    await this.intentar('guardar', async () => {
      await this.api.cargarResultado(this.torneoId(), partido.id, {
        ganadorId,
        marcador: this.marcador(),
        walkover: this.walkover(),
      });
      this.cargando.set(null);
    });
  }

  protected async armar(): Promise<void> {
    await this.intentar('armar', () => this.api.armarCuadro(this.cuadroId()));
  }

  protected async deshacer(): Promise<void> {
    await this.intentar('deshacer', () => this.api.deshacerCuadro(this.cuadroId()));
  }

  private async intentar(
    clave: string,
    accion: () => Promise<unknown>,
  ): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: dice si faltan jugadores o si el cuadro ya tiene resultados.
      this.error.set(mensajeDelServidor(falla, 'No se pudo armar el cuadro.'));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
    }
  }
}
