import { Injectable } from '@nestjs/common';

import { mesEnElClub } from '../comun/tiempo';
import { EstadoReporte, EstadoReserva } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { abreEl, cierraEl } from './rango';

export interface FilaDeNoUso {
  etiqueta: string;
  /** Horas que el club confirmó que se reservaron y no se usaron. */
  noUsadas: number;
  /** Horas reservadas en total, para poder leer la proporción. */
  reservadas: number;
  /** Qué parte de lo reservado se desperdició. `null` si no hubo reservas. */
  porcentaje: number | null;
}

export interface ReporteDeNoUso {
  desde: string;
  hasta: string;
  corte: CorteDeNoUso;
  noUsadas: number;
  reservadas: number;
  porcentaje: number | null;
  /** Reportes que nadie miró todavía. No cuentan, pero hay que saber que están. */
  sinResolver: number;
  filas: FilaDeNoUso[];
  calculadoEn: string;
}

/** Los cortes del OE4: por mes, por cancha y por franja. */
export const CORTES_DE_NO_USO = ['mes', 'cancha', 'franja'] as const;

export type CorteDeNoUso = (typeof CORTES_DE_NO_USO)[number];

export function esCorteDeNoUso(valor: unknown): valor is CorteDeNoUso {
  return CORTES_DE_NO_USO.includes(valor as CorteDeNoUso);
}

/**
 * Las horas que alguien reservó y no usó.
 *
 * Es el indicador que el objetivo específico 4 del perfil pide comparar antes y después
 * del sistema, así que tiene que poder mirarse por período sin contar a mano.
 *
 * **Solo cuentan los reportes que el admin sancionó.** Un reporte pendiente es una
 * acusación, no un hecho: alguien apretó un botón diciendo que la cancha estaba vacía y
 * todavía nadie lo miró. Contarlos infla el indicador con lo que el club no confirmó, y
 * encima lo deja a merced de dos socios molestos. Los pendientes se informan aparte,
 * para que nadie lea un número bajo cuando lo que pasa es que la bandeja está sin
 * revisar.
 */
@Injectable()
export class HorasNoUsadas {
  constructor(private readonly prisma: PrismaService) {}

  async reporte(
    desde: string,
    hasta: string,
    corte: CorteDeNoUso,
  ): Promise<ReporteDeNoUso> {
    const rango = {
      gte: abreEl(desde),
      lt: cierraEl(hasta),
    };

    const [reportes, reservas, sinResolver] = await Promise.all([
      this.prisma.reporteNoUso.findMany({
        where: {
          estado: EstadoReporte.SANCIONADO,
          reserva: { inicio: rango },
        },
        select: {
          reservaId: true,
          reserva: {
            select: {
              inicio: true,
              esPico: true,
              cancha: { select: { nombre: true } },
            },
          },
        },
      }),
      // El denominador: todo lo que se reservó de verdad en el período. Sin él, "doce
      // horas no usadas" no dice nada —¿de cuántas?— y el OE4 no se puede comparar
      // entre dos meses de distinto movimiento.
      this.prisma.reserva.findMany({
        where: { estado: EstadoReserva.CONFIRMADA, inicio: rango },
        select: {
          inicio: true,
          esPico: true,
          cancha: { select: { nombre: true } },
        },
      }),
      this.prisma.reporteNoUso.count({
        where: {
          estado: EstadoReporte.PENDIENTE,
          reserva: { inicio: rango },
        },
      }),
    ]);

    // **Una hora por reserva, no una por reporte.** `ReporteNoUso` es único por
    // (reserva, reportante), así que dos socios pueden reportar la misma hora —y es el
    // caso normal: un no-show lo ve todo el que esté esperando esa cancha—. Contando
    // reportes, esa hora sumaba dos y el indicador podía pasar del 100 %.
    const porReserva = new Map(
      reportes.map((uno) => [uno.reservaId, uno.reserva]),
    );
    const noUsadas = [...porReserva.values()];
    const filas = this.agrupar(noUsadas, reservas, corte);

    return {
      desde,
      hasta,
      corte,
      noUsadas: noUsadas.length,
      reservadas: reservas.length,
      porcentaje: proporcion(noUsadas.length, reservas.length),
      sinResolver,
      filas,
      calculadoEn: new Date().toISOString(),
    };
  }

  /**
   * Junta las dos listas en una fila por etiqueta.
   *
   * **Las etiquetas salen de lo reservado y no de lo no usado**: una cancha con
   * reservas y sin ningún no-uso tiene que aparecer con cero, que es justamente la
   * buena noticia. Al revés, el reporte solo mostraría las canchas con problemas y
   * parecería que el club entero anda mal.
   */
  private agrupar(
    noUsadas: HoraDeCancha[],
    reservadas: HoraDeCancha[],
    corte: CorteDeNoUso,
  ): FilaDeNoUso[] {
    const filas = new Map<string, { noUsadas: number; reservadas: number }>();
    const traer = (etiqueta: string) => {
      const fila = filas.get(etiqueta) ?? { noUsadas: 0, reservadas: 0 };
      filas.set(etiqueta, fila);

      return fila;
    };

    for (const hora of reservadas)
      traer(etiquetaDe(hora, corte)).reservadas += 1;
    for (const hora of noUsadas) traer(etiquetaDe(hora, corte)).noUsadas += 1;

    return [...filas]
      .map(([etiqueta, cuenta]) => ({
        etiqueta,
        ...cuenta,
        porcentaje: proporcion(cuenta.noUsadas, cuenta.reservadas),
      }))
      .sort(
        (una, otra) =>
          (otra.porcentaje ?? -1) - (una.porcentaje ?? -1) ||
          una.etiqueta.localeCompare(otra.etiqueta, 'es'),
      );
  }
}

/** Una hora reservada, con lo que hace falta para cortarla. */
interface HoraDeCancha {
  inicio: Date;
  esPico: boolean;
  cancha: { nombre: string };
}

function etiquetaDe(hora: HoraDeCancha, corte: CorteDeNoUso): string {
  switch (corte) {
    case 'mes':
      // **Del club y no UTC.** `inicio` es un instante: las 21:00 del 31 de agosto en
      // Santiago son la 01:00Z del 1 de septiembre, y como el club cierra a las 22:00
      // le pasa a toda hora de la tarde del último día del mes. El rango del reporte
      // ya se calcula con el reloj del club; si la etiqueta no, esa hora entra en
      // agosto y sale rotulada como septiembre.
      return mesEnElClub(hora.inicio);
    case 'cancha':
      return hora.cancha.nombre;
    case 'franja':
      return hora.esPico ? 'Pico' : 'Valle';
  }
}

/** Qué parte de lo reservado se desperdició. `null` si no hubo nada reservado. */
function proporcion(noUsadas: number, reservadas: number): number | null {
  return reservadas === 0 ? null : Math.round((noUsadas / reservadas) * 100);
}
