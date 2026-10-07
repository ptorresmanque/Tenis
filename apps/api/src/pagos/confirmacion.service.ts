import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import {
  EstadoTransaccion,
  Prisma,
  Transaccion,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { transicionar } from './estados';
import { PasarelaPago, ResultadoPago } from './pasarela.port';

/**
 * Lo que hay que hacer cuando el pago se confirma: confirmar la reserva, marcar la
 * cuota pagada. Corre **dentro de la misma transacción de base** que el cambio de
 * estado, así que recibe el cliente transaccional y no el global.
 *
 * Es un parámetro y no un puerto con su interfaz: hay un solo consumidor previsto
 * (T23) y una función alcanza. Cuando aparezca el segundo, se verá.
 */
export type EfectoDePago = (
  tx: Prisma.TransactionClient,
  transaccion: Transaccion,
) => Promise<void>;

export interface ResultadoConfirmacion {
  transaccionId: number;
  estado: EstadoTransaccion;
  montoClp: number;
  codigoAutorizacion: string | null;
  ultimosDigitos: string | null;
  motivoRechazo: string | null;
  /** Algo no cuadra y lo tiene que mirar una persona. */
  requiereRevision: boolean;
}

@Injectable()
export class ConfirmacionService {
  private readonly log = new Logger('Pagos');

  constructor(
    private readonly prisma: PrismaService,
    private readonly pasarela: PasarelaPago,
  ) {}

  /**
   * Confirma un pago y aplica su efecto de negocio, **una sola vez**.
   *
   * Las pasarelas reintentan el callback y la gente recarga la página de retorno. Sin
   * esto, la misma vuelta crea dos reservas del mismo bloque o cobra dos veces.
   */
  async confirmar(
    tokenPasarela: string,
    aplicarEfecto?: EfectoDePago,
  ): Promise<ResultadoConfirmacion> {
    const transaccion = await this.prisma.transaccion.findUnique({
      where: { tokenPasarela },
    });

    if (!transaccion) {
      // Un token que no emitimos. Puede ser un callback cruzado o alguien probando:
      // en los dos casos no hay nada que confirmar.
      throw new NotFoundException('No hay una transacción con ese token.');
    }

    if (transaccion.estado !== EstadoTransaccion.PENDIENTE) {
      // Ya resuelta. Se responde con lo guardado **sin preguntarle a la pasarela**:
      // contra Webpay, un segundo commit del mismo token es un error, así que
      // preguntar de nuevo convertiría una recarga de página en una falla.
      return this.resultadoGuardado(transaccion);
    }

    let resultado: ResultadoPago;
    try {
      resultado = await this.pasarela.confirmar(tokenPasarela);
    } catch (error) {
      // Dos callbacks a la vez alcanzan los dos a preguntar, y Webpay responde 422 al
      // segundo `commit` del mismo token —se vio así contra integración en T17—. Si
      // mientras tanto la otra llamada ya resolvió la transacción, esto no es una
      // falla: quien recargó la página tiene que ver su pago, no un error.
      const resuelta = await this.esperarAQueOtroResuelva(transaccion.id);

      if (resuelta) return this.resultadoGuardado(resuelta);

      // Nadie más la resolvió: la pasarela falló de verdad y la transacción sigue
      // pendiente. Que se entere quien llamó.
      throw error;
    }

    // El monto que reporta la pasarela contra el que calculó el servidor. Distinto es
    // manipulación o un bug, y en los dos casos confirmar la reserva sería regalar
    // una cancha o cobrar de menos sin que nadie se entere.
    const montoCuadra = resultado.montoClp === transaccion.montoClp;
    const autorizada = resultado.estado === 'AUTORIZADA';

    if (!montoCuadra) {
      this.log.error(
        `Transacción ${transaccion.id}: la pasarela reportó ${resultado.montoClp} ` +
          `y se había registrado ${transaccion.montoClp}. Queda para revisión manual.`,
      );
    }

    const estadoNuevo = transicionar(
      transaccion.estado,
      autorizada ? EstadoTransaccion.AUTORIZADA : EstadoTransaccion.RECHAZADA,
    );

    // Todo junto: el cambio de estado y el efecto. O las dos cosas, o ninguna — una
    // transacción AUTORIZADA sin su reserva es un cobro que nadie puede explicar.
    const confirmada = await this.prisma.$transaction(async (tx) => {
      // Compare-and-set: solo gana quien la encuentre todavía PENDIENTE. Dos
      // callbacks a la vez llegan los dos hasta acá, y la base decide cuál escribe.
      const { count } = await tx.transaccion.updateMany({
        where: { id: transaccion.id, estado: EstadoTransaccion.PENDIENTE },
        data: {
          estado: estadoNuevo,
          codigoAutorizacion: resultado.codigoAutorizacion,
          ultimosDigitos: resultado.ultimosDigitos,
          confirmadaEn: new Date(),
          requiereRevision: !montoCuadra,
        },
      });

      if (count === 0) {
        // Perdió la carrera. El efecto ya lo aplicó quien ganó.
        return null;
      }

      const actualizada = await tx.transaccion.findUniqueOrThrow({
        where: { id: transaccion.id },
      });

      if (aplicarEfecto && autorizada && montoCuadra) {
        await aplicarEfecto(tx, actualizada);
      }

      return actualizada;
    });

    if (confirmada === null) {
      // La perdedora responde con lo que escribió la ganadora, no con un error: para
      // quien recargó la página, el pago salió bien y eso es lo que tiene que ver.
      return this.resultadoGuardado(
        await this.prisma.transaccion.findUniqueOrThrow({
          where: { id: transaccion.id },
        }),
      );
    }

    return {
      transaccionId: confirmada.id,
      estado: confirmada.estado,
      montoClp: confirmada.montoClp,
      codigoAutorizacion: confirmada.codigoAutorizacion,
      ultimosDigitos: confirmada.ultimosDigitos,
      motivoRechazo: autorizada ? null : resultado.motivoRechazo,
      requiereRevision: confirmada.requiereRevision,
    };
  }

  /**
   * Espera a que la otra llamada termine de escribir, o se rinde.
   *
   * Cuando dos callbacks llegan juntos, la perdedora recibe el 422 de la pasarela
   * **antes** de que la ganadora alcance a cerrar su transacción de base: releer al
   * instante muestra la fila todavía pendiente. Sin esta espera, quien recargó la
   * página ve un error por un pago que sí se procesó.
   *
   * `ponytail: sondeo de medio segundo como mucho. Si algún día la escritura tarda
   * más que eso, la salida es tomar el turno con un CAS antes de llamar a la pasarela,
   * no alargar la espera.`
   */
  private async esperarAQueOtroResuelva(
    id: number,
    intentos = 5,
  ): Promise<Transaccion | null> {
    for (let intento = 0; intento < intentos; intento++) {
      const transaccion = await this.prisma.transaccion.findUniqueOrThrow({
        where: { id },
      });

      if (transaccion.estado !== EstadoTransaccion.PENDIENTE) {
        return transaccion;
      }

      await new Promise((sigue) => setTimeout(sigue, 100));
    }

    return null;
  }

  /**
   * El resultado de una transacción ya resuelta.
   *
   * Si estaba `EXPIRADA`, la marca para revisión: el barrido de los 15 minutos ya
   * liberó el bloque, así que un cobro que llega después es plata que puede haber
   * entrado sin nada a cambio.
   */
  private async resultadoGuardado(
    transaccion: Transaccion,
  ): Promise<ResultadoConfirmacion> {
    const revisar =
      transaccion.requiereRevision ||
      transaccion.estado === EstadoTransaccion.EXPIRADA;

    if (revisar && !transaccion.requiereRevision) {
      await this.prisma.transaccion.update({
        where: { id: transaccion.id },
        data: { requiereRevision: true },
      });
      this.log.error(
        `Transacción ${transaccion.id}: llegó una confirmación cuando ya estaba ` +
          `${transaccion.estado}. Queda para revisión manual.`,
      );
    }

    return {
      transaccionId: transaccion.id,
      estado: transaccion.estado,
      montoClp: transaccion.montoClp,
      codigoAutorizacion: transaccion.codigoAutorizacion,
      ultimosDigitos: transaccion.ultimosDigitos,
      // El motivo del rechazo no se guarda: lo que importa después es el estado, y
      // el texto de la pasarela sirve en el momento, para quien está mirando.
      motivoRechazo: null,
      requiereRevision: revisar,
    };
  }
}
