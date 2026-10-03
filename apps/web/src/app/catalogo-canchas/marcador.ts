import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BloqueDisponible, Cancha, GrillaDeCancha } from './disponibilidad';
import { nombreDelMotivo } from './motivos';
import { enPesos, horaEnElClub } from './reloj-del-club';

type Celda =
  | { estado: 'libre' }
  | { estado: 'ocupada' }
  | { estado: 'bloqueada'; motivo: string; icono: string }
  | { estado: 'cerrada' };

/** El ícono de cada motivo, para que la celda bloqueada no dependa del color. */
const ICONOS_DE_MOTIVO: Record<string, string> = {
  MANTENCION: 'build',
  TORNEO: 'emoji_events',
  CLASE: 'school',
};

function celdaDe(bloque: BloqueDisponible | undefined): Celda {
  if (!bloque) return { estado: 'cerrada' };
  if (bloque.bloqueado) {
    return {
      estado: 'bloqueada',
      motivo: nombreDelMotivo(bloque.motivoBloqueo),
      icono: (bloque.motivoBloqueo && ICONOS_DE_MOTIVO[bloque.motivoBloqueo]) ?? 'block',
    };
  }
  return bloque.reservado ? { estado: 'ocupada' } : { estado: 'libre' };
}

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
 * al que reemplaza; preseleccionar la hora sería una función nueva (decisión 1 del
 * plan). Va con `tabindex="-1"`: con ocho canchas y seis horas serían cuarenta y
 * ocho paradas de teclado hacia la misma página, que ya tiene su camino en "Ver
 * todos los horarios" y en el zócalo. El lector de pantalla igual la activa.
 *
 * **Con más canchas de las que caben, se desplaza el tablero y no la página**, y
 * la columna de la hora queda fija para no perder la fila.
 */
@Component({
  selector: 'app-marcador',
  imports: [RouterLink],
  host: { class: 'block' },
  template: `
    <div class="overflow-x-auto">
      <table
        class="w-full table-fixed border-separate border-spacing-1"
        [style.min-width.rem]="anchoMinimo()"
      >
        <caption class="sr-only">
          Las horas que quedan hoy, cancha por cancha
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
                    <span class="icono text-sm" aria-hidden="true">roofing</span>
                    <span class="sr-only">, techada</span>
                  }
                </span>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (fila of filas(); track fila.instante) {
            <tr>
              <th scope="row" class="sticky left-0 z-10 bg-campo text-start">
                <span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span class="font-display text-xl font-bold tabular-nums sm:text-2xl">
                    {{ fila.hora }}
                  </span>
                  @if (fila.pico) {
                    <span
                      class="bg-warning-soft px-1 font-display text-xs font-bold
                             tracking-wider text-warning-strong uppercase"
                    >
                      Pico
                    </span>
                  }
                </span>
              </th>
              @for (celda of fila.celdas; track celda.cancha.id) {
                <td class="h-11 p-0">
                  @switch (celda.estado) {
                    @case ('libre') {
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
                    @case ('ocupada') {
                      <span class="flex h-full bg-on-campo/10">
                        <span class="sr-only">Ocupada</span>
                      </span>
                    }
                    @case ('bloqueada') {
                      <span class="rayas flex h-full items-center justify-center text-on-campo/70">
                        <span class="icono text-base" aria-hidden="true">{{ celda.icono }}</span>
                        <span class="sr-only">{{ celda.motivo }}</span>
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
        Libre: tócala para reservar
      </li>
      <li class="flex items-center gap-2">
        <span class="size-4 bg-on-campo/10" aria-hidden="true"></span>
        Ocupada
      </li>
      @for (bloqueo of bloqueos(); track bloqueo.motivo) {
        <li class="flex items-center gap-2">
          <span class="icono text-base" aria-hidden="true">{{ bloqueo.icono }}</span>
          {{ bloqueo.motivo }}
        </li>
      }
      @if (pico(); as pico) {
        <li class="flex items-center gap-2">
          <span
            class="bg-warning-soft px-1 font-display text-xs font-bold tracking-wider
                   text-warning-strong uppercase"
            aria-hidden="true"
          >
            Pico
          </span>
          Hora pico desde las {{ pico.hora }}: arriendo {{ pico.monto }}
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
          pico: deLaHora.some(({ bloque }) => bloque?.esPico),
          montoPico: deLaHora.find(({ bloque }) => bloque?.esPico)?.bloque?.montoClp ?? null,
          celdas: deLaHora.map(({ cancha, bloque }) => ({ cancha, ...celdaDe(bloque) })),
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

  /** Desde cuándo es hora pico y cuánto cuesta el arriendo, si queda alguna hoy. */
  protected readonly pico = computed(() => {
    const fila = this.filas().find(({ pico }) => pico);
    return fila && fila.montoPico !== null
      ? { hora: fila.hora, monto: enPesos(fila.montoPico) }
      : null;
  });
}
