import { Component, computed, input, output, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

import { GrillaDeCancha } from '../../catalogo-canchas/disponibilidad';
import { moverConFlechas } from '../../catalogo-canchas/flechas-del-tablero';
import { ICONOS_DE_MOTIVO, nombreDelMotivo } from '../../catalogo-canchas/motivos';
import { horaEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { ClaseDelDia } from '../../clases/clases.service';
import { BloqueoDelDia, ReservaDelDia } from './agenda.service';

/** El paso de la grilla en la API (`PASO_DE_LA_GRILLA_MIN`): una fila por media hora. */
const FRANJA_MS = 30 * 60 * 1000;

export interface ColumnaDeLaAgenda {
  /** Nulo en el gimnasio, que no es una cancha. */
  canchaId: number | null;
  nombre: string;
  techada: boolean;
}

/**
 * Lo que hay en una cancha en una media hora. `franjas` es cuántas filas ocupa; `cubierta`
 * es la fila que ya ocupa una celda de arriba, y no se dibuja.
 */
export type CeldaDeLaAgenda =
  | { tipo: 'reserva'; reserva: ReservaDelDia; franjas: number }
  | { tipo: 'clase'; clase: ClaseDelDia; franjas: number }
  | { tipo: 'bloqueada'; motivo: string; icono: string; franjas: number }
  | { tipo: 'libre'; canchaId: number; inicio: string }
  | { tipo: 'cerrada' }
  | { tipo: 'vacia' }
  | { tipo: 'cubierta' };

export interface FilaDeLaAgenda {
  inicio: string;
  hora: string;
  celdas: CeldaDeLaAgenda[];
}

/**
 * El día del mesón como tablero: una fila por media hora y una columna por cancha, más el
 * gimnasio si ese día tiene clases (SPEC-revision-qa.md, A4).
 *
 * Cada reserva, clase o cierre ocupa sus franjas exactas. Lo cerrado sale de los bloqueos
 * con su rango y no de la disponibilidad: sus bloques duran una hora y empiezan cada media,
 * así que un cierre de 09:00 a 10:00 también cerraría el bloque de las 08:30. El horario de
 * cada cancha sí sale de la disponibilidad: la franja está abierta si algún bloque la cubre.
 */
export function tableroDeLaAgenda(dia: {
  grillas: readonly GrillaDeCancha[];
  reservas: readonly ReservaDelDia[];
  clases: readonly ClaseDelDia[];
  bloqueos: readonly BloqueoDelDia[];
}): { columnas: ColumnaDeLaAgenda[]; filas: FilaDeLaAgenda[] } {
  const ms = (instante: string) => new Date(instante).getTime();
  const enElGimnasio = dia.clases.filter(({ canchaId }) => canchaId === null);

  const columnas: ColumnaDeLaAgenda[] = [
    ...dia.grillas.map(({ cancha }) => ({
      canchaId: cancha.id,
      nombre: cancha.nombre,
      techada: cancha.techada,
    })),
    ...(enElGimnasio.length > 0 ? [{ canchaId: null, nombre: 'Gimnasio', techada: true }] : []),
  ];

  // Del primer inicio al último fin de lo que pasa en el día. Los cierres no estiran el
  // día: uno de una semana lo llenaría de franjas vacías.
  const limites = [
    ...dia.grillas.flatMap(({ bloques }) =>
      bloques.flatMap(({ inicio, fin }) => [ms(inicio), ms(fin)]),
    ),
    ...[...dia.reservas, ...dia.clases].flatMap(({ inicio, fin }) => [ms(inicio), ms(fin)]),
  ];
  if (limites.length === 0) return { columnas, filas: [] };

  // En punto y media: una clase de las 07:45 no corre el tablero, y la reserva de las 08:00
  // sigue cayendo en su franja.
  const desde = Math.floor(Math.min(...limites) / FRANJA_MS) * FRANJA_MS;
  const hasta = Math.ceil(Math.max(...limites) / FRANJA_MS) * FRANJA_MS;
  const franjas: number[] = [];
  for (let instante = desde; instante < hasta; instante += FRANJA_MS) franjas.push(instante);

  /** Cuántas franjas ocupa algo que empieza en `instante` y termina en `fin`, sin pasarse. */
  const cuantas = (instante: number, fin: number) =>
    Math.max(1, Math.ceil((Math.min(fin, hasta) - instante) / FRANJA_MS));

  /** Cuántas franjas enteras hay hasta que empieza otra reserva o clase en esa cancha. */
  const franjasHastaLaSiguiente = (canchaId: number | null, instante: number) => {
    const siguiente = Math.min(
      ...[...dia.reservas, ...dia.clases]
        .filter((una) => una.canchaId === canchaId && ms(una.inicio) >= instante + FRANJA_MS)
        .map(({ inicio }) => ms(inicio)),
    );
    return Number.isFinite(siguiente) ? Math.floor((siguiente - instante) / FRANJA_MS) : Infinity;
  };

  const celdasPorColumna = columnas.map(({ canchaId }) => {
    const grilla = dia.grillas.find(({ cancha }) => cancha.id === canchaId);
    const celdas: CeldaDeLaAgenda[] = [];
    let cubiertaHasta = 0;

    for (const instante of franjas) {
      if (instante < cubiertaHasta) {
        celdas.push({ tipo: 'cubierta' });
        continue;
      }

      /** Si empieza en esta franja: a una hora rara, en la que la contiene. */
      const empiezaAca = (una: { canchaId: number | null; inicio: string }) =>
        una.canchaId === canchaId &&
        ms(una.inicio) >= instante &&
        ms(una.inicio) < instante + FRANJA_MS;
      const reserva = dia.reservas.find(empiezaAca);
      const clase = dia.clases.find(empiezaAca);
      const bloqueo =
        canchaId === null
          ? undefined
          : dia.bloqueos.find(
              (uno) =>
                uno.canchaId === canchaId &&
                ms(uno.inicio) < instante + FRANJA_MS &&
                ms(uno.fin) > instante,
            );

      let celda: CeldaDeLaAgenda;
      if (reserva) {
        celda = { tipo: 'reserva', reserva, franjas: cuantas(instante, ms(reserva.fin)) };
      } else if (clase) {
        celda = { tipo: 'clase', clase, franjas: cuantas(instante, ms(clase.fin)) };
      } else if (bloqueo) {
        celda = {
          tipo: 'bloqueada',
          motivo: nombreDelMotivo(bloqueo.motivo),
          icono: ICONOS_DE_MOTIVO[bloqueo.motivo] ?? 'block',
          // Se corta donde empieza la reserva o la clase siguiente de la cancha: un cierre
          // puesto encima de una reserva no la tapa, y el mesón la ve.
          franjas: Math.min(
            cuantas(instante, ms(bloqueo.fin)),
            franjasHastaLaSiguiente(canchaId, instante),
          ),
        };
      } else if (canchaId === null) {
        // El gimnasio no se reserva por hora: sin clase, no hay nada que tomar.
        celda = { tipo: 'vacia' };
      } else {
        const abierta = grilla?.bloques.some(
          ({ inicio, fin }) => ms(inicio) <= instante && ms(fin) >= instante + FRANJA_MS,
        );
        celda = abierta
          ? { tipo: 'libre', canchaId, inicio: new Date(instante).toISOString() }
          : { tipo: 'cerrada' };
      }

      if ('franjas' in celda) cubiertaHasta = instante + celda.franjas * FRANJA_MS;
      celdas.push(celda);
    }

    return celdas;
  });

  return {
    columnas,
    filas: franjas.map((instante, fila) => ({
      inicio: new Date(instante).toISOString(),
      hora: horaEnElClub(new Date(instante).toISOString()),
      celdas: celdasPorColumna.map((celdas) => celdas[fila]),
    })),
  };
}

/**
 * El tablero de la agenda del día (T270): la cara del tablero de disponibilidad, para el
 * mesón. La reserva se toca y abre su ficha; la franja libre, al admin, le abre «Nueva
 * reserva» con esa cancha y esa hora (D2). Al gestor la libre no le ofrece nada: él mira
 * el día y anota, no toma horas (T221).
 *
 * Va sobre una banda de campo, como el de disponibilidad: la pone la página.
 */
@Component({
  selector: 'app-tablero-de-la-agenda',
  imports: [MatIcon],
  host: { class: 'block' },
  template: `
    <div class="overflow-x-auto">
      <table
        class="w-full table-fixed border-separate border-spacing-1"
        [style.min-width.rem]="anchoMinimo()"
      >
        <caption class="sr-only">
          El día del club, media hora por media hora y cancha por cancha. Las flechas recorren las
          reservas y las horas libres.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              class="sticky left-0 z-10 w-16 bg-campo pb-1 text-start font-display text-xs
                     font-semibold tracking-wider text-on-campo/75 uppercase"
            >
              Hora
            </th>
            @for (columna of tablero().columnas; track columna.nombre) {
              <th
                scope="col"
                class="pb-1 align-top font-display text-xs font-semibold tracking-wider
                       text-on-campo/75 uppercase sm:text-sm"
              >
                {{ columna.nombre }}
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (fila of tablero().filas; track fila.inicio; let i = $index) {
            <tr>
              <th scope="row" class="sticky left-0 z-10 bg-campo text-start align-top">
                <span class="font-display text-lg font-bold tabular-nums">{{ fila.hora }}</span>
              </th>
              @for (celda of fila.celdas; track $index; let j = $index) {
                @switch (celda.tipo) {
                  @case ('cubierta') {}
                  @case ('reserva') {
                    <td class="p-0 align-top" [attr.rowspan]="celda.franjas">
                      @let reserva = celda.reserva;
                      @let espera = reserva.estado === 'PENDIENTE_PAGO';
                      <!-- Una tarjeta clara sobre el campo: es lo que el mesón busca. La que
                           espera el pago, punteada y dicho con palabras: ocupa la cancha
                           pero se puede caer. -->
                      <button
                        type="button"
                        class="flex h-full min-h-11 w-full cursor-pointer flex-col items-start
                               gap-0.5 overflow-hidden border bg-card p-1.5 text-start
                               text-foreground hover:border-primary"
                        [class.border-dashed]="espera"
                        [class.border-on-campo]="espera"
                        [class.border-transparent]="!espera"
                        [attr.data-fila]="i"
                        [attr.data-columna]="j"
                        [attr.tabindex]="esLaParada(i, j) ? 0 : -1"
                        [attr.aria-label]="etiqueta(reserva)"
                        (focus)="foco.set(i + ':' + j)"
                        (keydown)="mover($event)"
                        (click)="abrir.emit(reserva)"
                      >
                        <span class="w-full truncate text-sm font-semibold">{{
                          reserva.nombre
                        }}</span>
                        <span class="text-xs text-muted-foreground">
                          {{ reserva.esSocio ? 'Socio' : 'Visitante' }}
                        </span>
                        @if (espera) {
                          <span class="inline-flex items-center gap-0.5 text-xs font-semibold">
                            <mat-icon class="text-sm" aria-hidden="true">schedule</mat-icon>
                            Esperando el pago
                          </span>
                        }
                      </button>
                    </td>
                  }
                  @case ('clase') {
                    <td class="p-0 align-top" [attr.rowspan]="celda.franjas">
                      <div
                        class="flex h-full min-h-11 flex-col items-start gap-0.5 overflow-hidden
                               bg-on-campo/15 p-1.5 text-on-campo"
                      >
                        <span class="inline-flex items-center gap-1 text-sm font-semibold">
                          <mat-icon class="text-sm" aria-hidden="true">school</mat-icon>
                          Clase
                        </span>
                        <span class="w-full truncate text-xs">{{ celda.clase.profesor }}</span>
                      </div>
                    </td>
                  }
                  @case ('bloqueada') {
                    <td class="p-0" [attr.rowspan]="celda.franjas">
                      <span
                        class="rayas flex h-full min-h-11 items-center justify-center gap-1
                               text-xs text-on-campo/80"
                      >
                        <mat-icon class="text-base" aria-hidden="true">{{ celda.icono }}</mat-icon>
                        {{ celda.motivo }}
                      </span>
                    </td>
                  }
                  @case ('libre') {
                    <td class="h-11 p-0">
                      @if (puedeTomar()) {
                        <button
                          type="button"
                          class="flex h-full w-full cursor-pointer items-center justify-center
                                 border border-borde-celda-libre bg-celda-libre font-display
                                 text-xs font-bold tracking-wider text-on-celda-libre uppercase
                                 hover:border-on-celda-libre active:scale-95"
                          [attr.data-fila]="i"
                          [attr.data-columna]="j"
                          [attr.tabindex]="esLaParada(i, j) ? 0 : -1"
                          [attr.aria-label]="
                            'Libre: tomar la ' +
                            tablero().columnas[j].nombre +
                            ' a las ' +
                            fila.hora
                          "
                          (focus)="foco.set(i + ':' + j)"
                          (keydown)="mover($event)"
                          (click)="tomar.emit({ canchaId: celda.canchaId, inicio: celda.inicio })"
                        >
                          Libre
                        </button>
                      } @else {
                        <span
                          class="flex h-full items-center justify-center border
                                 border-borde-celda-libre/60 bg-celda-libre/40 font-display
                                 text-xs font-bold tracking-wider text-on-campo/80 uppercase"
                        >
                          Libre
                        </span>
                      }
                    </td>
                  }
                  @case ('cerrada') {
                    <td class="h-11 p-0">
                      <span
                        class="flex h-full items-center justify-center border border-dashed
                               border-on-campo/25 text-on-campo/50"
                      >
                        <span aria-hidden="true">—</span>
                        <span class="sr-only">Cerrada</span>
                      </span>
                    </td>
                  }
                  @case ('vacia') {
                    <td class="h-11 p-0"><span class="sr-only">Sin clase</span></td>
                  }
                }
              }
            </tr>
          }
        </tbody>
      </table>
    </div>

    <ul class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-on-campo/85">
      <li class="flex items-center gap-2">
        <span class="size-4 bg-card" aria-hidden="true"></span>
        Reserva: tócala para ver su ficha
      </li>
      <li class="flex items-center gap-2">
        <span class="size-4 border border-dashed border-on-campo bg-card" aria-hidden="true"></span>
        Esperando el pago
      </li>
      <li class="flex items-center gap-2">
        <span
          class="size-4 border border-borde-celda-libre bg-celda-libre"
          aria-hidden="true"
        ></span>
        {{ puedeTomar() ? 'Libre: tócala para tomarla' : 'Libre' }}
      </li>
      <li class="flex items-center gap-2">
        <mat-icon class="text-base" aria-hidden="true">school</mat-icon>
        Clase
      </li>
    </ul>
  `,
  styles: `
    /* Como en el tablero de disponibilidad: lo cerrado se raya, y se distingue de lo
       ocupado también en blanco y negro. */
    .rayas {
      background: repeating-linear-gradient(
        -45deg,
        color-mix(in oklab, var(--color-on-campo) 14%, transparent) 0 6px,
        transparent 6px 12px
      );
    }
  `,
})
export class TableroDeLaAgenda {
  /** La disponibilidad del día: las canchas, en el orden del club, y su horario. */
  readonly grillas = input.required<readonly GrillaDeCancha[]>();
  readonly reservas = input.required<readonly ReservaDelDia[]>();
  readonly clases = input.required<readonly ClaseDelDia[]>();
  readonly bloqueos = input.required<readonly BloqueoDelDia[]>();
  /** El admin toma horas desde la franja libre; el gestor no (T221). */
  readonly puedeTomar = input(false);

  /** La reserva que se tocó, para abrir su ficha. */
  readonly abrir = output<ReservaDelDia>();
  /** La franja libre que se tocó, para «Nueva reserva» con esa cancha y esa hora. */
  readonly tomar = output<{ canchaId: number; inicio: string }>();

  protected readonly tablero = computed(() =>
    tableroDeLaAgenda({
      grillas: this.grillas(),
      reservas: this.reservas(),
      clases: this.clases(),
      bloqueos: this.bloqueos(),
    }),
  );

  /** La hora (4rem) y cada columna (7rem, para que quepa un nombre): por debajo, se desplaza. */
  protected readonly anchoMinimo = computed(() => 4 + this.tablero().columnas.length * 7);

  /** La última celda que tuvo el foco, "fila:columna": la parada del tablero al volver. */
  protected readonly foco = signal<string | null>(null);

  /** Las celdas que son botón, en orden de lectura, como "fila:columna". */
  private readonly tocables = computed(() =>
    this.tablero().filas.flatMap(({ celdas }, i) =>
      celdas.flatMap((celda, j) =>
        celda.tipo === 'reserva' || (celda.tipo === 'libre' && this.puedeTomar())
          ? [`${i}:${j}`]
          : [],
      ),
    ),
  );

  /** La parada del teclado: la última con foco si sigue siendo botón, y si no, la primera. */
  private readonly parada = computed(() => {
    const tocables = this.tocables();
    const foco = this.foco();
    return foco && tocables.includes(foco) ? foco : (tocables[0] ?? null);
  });

  protected esLaParada(fila: number, columna: number): boolean {
    return this.parada() === `${fila}:${columna}`;
  }

  protected mover(evento: KeyboardEvent): void {
    moverConFlechas(evento, this.tablero().filas.length, this.tablero().columnas.length);
  }

  /** Lo que oye quien no ve el tablero: la hora, la cancha, de quién es y si se paga. */
  protected etiqueta(reserva: ReservaDelDia): string {
    return (
      `${horaEnElClub(reserva.inicio)} a ${horaEnElClub(reserva.fin)}, ${reserva.cancha}: ` +
      `${reserva.nombre}, ${reserva.esSocio ? 'socio' : 'visitante'}` +
      (reserva.estado === 'PENDIENTE_PAGO' ? ', esperando el pago' : '') +
      '. Ver la ficha'
    );
  }
}
