import { Injectable, Logger } from '@nestjs/common';

import {
  EstadoReserva,
  EstadoTransaccion,
  Prisma,
} from '../generated/prisma/client';
import { AnulacionService } from '../pagos/anulacion.service';
import { ConfirmacionService } from '../pagos/confirmacion.service';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import { EventosDeReserva } from './eventos';

/** A dónde vuelve quien pagó, o no, la diferencia de un cambio. */
export interface VueltaDeDiferencia {
  estado: 'CAMBIADA' | 'SIN_CAMBIO';
  /** El de la reserva, para volver a su página. Nulo si el pago no era de nadie. */
  token: string | null;
  motivo: string | null;
  /** Lo devuelto cuando la hora se tomó mientras se pagaba (T90); cero si falló. */
  devueltoClp?: number;
}

const SIN_CAMBIO_PENDIENTE = {
  cambioCanchaId: null,
  cambioInicio: null,
  cambioFin: null,
  cambioEsPico: null,
  cambioTransaccionId: null,
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
    private readonly anulacion: AnulacionService,
  ) {}

  /**
   * Autorizada: la reserva pasa al destino que esperaba en `cambio*`, **en la misma
   * transacción de base que autoriza el pago**. Rechazada: queda exactamente como estaba.
   */
  async confirmar(tokenPasarela: string): Promise<VueltaDeDiferencia> {
    const transaccion = await this.prisma.transaccion.findUnique({
      where: { tokenPasarela },
      select: {
        id: true,
        conceptoId: true,
        concepto: true,
        estado: true,
        requiereRevision: true,
        montoClp: true,
      },
    });

    if (!transaccion || transaccion.concepto !== 'RESERVA') {
      this.log.warn(
        'Volvió el pago de una diferencia con un token que no reconocemos.',
      );
      return { estado: 'SIN_CAMBIO', token: null, motivo: 'token_desconocido' };
    }

    const antes = await this.prisma.reserva.findUniqueOrThrow({
      where: { id: transaccion.conceptoId },
      select: { token: true, inicio: true, cambioTransaccionId: true },
    });

    // Ya resuelta: es una recarga de la página de vuelta, y se responde con lo que pasó.
    if (transaccion.estado !== EstadoTransaccion.PENDIENTE) {
      return this.yaResuelta(transaccion, antes);
    }

    // **Solo se confirma el pago del cambio en curso.** Otro —una diferencia que un pedido
    // simultáneo dejó sin destino, o el pago original llamado por esta ruta— no se
    // confirma: sin commit en Webpay no hay cobro, y el barrido lo expira. Confirmarlo
    // sería cobrar sin mover nada.
    if (antes.cambioTransaccionId !== transaccion.id) {
      this.log.warn(
        `El pago ${transaccion.id} volvió por la ruta de la diferencia sin ser el ` +
          'cambio en curso de su reserva. No se confirma.',
      );
      return {
        estado: 'SIN_CAMBIO',
        token: antes.token,
        motivo: 'no_corresponde',
      };
    }

    const resultado = await this.confirmacion.confirmar(
      tokenPasarela,
      (tx, pago) => aplicarElCambio(tx, pago.conceptoId, pago.id),
    );

    // Con el monto que no cuadra, `pagos` la deja AUTORIZADA para revisión y sin aplicar
    // el efecto: la reserva no se movió, y decir "cambiada" sería mentir.
    if (resultado.estado === 'AUTORIZADA' && !resultado.requiereRevision) {
      const despues = await this.prisma.reserva.findUniqueOrThrow({
        where: { id: transaccion.conceptoId },
        select: { inicio: true, cambioTransaccionId: true },
      });

      // El efecto limpia `cambio*` al mover. Si sigue ahí, no pudo: la hora se tomó, se
      // bloqueó o la reserva ya no está activa (T90). La reserva se queda donde estaba y
      // la diferencia se devuelve entera, **después** de que la transacción confirmó.
      if (despues.cambioTransaccionId === transaccion.id) {
        return this.devolverLaDiferencia(transaccion, antes.token);
      }

      // Los dos días cambian: la hora se fue de uno y llegó al otro.
      this.eventos.cambio(antes.inicio);
      this.eventos.cambio(despues.inicio);

      return { estado: 'CAMBIADA', token: antes.token, motivo: null };
    }

    await this.olvidarElCambio(transaccion.conceptoId, transaccion.id);

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
      select: { id: true, conceptoId: true, concepto: true },
    });

    if (!transaccion || transaccion.concepto !== 'RESERVA') {
      return { estado: 'SIN_CAMBIO', token: null, motivo: 'anulado' };
    }

    await this.olvidarElCambio(transaccion.conceptoId, transaccion.id);

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

  /**
   * La diferencia de un cambio que no se aplicó: se anula entera. Si la pasarela no la
   * devuelve, la transacción queda para revisión manual y la reserva, intacta.
   */
  private async devolverLaDiferencia(
    transaccion: { id: number; conceptoId: number },
    token: string,
  ): Promise<VueltaDeDiferencia> {
    const { montoClp } = await this.prisma.transaccion.findUniqueOrThrow({
      where: { id: transaccion.id },
      select: { montoClp: true },
    });
    let devueltoClp = 0;

    try {
      await this.anulacion.anular(transaccion.id);
      devueltoClp = montoClp;
    } catch (falla) {
      await this.anulacion.marcarParaRevision(
        transaccion.id,
        `la hora del cambio se tomó mientras se pagaba y no se pudo devolver: ${String(falla)}`,
      );
    }

    await this.olvidarElCambio(transaccion.conceptoId, transaccion.id);

    return { estado: 'SIN_CAMBIO', token, motivo: 'hora_tomada', devueltoClp };
  }

  /**
   * Lo que pasó con un pago que ya volvió antes. **La compra nunca es un cambio**, aunque
   * esté autorizada: con su token armado a mano en esta ruta, decir "cambio hecho" sería
   * mentir. Es la primera transacción de la reserva.
   */
  private async yaResuelta(
    transaccion: {
      id: number;
      conceptoId: number;
      estado: EstadoTransaccion;
      requiereRevision: boolean;
      montoClp: number;
    },
    reserva: { token: string; cambioTransaccionId: number | null },
  ): Promise<VueltaDeDiferencia> {
    const { token } = reserva;
    const compra = await this.prisma.transaccion.findFirst({
      where: { concepto: 'RESERVA', conceptoId: transaccion.conceptoId },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    if (compra?.id === transaccion.id) {
      return { estado: 'SIN_CAMBIO', token, motivo: 'no_corresponde' };
    }

    if (transaccion.requiereRevision) {
      return { estado: 'SIN_CAMBIO', token, motivo: 'en_revision' };
    }

    switch (transaccion.estado) {
      case EstadoTransaccion.AUTORIZADA:
        // Cobrada y con `cambio*` todavía apuntándole: el efecto no pudo mover y la
        // devolución no terminó —la primera vuelta la está esperando, o el proceso se
        // cayó antes—. Se devuelve acá; anular es idempotente y con lock, así que no
        // sale dos veces.
        //
        // `ponytail: si nadie recarga después de una caída, la diferencia queda cobrada
        // sin rastro hasta que la persona llame. La salida es que el barrido reintente
        // las autorizadas que `cambio*` sigue nombrando.`
        if (reserva.cambioTransaccionId === transaccion.id) {
          return this.devolverLaDiferencia(transaccion, token);
        }

        return { estado: 'CAMBIADA', token, motivo: null };
      // Anulada es la diferencia devuelta porque la hora se tomó (T90): la recarga
      // dice lo mismo que la primera vez.
      case EstadoTransaccion.ANULADA:
        return {
          estado: 'SIN_CAMBIO',
          token,
          motivo: 'hora_tomada',
          devueltoClp: transaccion.montoClp,
        };
      default:
        return {
          estado: 'SIN_CAMBIO',
          token,
          motivo: transaccion.estado.toLowerCase(),
        };
    }
  }

  /**
   * Las columnas `cambio*` se limpian en la vuelta (`SPEC-reservas.md`), si son de este
   * pago.
   */
  private async olvidarElCambio(
    reservaId: number,
    transaccionId: number,
  ): Promise<void> {
    // Solo si el cambio es de este pago: la vuelta de otro no borra el cambio vigente.
    await this.prisma.reserva.updateMany({
      where: { id: reservaId, cambioTransaccionId: transaccionId },
      data: SIN_CAMBIO_PENDIENTE,
    });
  }
}

/**
 * El efecto de negocio del pago: mueve la reserva al destino y limpia `cambio*`.
 *
 * **Si no puede, no lanza** (T90): la hora no se retuvo mientras se pagaba, y si otra
 * persona la tomó, el club la bloqueó o la reserva ya no está activa, la reserva se queda
 * donde estaba con `cambio*` escrito, y quien llamó devuelve la diferencia. Lanzar
 * revertiría la autorización del pago que la pasarela ya cobró.
 */
async function aplicarElCambio(
  tx: Prisma.TransactionClient,
  reservaId: number,
  transaccionId: number,
): Promise<void> {
  const reserva = await tx.reserva.findUniqueOrThrow({
    where: { id: reservaId },
  });

  // De nuevo adentro de la transacción: entre el chequeo de afuera y este momento, otro
  // pedido pudo dejar su destino.
  if (
    reserva.cambioTransaccionId !== transaccionId ||
    reserva.cambioCanchaId === null ||
    reserva.cambioInicio === null ||
    reserva.cambioFin === null
  ) {
    return;
  }

  // Lo que el índice no ve: la reserva cancelada mientras se pagaba, y la cancha que el
  // club bloqueó en el destino.
  const bloqueada = await tx.bloqueo.count({
    where: {
      canchaId: reserva.cambioCanchaId,
      inicio: { lt: reserva.cambioFin },
      fin: { gt: reserva.cambioInicio },
    },
  });

  if (reserva.estado !== EstadoReserva.CONFIRMADA || bloqueada > 0) return;

  try {
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
  } catch (error) {
    // Otra reserva tomó la hora mientras se pagaba: el índice por rango lo rechaza. Se
    // captura y la transacción sigue viva —MariaDB revierte la sentencia, no la
    // transacción; está probado en `reservas-concurrencia`—.
    if (!esViolacionDeUnicidad(error)) throw error;
  }
}
