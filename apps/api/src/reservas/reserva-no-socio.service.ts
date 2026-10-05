import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { DuracionMin } from '../catalogo-canchas/bloques';
import { DisponibilidadService } from '../catalogo-canchas/disponibilidad.service';
import { hoyEnElClub } from '../comun/tiempo';
import { ConceptoPago, EstadoReserva } from '../generated/prisma/client';
import { ConfirmacionService } from '../pagos/confirmacion.service';
import { PagosService } from '../pagos/pagos.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventosDeReserva } from './eventos';
import { BloqueTomado, ReservaRepository } from './reserva.repository';
import { rechazarSiYaPaso } from './reservas.service';

export interface ReservaDeNoSocio {
  canchaId: number;
  inicio: Date;
  /** 1 hora o 1 hora y media (T82). Cobra el precio de esa duración. */
  duracionMin: DuracionMin;
  nombre: string;
  email: string;
  telefono: string;
}

export interface PagoDeReservaIniciado {
  reservaId: number;
  folio: string;
  montoClp: number;
  urlRedireccion: string;
  /** Se manda como `token_ws` en el POST a la pasarela. Ver `PagoIniciado`. */
  tokenPasarela: string;
}

/** Cómo terminó la vuelta desde la pasarela, para armar la redirección. */
export interface RetornoDePago {
  estado: 'CONFIRMADA' | 'RECHAZADA' | 'ERROR';
  folio: string | null;
  /** La llave de la página pública, para que la confirmación pueda mostrar el QR. */
  token: string | null;
  motivo: string | null;
}

@Injectable()
export class ReservaNoSocioService {
  private readonly log = new Logger('Reservas');

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: DisponibilidadService,
    private readonly reservas: ReservaRepository,
    private readonly pagos: PagosService,
    private readonly confirmacion: ConfirmacionService,
    private readonly eventos: EventosDeReserva,
  ) {}

  /**
   * Toma el bloque y manda a pagar.
   *
   * La reserva se crea **antes** de hablar con la pasarela y en estado
   * `PENDIENTE_PAGO`: así el bloque queda tomado mientras la persona teclea su
   * tarjeta. Al revés, dos visitantes podrían pagar la misma hora y uno de los dos
   * cobros habría que devolverlo.
   */
  async iniciar(
    datos: ReservaDeNoSocio,
    urlRetorno: string,
    ahora = new Date(),
  ): Promise<PagoDeReservaIniciado> {
    const bloque = await this.bloqueCobrable(
      datos.canchaId,
      datos.inicio,
      datos.duracionMin,
      ahora,
    );

    const reserva = await this.crearPendiente(datos, bloque);

    try {
      const pago = await this.pagos.iniciar({
        concepto: ConceptoPago.RESERVA,
        conceptoId: reserva.id,
        // **El monto sale del catálogo, nunca del cliente.** El DTO no acepta ningún
        // campo de precio, y acá se recalcula igual (`SPEC.md` § Boundaries).
        montoClp: bloque.montoClp,
        // El bloque comprado, congelado para la ventana de reembolso de T24: sin
        // esto, reagendar reiniciaría el derecho a devolución.
        inicioBloqueOriginal: bloque.inicio,
        urlRetorno,
      });

      return {
        reservaId: reserva.id,
        folio: reserva.folio,
        montoClp: bloque.montoClp,
        urlRedireccion: pago.urlRedireccion,
        tokenPasarela: pago.tokenPasarela,
      };
    } catch (error) {
      // La pasarela no aceptó la orden: el bloque vuelve a la grilla enseguida.
      // Esperar los 15 minutos del barrido por un pago que nunca empezó es una hora
      // de cancha perdida por nada.
      await this.reservas.expirar(reserva.id);
      throw error;
    }
  }

  /**
   * La vuelta desde la pasarela: confirma el pago y con él la reserva.
   *
   * **Confirmar la reserva es el efecto de negocio** que `ConfirmacionService` aplica
   * dentro de su propia transacción (T18). Por eso una recarga de esta página no crea
   * dos reservas ni cobra dos veces: la idempotencia ya está resuelta ahí.
   */
  async confirmarDesdeRetorno(tokenPasarela: string): Promise<RetornoDePago> {
    const transaccion = await this.prisma.transaccion.findUnique({
      where: { tokenPasarela },
      select: { conceptoId: true },
    });

    if (!transaccion) {
      this.log.warn('Volvió un pago con un token que no reconocemos.');
      return {
        estado: 'ERROR',
        folio: null,
        token: null,
        motivo: 'token_desconocido',
      };
    }

    const reserva = await this.prisma.reserva.findUnique({
      where: { id: transaccion.conceptoId },
      // `inicio` para el aviso al panel del admin: el evento viaja por el día del
      // club al que pertenece el bloque.
      select: { id: true, folio: true, token: true, inicio: true },
    });

    const resultado = await this.confirmacion.confirmar(
      tokenPasarela,
      (tx, transaccionConfirmada) =>
        tx.reserva
          .updateMany({
            where: {
              id: transaccionConfirmada.conceptoId,
              estado: EstadoReserva.PENDIENTE_PAGO,
            },
            data: { estado: EstadoReserva.CONFIRMADA },
          })
          .then(() => undefined),
    );

    if (resultado.estado === 'AUTORIZADA') {
      // El aviso al panel va acá y no en el repositorio: confirmar la reserva es un
      // `updateMany` dentro de la transacción del pago, que es el único camino de
      // escritura que no pasa por `ReservaRepository`. Es además el evento de la
      // demo, así que quedarse sin él se nota.
      if (reserva) this.eventos.cambio(reserva.inicio);

      return {
        estado: 'CONFIRMADA',
        folio: reserva?.folio ?? null,
        token: reserva?.token ?? null,
        motivo: null,
      };
    }

    // Rechazado, expirado o marcado para revisión: la hora vuelve a la grilla. Quien
    // quiera esa cancha tiene que poder tomarla de nuevo.
    if (reserva) await this.reservas.expirar(reserva.id);

    return {
      estado: 'RECHAZADA',
      folio: reserva?.folio ?? null,
      token: null,
      motivo: resultado.motivoRechazo,
    };
  }

  /**
   * Alguien anuló en la pantalla de la pasarela: la hora se libera.
   *
   * **Llega la referencia de la transacción, no el folio de la reserva.** Es lo que
   * viajó a Webpay como `buyOrder` y lo único que Webpay conoce de nosotros; buscar
   * por folio no encontraría nada y el bloque quedaría tomado los 15 minutos del
   * barrido, por un pago que la persona canceló a propósito.
   */
  async anularDesdeRetorno(referencia: string): Promise<RetornoDePago> {
    const transaccion = await this.prisma.transaccion.findUnique({
      where: { referencia },
      select: { conceptoId: true },
    });

    const reserva = transaccion
      ? await this.prisma.reserva.findUnique({
          where: { id: transaccion.conceptoId },
          select: { id: true, folio: true },
        })
      : null;

    if (reserva) await this.reservas.expirar(reserva.id);

    return {
      estado: 'RECHAZADA',
      folio: reserva?.folio ?? null,
      // La hora quedó liberada: no hay reserva viva a la que llevar con un enlace.
      token: null,
      motivo: 'anulado',
    };
  }

  /**
   * El bloque con su precio de verdad, verificando que se pueda vender.
   *
   * Se toma del catálogo y no de lo que mande el cliente: una hora inventada, fuera
   * del horario, en mantención o que ya empezó se rechaza acá, antes de crear nada.
   */
  private async bloqueCobrable(
    canchaId: number,
    inicio: Date,
    duracionMin: DuracionMin,
    ahora: Date,
  ) {
    const fecha = hoyEnElClub(inicio).toISOString().slice(0, 10);
    const bloques = await this.catalogo.de(canchaId, fecha, duracionMin);
    const bloque = bloques.find((b) => b.inicio.getTime() === inicio.getTime());

    if (!bloque) {
      throw new NotFoundException(
        'Esa hora no está en el horario de la cancha.',
      );
    }

    rechazarSiYaPaso(bloque, ahora);

    if (bloque.bloqueado) {
      throw new ConflictException({
        motivo: 'BLOQUE_NO_DISPONIBLE',
        message: `Esa hora no está disponible: ${bloque.motivoBloqueo ?? 'la cancha está cerrada'}.`,
      });
    }

    if (bloque.montoClp === null) {
      // La hora y media en una franja sin ese precio (T79): ahí no se vende. La grilla
      // no la ofrece, pero quien la pida a mano no puede comprarla igual.
      throw new ConflictException({
        motivo: 'SIN_TARIFA',
        message: 'Esa duración no se vende en ese horario.',
      });
    }

    if (bloque.montoClp <= 0) {
      // Sin tarifa que cobrar no hay reserva de no-socio: el panel del admin advierte
      // de estos bloques desde T13, y cobrar $0 sería regalar la cancha en silencio.
      throw new ConflictException({
        motivo: 'SIN_TARIFA',
        message: 'Esa hora todavía no tiene tarifa publicada.',
      });
    }

    return { ...bloque, montoClp: bloque.montoClp };
  }

  private async crearPendiente(
    datos: ReservaDeNoSocio,
    bloque: { inicio: Date; fin: Date; esPico: boolean },
  ) {
    try {
      return await this.reservas.crear({
        canchaId: datos.canchaId,
        inicio: bloque.inicio,
        fin: bloque.fin,
        esPico: bloque.esPico,
        estado: EstadoReserva.PENDIENTE_PAGO,
        nombre: datos.nombre,
        email: datos.email,
        telefono: datos.telefono,
      });
    } catch (error) {
      if (error instanceof BloqueTomado) {
        throw new ConflictException({
          motivo: 'BLOQUE_TOMADO',
          message: error.message,
        });
      }

      throw error;
    }
  }
}
