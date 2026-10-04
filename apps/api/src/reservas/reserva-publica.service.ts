import { Injectable, NotFoundException } from '@nestjs/common';

import { EstadoReserva } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pagadoPor } from './pagado';
import { sePuedeModificar } from './ventanas';

/**
 * Lo que ve quien abre el enlace del QR.
 *
 * **Es deliberadamente menos que la ficha de la reserva.** Quien llega acá puede ser
 * portería, puede ser quien reservó, y puede ser cualquiera a quien le reenviaron el
 * enlace. Con esto alcanza para dejar entrar a alguien a la cancha; el teléfono y el
 * correo del titular no hacen falta para eso, así que no salen.
 */
export interface ReservaPublica {
  folio: string;
  cancha: string;
  inicio: string;
  fin: string;
  /** El titular, que es a quien portería espera ver aparecer. */
  nombre: string;
  esPico: boolean;
  estado: EstadoReserva;
  /** Cuántos entran además del titular, sin decir quiénes son. */
  acompanantes: number;
  /**
   * Lo pagado, sumando todos los pagos (T88). Es un dato para que la grilla muestre la
   * diferencia antes de cambiar; quien la cobra o no la cobra es el servidor, al mover.
   */
  pagadoClp: number;
  /** Si el enlace ofrece "Cambiar hora o duración": activa, de visitante y a tiempo. */
  sePuedeCambiar: boolean;
}

@Injectable()
export class ReservaPublicaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La reserva de ese token, o 404.
   *
   * El 404 es el mismo para un token mal escrito y para uno que no existe: decir
   * "ese enlace existía pero la reserva se canceló" ya sería contar algo de una
   * reserva ajena a quien probó una URL al azar.
   */
  async porToken(token: string, ahora = new Date()): Promise<ReservaPublica> {
    const reserva = await this.prisma.reserva.findUnique({
      where: { token },
      select: {
        id: true,
        socioId: true,
        folio: true,
        inicio: true,
        fin: true,
        nombre: true,
        esPico: true,
        estado: true,
        cancha: { select: { nombre: true } },
        _count: { select: { acompanantes: true } },
      },
    });

    if (!reserva) {
      throw new NotFoundException('No encontramos esa reserva.');
    }

    const ventanas = await this.prisma.configuracionClub.findFirstOrThrow();
    return {
      folio: reserva.folio,
      cancha: reserva.cancha.nombre,
      inicio: reserva.inicio.toISOString(),
      fin: reserva.fin.toISOString(),
      nombre: reserva.nombre,
      esPico: reserva.esPico,
      estado: reserva.estado,
      acompanantes: reserva._count.acompanantes,
      pagadoClp: await pagadoPor(this.prisma, reserva.id),
      // Las mismas condiciones que el servidor exige al mover por el enlace: el botón no
      // promete lo que la API va a rechazar.
      sePuedeCambiar:
        reserva.estado === EstadoReserva.CONFIRMADA &&
        reserva.socioId === null &&
        sePuedeModificar(reserva.inicio, ahora, ventanas),
    };
  }
}
