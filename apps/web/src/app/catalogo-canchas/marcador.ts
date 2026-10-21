import { Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';

import { BloqueDisponible, Cancha, GrillaDeCancha } from './disponibilidad';
import { moverConFlechas } from './flechas-del-tablero';
import { ICONOS_DE_MOTIVO, nombreDelMotivo } from './motivos';
import { enPesos, fechaEnElClub, horaEnElClub } from './reloj-del-club';

type Celda =
  | { estado: 'libre'; bloque: BloqueDisponible }
  // La fila que el tablero suma para la elección al final del día (T344): ahí no empieza
  // ninguna hora, pero el club sigue abierto, así que no es «Cerrada».
  | { estado: 'sin-inicio' }
  | { estado: 'sin-venta'; motivo: string }
  | { estado: 'ocupada' }
  | { estado: 'bloqueada'; motivo: string; icono: string; clase: boolean }
  | { estado: 'cerrada' };

/** Una cancha libre del tablero, la que se elige en disponibilidad (T264). */
export interface CeldaElegible {
  cancha: Cancha;
  bloque: BloqueDisponible;
}

/** Por qué no se le vende a quien mira una cancha libre, o nulo si se le vende. */
export type MotivoSinVenta = (bloque: BloqueDisponible) => string | null;

function celdaDe(bloque: BloqueDisponible | undefined, sinVenta: MotivoSinVenta): Celda {
  if (!bloque) return { estado: 'cerrada' };
  if (bloque.bloqueado) {
    return {
      estado: 'bloqueada',
      motivo: nombreDelMotivo(bloque.motivoBloqueo),
      icono: (bloque.motivoBloqueo && ICONOS_DE_MOTIVO[bloque.motivoBloqueo]) ?? 'block',
      clase: bloque.motivoBloqueo === 'CLASE',
    };
  }
  if (bloque.reservado) return { estado: 'ocupada' };

  const motivo = sinVenta(bloque);
  return motivo ? { estado: 'sin-venta', motivo } : { estado: 'libre', bloque };
}

/**
 * Cada cuánto empieza una hora en la grilla: el `PASO_DE_LA_GRILLA_MIN` de la API. Una hora
 * elegida ocupa dos filas y la hora y media, tres (T344).
 */
const PASO_DE_LA_GRILLA_MS = 30 * 60 * 1000;

/** La celda de una cancha a una hora, como texto: la parada del teclado se guarda así. */
const claveDe = (canchaId: number, inicio: string) =>
  `${canchaId}|${new Date(inicio).getTime()}`;

/**
 * El marcador de la portada: las horas que quedan hoy contra las canchas (TV3.3).
 *
 * **Es una tabla de verdad**, con la cancha y la hora como encabezados: el lector
 * de pantalla dice "Cancha 3, 19:00, Libre" al pasar por una celda, que es lo que
 * el tablero dice de un vistazo. Ninguna celda depende del color: la libre dice
 * "Libre", la bloqueada lleva el ícono de su motivo, la cerrada una raya, y todas
 * dicen su estado en palabras al lector.
 *
 * **La celda libre lleva a `/disponibilidad` con su día, su cancha y su hora** (T266),
 * y la disponibilidad la marca al llegar. Va con `tabindex="-1"`: con ocho canchas y
 * seis horas serían cuarenta y ocho paradas de teclado hacia la misma página, que ya
 * tiene su camino en "Ver todos los horarios" y en el zócalo. El lector de pantalla
 * igual la activa.
 *
 * **En disponibilidad, la celda libre se elige ahí mismo** (`modo="elegir"`, T264): es
 * un botón que avisa la cancha y el bloque, y la grilla le dice cuál quedó elegida, el
 * nombre de cada celda —sabe del precio y de mover— y por qué una libre no se le vende
 * a quien mira. El tablero entero es una sola parada de teclado y las flechas recorren
 * las libres: con ocho canchas, una parada por celda serían doscientas.
 *
 * **Con más canchas de las que caben, se desplaza el tablero y no la página**, y
 * la columna de la hora queda fija para no perder la fila.
 */
@Component({
  selector: 'app-marcador',
  imports: [MatIcon, RouterLink],
  host: { class: 'block' },
  template: `
    <!-- En disponibilidad, desde sm el tablero cabe y deja de desplazarse de lado: con
         overflow, los nombres de las canchas no se podrían pegar bajo la cabecera. -->
    <div class="overflow-x-auto" [class]="modo() === 'elegir' ? 'sm:overflow-visible' : ''">
      <table
        class="w-full table-fixed border-separate border-spacing-1"
        [style.min-width.rem]="anchoMinimo()"
      >
        <caption class="sr-only">
          @if (modo() === 'elegir') {
            Las horas del día, cancha por cancha. Las flechas recorren las horas libres.
          } @else {
            <!-- Sin "hoy": desde T268 la portada muestra mañana si hoy ya no queda nada, y su
                 título lo dice. -->
            Las horas que quedan, cancha por cancha
          }
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              [class]="pegado()"
              class="sticky left-0 z-10 w-16 bg-campo pb-1 text-start font-display text-xs
                     font-semibold tracking-wider text-on-campo/75 uppercase sm:w-24"
            >
              Hora
            </th>
            @for (cancha of canchas(); track cancha.id) {
              <!-- Arriba y no al medio: el ícono de techada suma alto, y centradas,
                   las sin techo quedaban más abajo que las techadas. -->
              <th
                scope="col"
                [class]="pegado()"
                class="bg-campo pb-1 align-top font-display text-xs font-semibold tracking-wider
                       text-on-campo/75 uppercase sm:text-sm"
              >
                <span class="flex flex-col items-center gap-0.5">
                  {{ cancha.nombre }}
                  @if (cancha.techada) {
                    <mat-icon class="text-sm" aria-hidden="true">roofing</mat-icon>
                    <span class="sr-only">, techada</span>
                  }
                </span>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (fila of filas(); track fila.instante; let i = $index) {
            <tr>
              <th scope="row" class="sticky left-0 z-10 bg-campo text-start">
                <span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span class="font-display text-xl font-bold tabular-nums sm:text-2xl">
                    {{ fila.hora }}
                  </span>
                  @if (fila.prime) {
                    <span
                      class="bg-warning-soft px-1 font-display text-xs font-bold
                             tracking-wider text-warning-strong uppercase"
                    >
                      Prime
                    </span>
                  }
                </span>
              </th>
              @for (celda of fila.celdas; track celda.cancha.id; let j = $index) {
                <td class="h-11 p-0">
                  <!-- Las filas que siguen a la de inicio, dentro de la hora elegida (T344, B2):
                       la misma placa, sin botón. Tocar otra libre cambia la elección. -->
                  @if (celda.sigue) {
                    <!-- Con su marca, no solo con el color (la placa sobre el campo da 2,2:1): la
                         del medio lleva la línea que sigue, y la última dice hasta cuándo. -->
                    <span
                      data-en-la-eleccion
                      class="flex h-full items-center justify-center border border-rotulo bg-rotulo
                             font-display text-xs font-bold text-on-rotulo tabular-nums"
                    >
                      @if (celda.ultima) {
                        <span aria-hidden="true">–{{ finDeLaElegida() }}</span>
                      } @else {
                        <mat-icon class="text-base" aria-hidden="true">more_vert</mat-icon>
                      }
                      <span class="sr-only">Parte de tu elección</span>
                    </span>
                  } @else {
                    @switch (celda.estado) {
                      @case ('libre') {
                        @if (modo() === 'elegir') {
                          <!-- La elegida dice "Libre" igual, que es su nombre (WCAG 2.5.3): lo
                               que cambia es la placa, la marca y aria-pressed. La marca va arriba
                               del texto: al lado, en los 48 px de la celda del teléfono no cabía. -->
                          @let marcada = esLaElegida(celda);
                          <button
                            type="button"
                            class="flex h-full w-full cursor-pointer items-center justify-center
                                   gap-0.5 border font-display text-sm font-bold tracking-wider
                                   uppercase transition-transform active:scale-95"
                            [class]="
                              marcada
                                ? 'flex-col leading-none border-rotulo bg-rotulo text-on-rotulo'
                                : 'border-borde-celda-libre bg-celda-libre text-on-celda-libre hover:border-on-celda-libre'
                            "
                            [attr.data-fila]="i"
                            [attr.data-columna]="j"
                            [attr.tabindex]="esLaParada(celda) ? 0 : -1"
                            [attr.aria-label]="etiqueta()(celda.cancha, celda.bloque)"
                            [attr.aria-pressed]="marcada"
                            [attr.data-en-la-eleccion]="marcada ? '' : null"
                            (focus)="foco.set(clave(celda))"
                            (keydown)="mover($event)"
                            (click)="elegir.emit({ cancha: celda.cancha, bloque: celda.bloque })"
                          >
                            @if (marcada) {
                              <mat-icon class="text-sm" aria-hidden="true">check_circle</mat-icon>
                            }
                            Libre
                          </button>
                        } @else {
                          <!-- aria-label y no un sr-only: Chrome separa el sr-only con un
                               espacio y el nombre quedaba "Libre : reservar". Empieza con
                               lo que se ve, como pide WCAG 2.5.3. -->
                          <a
                            routerLink="/disponibilidad"
                            [queryParams]="{ fecha: fila.fecha, cancha: celda.cancha.id, inicio: fila.hora }"
                            tabindex="-1"
                            [attr.aria-label]="
                              'Libre: reservar la ' + celda.cancha.nombre + ' a las ' + fila.hora
                            "
                            class="flex h-full items-center justify-center border
                                   border-borde-celda-libre bg-celda-libre font-display text-sm
                                   font-bold tracking-wider text-on-celda-libre uppercase
                                   transition-transform active:scale-95"
                          >
                            Libre
                          </a>
                        }
                      }
                      @case ('sin-venta') {
                        <!-- Libre, pero no para quien mira (T83b, T213): punteada y con su
                             ícono, para no leerse como cerrada ni como ocupada. -->
                        <span
                          class="flex h-full items-center justify-center border border-dotted
                                 border-on-campo/40 text-on-campo/70"
                        >
                          <mat-icon class="text-base" aria-hidden="true">hourglass_disabled</mat-icon>
                          <span class="sr-only">{{ celda.motivo }}</span>
                        </span>
                      }
                      @case ('ocupada') {
                        <span class="flex h-full bg-on-campo/10">
                          <span class="sr-only">Ocupada</span>
                        </span>
                      }
                      @case ('bloqueada') {
                        <!-- En disponibilidad, la clase lleva a las clases (T97): a quien
                             llega nuevo le dice que a esa hora hay una que le puede servir. -->
                        @if (modo() === 'elegir' && celda.clase) {
                          <a
                            routerLink="/clases"
                            class="rayas flex h-full items-center justify-center text-on-campo/70
                                   hover:text-on-campo"
                          >
                            <mat-icon class="text-base" aria-hidden="true">{{ celda.icono }}</mat-icon>
                            <span class="sr-only">{{ celda.motivo }}: ver las clases</span>
                          </a>
                        } @else {
                          <span class="rayas flex h-full items-center justify-center text-on-campo/70">
                            <mat-icon class="text-base" aria-hidden="true">{{ celda.icono }}</mat-icon>
                            <span class="sr-only">{{ celda.motivo }}</span>
                          </span>
                        }
                      }
                      @case ('sin-inicio') {
                        <span class="flex h-full">
                          <span class="sr-only">Sin inicio a esta hora</span>
                        </span>
                      }
                      @case ('cerrada') {
                        <span
                          class="flex h-full items-center justify-center border border-dashed
                                 border-on-campo/25 text-on-campo/50"
                        >
                          <span aria-hidden="true">—</span>
                          <span class="sr-only">Cerrada</span>
                        </span>
                      }
                    }
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>

    <ul class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-on-campo/85">
      <li class="flex items-center gap-2">
        <span class="size-4 border border-borde-celda-libre bg-celda-libre" aria-hidden="true"></span>
        {{ modo() === 'elegir' ? 'Libre: tócala para elegirla' : 'Libre: tócala para reservar' }}
      </li>
      @for (motivo of sinVentas(); track motivo) {
        <li class="flex items-center gap-2">
          <mat-icon class="text-base" aria-hidden="true">hourglass_disabled</mat-icon>
          {{ motivo }}
        </li>
      }
      <li class="flex items-center gap-2">
        <span class="size-4 bg-on-campo/10" aria-hidden="true"></span>
        Ocupada
      </li>
      @for (bloqueo of bloqueos(); track bloqueo.motivo) {
        <li class="flex items-center gap-2">
          <mat-icon class="text-base" aria-hidden="true">{{ bloqueo.icono }}</mat-icon>
          {{ bloqueo.motivo }}
        </li>
      }
      @if (prime(); as prime) {
        <li class="flex items-center gap-2">
          <span
            class="bg-warning-soft px-1 font-display text-xs font-bold tracking-wider
                   text-warning-strong uppercase"
            aria-hidden="true"
          >
            Prime
          </span>
          Hora prime desde las {{ prime.hora }}{{ prime.monto ? ': arriendo ' + prime.monto : '' }}
        </li>
      }
    </ul>
  `,
  styles: `
    /* La bloqueada se raya en vez de pintarse de otro color: se distingue de la
       ocupada también en blanco y negro. */
    .rayas {
      background: repeating-linear-gradient(
        -45deg,
        color-mix(in oklab, var(--color-on-campo) 14%, transparent) 0 6px,
        transparent 6px 12px
      );
    }
  `,
})
export class Marcador {
  /** Las grillas del día, en el orden del catálogo. */
  readonly grillas = input.required<readonly GrillaDeCancha[]>();

  /** En la portada la celda libre lleva a disponibilidad; en disponibilidad, se elige. */
  readonly modo = input<'enlace' | 'elegir'>('enlace');

  /**
   * La cancha, el inicio y el fin de la celda elegida, en modo elegir. El fin marca las filas
   * que siguen (T344): con 1 hora son dos, con hora y media, tres.
   */
  readonly elegida = input<{ canchaId: number; inicio: string; fin: string } | null>(null);

  /** Por qué no se le vende a quien mira una libre (lo sabe la grilla). Por omisión, se vende. */
  readonly sinVenta = input<MotivoSinVenta>(() => null);

  /** El nombre de la celda libre en modo elegir: lo que oye quien no ve el tablero. */
  readonly etiqueta = input<(cancha: Cancha, bloque: BloqueDisponible) => string>(
    (cancha, bloque) => `Elegir la ${cancha.nombre} a las ${horaEnElClub(bloque.inicio)}`,
  );

  /** Si la leyenda dice el arriendo de la hora prime: al socio, que no paga, no (T265). */
  readonly arriendo = input(true);

  /** La celda libre que se tocó, en modo elegir. */
  readonly elegir = output<CeldaElegible>();

  /**
   * En disponibilidad, los encabezados quedan pegados bajo la cabecera del sitio, que mide
   * 64 px: a la fila veinte nadie se acuerda de cuál columna era cuál. En la portada, no:
   * el tablero de hoy es corto y se desplaza de lado.
   */
  protected readonly pegado = computed(() =>
    this.modo() === 'elegir' ? 'sm:sticky sm:top-16 sm:z-20' : '',
  );

  /** "20:00", el fin de la elegida, para la última celda que la sigue (T344). */
  protected readonly finDeLaElegida = computed(() => {
    const elegida = this.elegida();
    return elegida ? horaEnElClub(elegida.fin) : '';
  });

  /** La última celda que tuvo el foco: es la parada del tablero al volver con Tab. */
  protected readonly foco = signal<string | null>(null);

  protected readonly canchas = computed((): Cancha[] => this.grillas().map(({ cancha }) => cancha));

  /** La hora (4.5rem) y cada cancha (3.25rem): por debajo de eso, se desplaza. */
  protected readonly anchoMinimo = computed(() => 4.5 + this.canchas().length * 3.25);

  /**
   * Una fila por cada hora que todavía no empieza, con lo que pasa en cada cancha.
   *
   * Se compara el instante y no el texto del inicio: la misma hora puede viajar
   * con y sin milisegundos, y como texto serían dos filas.
   */
  protected readonly filas = computed(() => {
    const ahora = Date.now();
    const grillas = this.grillas();
    const elegida = this.elegida();
    const desde = elegida ? new Date(elegida.inicio).getTime() : 0;
    const hasta = elegida ? new Date(elegida.fin).getTime() : 0;
    const instantes = new Set<number>();

    for (const { bloques } of grillas) {
      for (const { inicio } of bloques) {
        const instante = new Date(inicio).getTime();
        if (instante > ahora) instantes.add(instante);
      }
    }
    // Las medias horas de la elegida, aunque en ellas no empiece nada: al final del día la API
    // no manda inicios que terminen después del cierre, y la última hora se marcaba a medias.
    for (let instante = desde + PASO_DE_LA_GRILLA_MS; instante < hasta; instante += PASO_DE_LA_GRILLA_MS) {
      if (instante > ahora) instantes.add(instante);
    }

    return [...instantes]
      .sort((una, otra) => una - otra)
      .map((instante) => {
        const deLaHora = grillas.map(({ cancha, bloques }) => ({
          cancha,
          bloque: bloques.find(({ inicio }) => new Date(inicio).getTime() === instante),
        }));
        const sinInicios = deLaHora.every(({ bloque }) => !bloque);

        return {
          instante,
          hora: horaEnElClub(new Date(instante).toISOString()),
          fecha: fechaEnElClub(new Date(instante)),
          prime: deLaHora.some(({ bloque }) => bloque?.esPico),
          // De una cancha que se puede tomar: la API manda en 0 el monto de la reservada
          // y de la bloqueada, y la leyenda decía "arriendo $0".
          montoPico:
            deLaHora.find(
              ({ bloque }) => bloque?.esPico && !bloque.reservado && !bloque.bloqueado,
            )?.bloque?.montoClp ?? null,
          celdas: deLaHora.map(({ cancha, bloque }) => ({
            cancha,
            // Dentro de la hora elegida y después de su inicio (T344, B2), sea cual sea el
            // estado de su propio inicio.
            sigue: elegida?.canchaId === cancha.id && instante > desde && instante < hasta,
            ultima: instante + PASO_DE_LA_GRILLA_MS >= hasta,
            ...(sinInicios ? { estado: 'sin-inicio' as const } : celdaDe(bloque, this.sinVenta())),
          })),
        };
      });
  });

  /** Los motivos de bloqueo que aparecen en el tablero, para la leyenda. */
  protected readonly bloqueos = computed(() => {
    const vistos = new Map<string, string>();
    for (const { celdas } of this.filas()) {
      for (const celda of celdas) {
        // La que sigue a la elegida no muestra su estado: su motivo no va en la leyenda.
        if (celda.estado === 'bloqueada' && !celda.sigue) vistos.set(celda.motivo, celda.icono);
      }
    }
    return [...vistos].map(([motivo, icono]) => ({ motivo, icono }));
  });

  /** Los porqués de las libres que no se le venden a quien mira, para la leyenda. */
  protected readonly sinVentas = computed(() => {
    const motivos = new Set<string>();
    for (const { celdas } of this.filas()) {
      for (const celda of celdas) {
        if (celda.estado === 'sin-venta' && !celda.sigue) motivos.add(celda.motivo);
      }
    }
    return [...motivos];
  });

  /**
   * La celda que es la parada del teclado: la última que tuvo el foco, la elegida o la
   * primera libre, la primera de esas que siga libre en el tablero.
   */
  private readonly parada = computed(() => {
    const libres = new Set(
      this.filas().flatMap(({ celdas }) =>
        celdas.flatMap((celda) =>
          celda.estado === 'libre' && !celda.sigue ? [this.clave(celda)] : [],
        ),
      ),
    );
    const elegida = this.elegida();
    const candidatas = [this.foco(), elegida && claveDe(elegida.canchaId, elegida.inicio)];

    return candidatas.find((clave) => clave && libres.has(clave)) ?? [...libres][0] ?? null;
  });

  protected clave(celda: CeldaElegible): string {
    return claveDe(celda.cancha.id, celda.bloque.inicio);
  }

  protected esLaParada(celda: CeldaElegible): boolean {
    return this.clave(celda) === this.parada();
  }

  protected esLaElegida(celda: CeldaElegible): boolean {
    const elegida = this.elegida();
    return elegida !== null && claveDe(elegida.canchaId, elegida.inicio) === this.clave(celda);
  }

  /** Las flechas, de libre en libre (ver `moverConFlechas`). Solo en modo elegir. */
  protected mover(evento: KeyboardEvent): void {
    moverConFlechas(evento, this.filas().length, this.canchas().length);
  }

  /**
   * Desde cuándo es hora prime y cuánto cuesta el arriendo, si queda alguna hoy. Con
   * `arriendo` apagado (el socio), basta la hora: el monto no es para él.
   */
  protected readonly prime = computed(() => {
    const fila = this.filas().find(({ prime }) => prime);
    if (!fila) return null;
    if (!this.arriendo()) return { hora: fila.hora, monto: null };

    return fila.montoPico !== null ? { hora: fila.hora, monto: enPesos(fila.montoPico) } : null;
  });
}
