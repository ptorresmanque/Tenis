import { Injectable, Logger } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { ConfirmacionService } from '../pagos/confirmacion.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventosDeReserva } from './eventos';

/** A dónde vuelve quien pagó, o no, la diferencia de un cambio. */
export interface VueltaDeDiferencia {
  estado: 'CAMBIADA' | 'SIN_CAMBIO';
  /** El de la reserva, para volver a su página. Nulo si el pago no era de nadie. */
  token: string | null;
  motivo: string | null;
}

const SIN_CAMBIO_PENDIENTE = {
  cambioCanchaId: null,
  cambioInicio: null,
  cambioFin: null,
  cambioEsPico: null,
};

/**
 * La vuelta de Webpay del pago de una diferencia (T89).
 *
 * Aparte de la vuelta del pago original, que confirma una reserva PENDIENTE_PAGO: esta
 * mueve una reserva CONFIRMADA a su destino, y mezclarlas obligaría a cada una a
 * adivinar cuál de las dos es.
 */
@Injectable()
export class RetornoDeDiferencia {
  private readonly log = new Logger('Reservas');

  constructor(
    private readonly prisma: PrismaService,
    private readonly confirmacion: ConfirmacionService,
    private readonly eventos: EventosDeReserva,
  ) {}

  /**
   * Autorizada: la reserva pasa al destino que esperaba en `cambio*`, **en la misma
   * transacción de base que autoriza el pago**. Rechazada: queda exactamente como estaba.
   */
  async confirmar(tokenPasarela: string): Promise<VueltaDeDiferencia> {
    const transaccion = await this.prisma.transaccion.findUnique({
      where: { tokenPasarela },
      select: { conceptoId: true },
    });

    if (!transaccion) {
      this.log.warn(
        'Volvió el pago de una diferencia con un token que no reconocemos.',
      );
      return { estado: 'SIN_CAMBIO', token: null, motivo: 'token_desconocido' };
    }

    const antes = await this.prisma.reserva.findUniqueOrThrow({
      where: { id: transaccion.conceptoId },
      select: { token: true, inicio: true },
    });

    const resultado = await this.confirmacion.confirmar(
      tokenPasarela,
      (tx, pago) => aplicarElCambio(tx, pago.conceptoId),
    );

    // Con el monto que no cuadra, `pagos` la deja AUTORIZADA para revisión y sin aplicar
    // el efecto: la reserva no se movió, y decir "cambiada" sería mentir.
    if (resultado.estado === 'AUTORIZADA' && !resultado.requiereRevision) {
      const despues = await this.prisma.reserva.findUniqueOrThrow({
        where: { id: transaccion.conceptoId },
        select: { inicio: true },
      });

      // Los dos días cambian: la hora se fue de uno y llegó al otro.
      this.eventos.cambio(antes.inicio);
      this.eventos.cambio(despues.inicio);

      return { estado: 'CAMBIADA', token: antes.token, motivo: null };
    }

    await this.olvidarElCambio(transaccion.conceptoId);

    return {
      estado: 'SIN_CAMBIO',
      token: antes.token,
      motivo: resultado.requiereRevision
        ? 'en_revision'
        : (resultado.motivoRechazo ?? 'rechazado'),
    };
  }

  /**
   * Quien apretó "anular compra" en Webpay: la reserva queda como estaba.
   *
   * La transacción no se toca: queda PENDIENTE hasta que el barrido la expire, y en esos
   * minutos la reserva no se puede volver a cambiar (`PAGO_EN_CURSO`). Cerrarla acá sería
   * cambiar el estado de un pago por lo que dice una URL sin autenticar: quien tuviera la
   * referencia podría expirar el pago de otra persona a mitad de camino.
   *
   * `ponytail: espera de hasta 15 minutos tras anular. Si molesta, la salida es preguntarle
   * el estado a la pasarela antes de expirar, no confiar en la URL.`
   */
  async anular(referencia: string): Promise<VueltaDeDiferencia> {
    const transaccion = await this.prisma.transaccion.findUnique({
      where: { referencia },
      select: { conceptoId: true },
    });

    if (!transaccion) {
      return { estado: 'SIN_CAMBIO', token: null, motivo: 'anulado' };
    }

    await this.olvidarElCambio(transaccion.conceptoId);

    const reserva = await this.prisma.reserva.findUnique({
      where: { id: transaccion.conceptoId },
      select: { token: true },
    });

    return {
      estado: 'SIN_CAMBIO',
      token: reserva?.token ?? null,
      motivo: 'anulado',
    };
  }

  /** Las columnas `cambio*` se limpian en la vuelta, sea cual sea (`SPEC-reservas.md`). */
  private async olvidarElCambio(reservaId: number): Promise<void> {
    await this.prisma.reserva.updateMany({
      where: { id: reservaId },
      data: SIN_CAMBIO_PENDIENTE,
    });
  }
}

/**
 * El efecto de negocio del pago: mueve la reserva al destino y limpia `cambio*`.
 *
 * Sin destino escrito no mueve nada. Que el destino ya no se pueda tomar —otra persona,
 * un bloqueo, un cierre— lo resuelve T90.
 */
async function aplicarElCambio(
  tx: Prisma.TransactionClient,
  reservaId: number,
): Promise<void> {
  const reserva = await tx.reserva.findUniqueOrThrow({
    where: { id: reservaId },
  });

  if (
    reserva.cambioCanchaId === null ||
    reserva.cambioInicio === null ||
    reserva.cambioFin === null
  ) {
    return;
  }

  await tx.reserva.update({
    where: { id: reservaId },
    data: {
      canchaId: reserva.cambioCanchaId,
      inicio: reserva.cambioInicio,
      fin: reserva.cambioFin,
      esPico: reserva.cambioEsPico ?? reserva.esPico,
      ...SIN_CAMBIO_PENDIENTE,
    },
  });
}
