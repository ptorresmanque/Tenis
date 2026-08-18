import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ConceptoPago } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasarelaPago } from './pasarela.port';

/**
 * Lo que `reservas` o `cuotas` piden cobrar.
 *
 * **No hay ningún campo que venga del cliente sin recalcular.** El `montoClp` lo pone
 * el servidor con `franjaPara()` o el valor de la cuota; `SPEC.md` § Boundaries lo
 * dice sin matices: nunca se confía en un precio que llega del navegador.
 */
export interface SolicitudPago {
  concepto: ConceptoPago;
  /** Id de la reserva o de la cuota. `pagos` no lo interpreta. */
  conceptoId: number;
  /** Entero CLP, calculado por el servidor. */
  montoClp: number;
  /** Nulo para el no-socio, que paga sin cuenta. */
  usuarioId?: number | null;
  /** Inicio del bloque comprado, para la ventana de reembolso de T24. */
  inicioBloqueOriginal?: Date | null;
  urlRetorno: string;
}

export interface PagoIniciado {
  transaccionId: number;
  referencia: string;
  urlRedireccion: string;
}

@Injectable()
export class PagosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pasarela: PasarelaPago,
  ) {}

  /**
   * Crea la `Transaccion` en `PENDIENTE` y devuelve a dónde mandar a la persona.
   *
   * La transacción se escribe **antes** de llamar a la pasarela: si la llamada falla
   * o el navegador se cierra a mitad de camino, queda el rastro de que alguien
   * intentó pagar. Una pendiente sin token la barre la expiración de T19; una que no
   * existe no la recupera nadie.
   */
  async iniciar(solicitud: SolicitudPago): Promise<PagoIniciado> {
    exigirMontoCobrable(solicitud.montoClp);

    const referencia = nuevaReferencia();

    const transaccion = await this.prisma.transaccion.create({
      data: {
        referencia,
        concepto: solicitud.concepto,
        conceptoId: solicitud.conceptoId,
        usuarioId: solicitud.usuarioId ?? null,
        inicioBloqueOriginal: solicitud.inicioBloqueOriginal ?? null,
        montoClp: solicitud.montoClp,
        pasarela: this.pasarela.nombre,
      },
      select: { id: true },
    });

    const inicio = await this.pasarela.iniciar({
      referencia,
      montoClp: solicitud.montoClp,
      urlRetorno: solicitud.urlRetorno,
    });

    // El token es lo único que trae el callback: sin guardarlo, la vuelta de la
    // pasarela no se puede asociar a ninguna transacción.
    await this.prisma.transaccion.update({
      where: { id: transaccion.id },
      data: { tokenPasarela: inicio.tokenPasarela },
    });

    return {
      transaccionId: transaccion.id,
      referencia,
      urlRedireccion: inicio.urlRedireccion,
    };
  }
}

/**
 * El identificador que viaja a la pasarela y vuelve en sus registros.
 *
 * Aleatorio y no el id de la fila: un correlativo le cuenta a cualquiera cuántos
 * pagos lleva el club, y además hace falta antes de que la fila exista.
 *
 * **26 caracteres porque es lo que acepta la orden de compra de Webpay** (T17). Un
 * UUID con guiones mide 36 y el pago moriría con un error de validación del SDK que
 * parece un problema de Transbank. Son 104 bits de azar: el choque contra el índice
 * único no va a pasar, y si pasara, el `create` falla y no se cobra dos veces.
 */
function nuevaReferencia(): string {
  return randomUUID().replace(/-/g, '').slice(0, 26);
}

/**
 * Que el monto sea un entero positivo, antes de escribirlo.
 *
 * La columna es `Int`, pero MySQL no rechaza un decimal: lo trunca en silencio, y
 * $12.000,5 se guarda como $12.000 mientras la pasarela cobra otra cosa. Al
 * confirmar, ese desajuste queda indistinguible de una manipulación y T18 manda la
 * transacción a revisión manual por un error que nadie cometió.
 */
function exigirMontoCobrable(montoClp: number): void {
  if (!Number.isInteger(montoClp)) {
    throw new Error(
      `El monto a cobrar tiene que ser un entero en pesos: llegó ${montoClp}.`,
    );
  }

  if (montoClp <= 0) {
    // Un cobro de $0 es un socio dentro de su cupo: `reservas` no crea transacción,
    // no crea una de cero. Uno negativo es una devolución por la puerta de atrás.
    throw new Error(
      `El monto a cobrar tiene que ser mayor que cero: ${montoClp}.`,
    );
  }
}
