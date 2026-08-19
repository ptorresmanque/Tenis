import { Injectable } from '@nestjs/common';

import { instanteEnElClub } from '../comun/tiempo';
import { EstadoReserva } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACTIVAS } from './reservas.service';

/** Una hora del día, como la mira quien atiende el mesón. */
export interface ReservaDelDia {
  id: number;
  folio: string;
  cancha: string;
  inicio: Date;
  fin: Date;
  estado: EstadoReserva;
  /** De quién es la hora y cómo ubicarlo si el club tiene que avisar algo. */
  nombre: string;
  telefono: string;
  esSocio: boolean;
  /** Con quién juega: nombres de invitados y de socios acompañantes. */
  acompanantes: string[];
}

@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Las reservas activas de un día del club, de la más temprana a la más tardía.
   *
   * **El día se recorta en hora del club**, como todo lo demás: las 22:00 de un lunes
   * en Santiago son las 02:00Z del martes, así que cortando por UTC la hora más
   * disputada del día desaparecería del panel del lunes.
   *
   * @param fecha Fecha civil del club, "AAAA-MM-DD".
   */
  async delDia(fecha: string): Promise<ReservaDelDia[]> {
    const reservas = await this.prisma.reserva.findMany({
      where: {
        estado: { in: ACTIVAS },
        inicio: {
          gte: instanteEnElClub(fecha, '00:00'),
          lt: instanteEnElClub(fecha, '24:00'),
        },
      },
      orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        folio: true,
        inicio: true,
        fin: true,
        estado: true,
        nombre: true,
        telefono: true,
        socioId: true,
        cancha: { select: { nombre: true } },
        acompanantes: {
          select: {
            nombre: true,
            socio: { select: { usuario: { select: { nombre: true } } } },
          },
        },
      },
    });

    return reservas.map((reserva) => ({
      id: reserva.id,
      folio: reserva.folio,
      cancha: reserva.cancha.nombre,
      inicio: reserva.inicio,
      fin: reserva.fin,
      estado: reserva.estado,
      nombre: reserva.nombre,
      telefono: reserva.telefono,
      esSocio: reserva.socioId !== null,
      acompanantes: reserva.acompanantes.map(
        // El invitado es un nombre suelto; del socio acompañante se guarda el id, así
        // que su nombre se lee de su ficha y sigue al día si lo cambió.
        (quien) => quien.nombre ?? quien.socio?.usuario.nombre ?? 'Sin nombre',
      ),
    }));
  }
}
