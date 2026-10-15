import { Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';

import { BloqueDisponible, Cancha, GrillaDeCancha } from './disponibilidad';
import { ICONOS_DE_MOTIVO, nombreDelMotivo } from './motivos';
import { enPesos, horaEnElClub } from './reloj-del-club';

type Celda =
  | { estado: 'libre'; bloque: BloqueDisponible }
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

/** Cuánto se mueve cada flecha en el tablero: [filas, columnas]. */
const PASOS: Record<string, readonly [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

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
 * **La celda libre lleva a `/disponibilidad`**, como el "Reservar" de "Libre hoy"
 * al que reemplaza. Va con `tabindex="-1"`: con ocho canchas y seis horas serían
 * cuarenta y ocho paradas de teclado hacia la misma página, que ya tiene su camino
 * en "Ver todos los horarios" y en el zócalo. El lector de pantalla igual la activa.
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
    <div class="overflow-x-auto">
      <table
        class="w-full table-fixed border-separate border-spacing-1"
        [style.min-width.rem]="anchoMinimo()"
      >
        <caption class="sr-only">
          @if (modo() === 'elegir') {
            Las horas del día, cancha por cancha. Las flechas recorren las horas libres.
          } @else {
            Las horas que quedan hoy, cancha por cancha
          }
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
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
                class="pb-1 align-top font-display text-xs font-semibold tracking-wider
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
                  @switch (celda.estado) {
                    @case ('libre') {
                      @if (modo() === 'elegir') {
                        <!-- La elegida dice "Libre" igual, que es su nombre (WCAG 2.5.3): lo
                             que cambia es la placa, la marca y aria-pressed. -->
                        @let marcada = esLaElegida(celda);
                        <button
                          type="button"
                          class="flex h-full w-full cursor-pointer items-center justify-center
                                 gap-0.5 border font-display text-sm font-bold tracking-wider
                                 uppercase transition-transform active:scale-95"
                          [class]="
                            marcada
                              ? 'border-rotulo bg-rotulo text-on-rotulo'
                              : 'border-borde-celda-libre bg-celda-libre text-on-celda-libre'
                          "
                          [attr.data-fila]="i"
                          [attr.data-columna]="j"
                          [attr.tabindex]="esLaParada(celda) ? 0 : -1"
                          [attr.aria-label]="etiqueta()(celda.cancha, celda.bloque)"
                          [attr.aria-pressed]="marcada"
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
          Hora prime desde las {{ prime.hora }}: arriendo {{ prime.monto }}
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

  /** La cancha y el inicio de la celda elegida, en modo elegir. */
  readonly elegida = input<{ canchaId: number; inicio: string } | null>(null);

  /** Por qué no se le vende a quien mira una libre (lo sabe la grilla). Por omisión, se vende. */
  readonly sinVenta = input<MotivoSinVenta>(() => null);

  /** El nombre de la celda libre en modo elegir: lo que oye quien no ve el tablero. */
  readonly etiqueta = input<(cancha: Cancha, bloque: BloqueDisponible) => string>(
    (cancha, bloque) => `Elegir la ${cancha.nombre} a las ${horaEnElClub(bloque.inicio)}`,
  );

  /** La celda libre que se tocó, en modo elegir. */
  readonly elegir = output<CeldaElegible>();

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
    const instantes = new Set<number>();

    for (const { bloques } of grillas) {
      for (const { inicio } of bloques) {
        const instante = new Date(inicio).getTime();
        if (instante > ahora) instantes.add(instante);
      }
    }

    return [...instantes]
      .sort((una, otra) => una - otra)
      .map((instante) => {
        const deLaHora = grillas.map(({ cancha, bloques }) => ({
          cancha,
          bloque: bloques.find(({ inicio }) => new Date(inicio).getTime() === instante),
        }));

        return {
          instante,
          hora: horaEnElClub(new Date(instante).toISOString()),
          prime: deLaHora.some(({ bloque }) => bloque?.esPico),
          // De una cancha que se puede tomar: la API manda en 0 el monto de la reservada
          // y de la bloqueada, y la leyenda decía "arriendo $0".
          montoPico:
            deLaHora.find(
              ({ bloque }) => bloque?.esPico && !bloque.reservado && !bloque.bloqueado,
            )?.bloque?.montoClp ?? null,
          celdas: deLaHora.map(({ cancha, bloque }) => ({
            cancha,
            ...celdaDe(bloque, this.sinVenta()),
          })),
        };
      });
  });

  /** Los motivos de bloqueo que aparecen en el tablero, para la leyenda. */
  protected readonly bloqueos = computed(() => {
    const vistos = new Map<string, string>();
    for (const { celdas } of this.filas()) {
      for (const celda of celdas) {
        if (celda.estado === 'bloqueada') vistos.set(celda.motivo, celda.icono);
      }
    }
    return [...vistos].map(([motivo, icono]) => ({ motivo, icono }));
  });

  /** Los porqués de las libres que no se le venden a quien mira, para la leyenda. */
  protected readonly sinVentas = computed(() => {
    const motivos = new Set<string>();
    for (const { celdas } of this.filas()) {
      for (const celda of celdas) {
        if (celda.estado === 'sin-venta') motivos.add(celda.motivo);
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
        celdas.flatMap((celda) => (celda.estado === 'libre' ? [this.clave(celda)] : [])),
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

  /**
   * Las flechas, de libre en libre: se salta lo que no se puede tomar en esa dirección, y en
   * el borde se queda donde está. Solo en modo elegir, que es el que tiene botones.
   */
  protected mover(evento: KeyboardEvent): void {
    const paso = PASOS[evento.key];
    const desde = evento.currentTarget as HTMLElement;
    const tabla = desde.closest('table');
    if (!paso || !tabla) return;

    evento.preventDefault();
    const filas = this.filas().length;
    const columnas = this.canchas().length;
    let fila = Number(desde.dataset['fila']);
    let columna = Number(desde.dataset['columna']);

    for (;;) {
      fila += paso[0];
      columna += paso[1];
      if (fila < 0 || fila >= filas || columna < 0 || columna >= columnas) return;

      const destino = tabla.querySelector<HTMLElement>(
        `button[data-fila="${fila}"][data-columna="${columna}"]`,
      );
      if (destino) {
        destino.focus();
        return;
      }
    }
  }

  /** Desde cuándo es hora prime y cuánto cuesta el arriendo, si queda alguna hoy. */
  protected readonly prime = computed(() => {
    const fila = this.filas().find(({ prime }) => prime);
    return fila && fila.montoPico !== null
      ? { hora: fila.hora, monto: enPesos(fila.montoPico) }
      : null;
  });
}
