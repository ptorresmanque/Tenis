import { Injectable } from '@nestjs/common';

import {
  comoFechaCivil,
  fechaDelClub,
  instanteEnElClub,
} from '../comun/tiempo';
import {
  ConceptoPago,
  EstadoCuota,
  EstadoTransaccion,
  TipoCuota,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { agrupar, Corte, FilaDeIngreso, Movimiento } from './ingreso';

export interface ReporteDeIngreso {
  desde: string;
  hasta: string;
  corte: Corte;
  totalClp: number;
  filas: FilaDeIngreso[];
  /**
   * Cuánto de las cuotas atribuidas al período sigue sin pagarse.
   *
   * **El reporte de un mes cambia después de cerrado**: una cuota de agosto pagada en
   * octubre se suma a agosto. Este número dice cuánto falta todavía, para que nadie
   * lea el total de un mes reciente como si estuviera completo.
   */
  cuotasImpagasClp: number;
  /** Cuándo se calculó, porque el mismo rango puede dar otro número mañana. */
  calculadoEn: string;
}

/**
 * El ingreso del club por período.
 *
 * **El ingreso se atribuye a la hora jugada, no a la fecha en que se pagó**, y las
 * cuotas a su período, no al día en que el socio se puso al día. Es la decisión de la
 * que depende que el reporte sirva para algo: la pregunta del club es *qué horas
 * rinden*, y una hora que rinde no es una hora en que alguien pagó.
 *
 * **Dos fuentes, no una.** El arriendo vive en `Transaccion`; las cuotas del mesón no
 * pasan por la pasarela y viven solo en `Cuota`. Mirar solo transacciones deja fuera el
 * efectivo, que en este club es una parte grande de la caja.
 */
@Injectable()
export class IngresoDelClub {
  constructor(private readonly prisma: PrismaService) {}

  async reporte(
    desde: string,
    hasta: string,
    corte: Corte,
  ): Promise<ReporteDeIngreso> {
    const movimientos = [
      ...(await this.arriendos(desde, hasta)),
      ...(await this.cuotas(desde, hasta)),
    ];

    return {
      desde,
      hasta,
      corte,
      totalClp: movimientos.reduce((suma, uno) => suma + uno.montoClp, 0),
      filas: agrupar(movimientos, corte),
      cuotasImpagasClp: await this.cuotasImpagas(desde, hasta),
      calculadoEn: new Date().toISOString(),
    };
  }

  /**
   * Los arriendos cobrados, puestos en el día en que se jugó.
   *
   * Se filtra por `Reserva.inicio` y no por `Transaccion.creadaEn`: quien arrienda el
   * sábado a las 20:00 y paga el martes anterior es ingreso del sábado.
   *
   * **Una devolución no resta: deja de sumar.** Devolver el dinero pasa la transacción
   * a `ANULADA`, así que sale sola de este filtro, y como la atribución es por hora
   * jugada, el peso desaparece exactamente del período de la hora devuelta. No hay una
   * fila negativa que alguien pueda olvidarse de generar.
   */
  private async arriendos(desde: string, hasta: string): Promise<Movimiento[]> {
    const pagos = await this.prisma.transaccion.findMany({
      where: {
        estado: EstadoTransaccion.AUTORIZADA,
        concepto: ConceptoPago.RESERVA,
      },
      select: { conceptoId: true, montoClp: true },
    });

    if (pagos.length === 0) return [];

    // Dos consultas y no un join, porque `Transaccion.conceptoId` no tiene clave
    // foránea a propósito: apunta a dos tablas según el concepto. Son decenas de miles
    // de filas al año y el `in` las resuelve por índice primario.
    const reservas = await this.prisma.reserva.findMany({
      where: {
        id: { in: pagos.map((pago) => pago.conceptoId) },
        inicio: { gte: this.abre(desde), lt: this.cierra(hasta) },
      },
      select: {
        id: true,
        esPico: true,
        socioId: true,
        cancha: { select: { nombre: true, techada: true } },
      },
    });

    const porId = new Map(reservas.map((reserva) => [reserva.id, reserva]));

    return pagos.flatMap((pago) => {
      const reserva = porId.get(pago.conceptoId);
      if (!reserva) return [];

      return [
        {
          montoClp: pago.montoClp,
          concepto: 'ARRIENDO' as const,
          cancha: reserva.cancha.nombre,
          techada: reserva.cancha.techada,
          esPico: reserva.esPico,
          esSocio: reserva.socioId !== null,
        },
      ];
    });
  }

  /**
   * Las cuotas pagadas, puestas en su período.
   *
   * **Todas salen de `Cuota` y ninguna de `Transaccion`**, incluidas las de Webpay. Es
   * lo que evita contarlas dos veces: una cuota pagada en línea deja fila en las dos
   * tablas, y sumar ambas duplicaría la plata sin que nada avisara.
   */
  private async cuotas(desde: string, hasta: string): Promise<Movimiento[]> {
    const pagadas = await this.prisma.cuota.findMany({
      where: {
        estado: EstadoCuota.PAGADA,
        periodo: { in: this.periodosEntre(desde, hasta) },
      },
      select: { tipo: true, montoClp: true, descuentoClp: true },
    });

    return pagadas.map((cuota) => ({
      // Lo cobrado, no lo emitido: el descuento nunca entró a la caja.
      montoClp: cuota.montoClp - cuota.descuentoClp,
      concepto:
        cuota.tipo === TipoCuota.INCORPORACION
          ? ('CUOTA_INCORPORACION' as const)
          : ('CUOTA_MENSUAL' as const),
      cancha: null,
      techada: null,
      esPico: null,
      esSocio: true,
    }));
  }

  /** Lo emitido y todavía no cobrado de esos períodos. */
  private async cuotasImpagas(desde: string, hasta: string): Promise<number> {
    const pendientes = await this.prisma.cuota.findMany({
      where: {
        estado: EstadoCuota.PENDIENTE,
        periodo: { in: this.periodosEntre(desde, hasta) },
      },
      select: { montoClp: true, descuentoClp: true },
    });

    return pendientes.reduce(
      (suma, cuota) => suma + cuota.montoClp - cuota.descuentoClp,
      0,
    );
  }

  /**
   * Los períodos "AAAA-MM" que caen dentro del rango.
   *
   * **Un período entra cuando su día 1 cae dentro del rango**, y no cuando el rango lo
   * toca por cualquier lado. Si no, pedir del 10 al 20 de agosto traería la cuota
   * completa de agosto y el club leería como ingreso de once días la plata de un mes.
   */
  private periodosEntre(desde: string, hasta: string): string[] {
    const fin = fechaDelClub(hasta);
    const periodos: string[] = [];

    // Desde el día 1 del mes de `desde`, avanzando de mes en mes.
    const mes = fechaDelClub(desde);
    mes.setUTCDate(1);

    while (mes.getTime() <= fin.getTime()) {
      if (mes.getTime() >= fechaDelClub(desde).getTime()) {
        periodos.push(comoFechaCivil(mes).slice(0, 7));
      }
      mes.setUTCMonth(mes.getUTCMonth() + 1);
    }

    return periodos;
  }

  /** El instante en que empieza el primer día del rango, en el reloj del club. */
  private abre(desde: string): Date {
    return instanteEnElClub(desde, '00:00');
  }

  /** El instante en que termina el último día: la medianoche del siguiente. */
  private cierra(hasta: string): Date {
    const siguiente = fechaDelClub(hasta);
    siguiente.setUTCDate(siguiente.getUTCDate() + 1);

    return instanteEnElClub(comoFechaCivil(siguiente), '00:00');
  }
}
