import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { PrismaService } from '../prisma/prisma.service';

/** Una observación, como la ven el admin y el gestor junto a su reserva. */
export interface ObservacionDeReserva {
  id: number;
  texto: string;
  autorId: number;
  autorNombre: string;
  creadaEn: Date;
  editadaEn: Date | null;
}

/** Una observación del historial del socio, con la reserva a la que pertenece. */
export interface ObservacionDelHistorial extends ObservacionDeReserva {
  reservaId: number;
  folio: string;
  cancha: string;
  inicio: Date;
}

export const OBSERVACION = {
  id: true,
  texto: true,
  autorId: true,
  autorNombre: true,
  creadaEn: true,
  editadaEn: true,
} satisfies Prisma.ObservacionReservaSelect;

const LARGO_MAXIMO = 500;

/** El texto de una observación: recortado, y de 1 a 500 caracteres, como su columna. */
export function leerTexto(cuerpo: unknown): string {
  const { texto } = (cuerpo ?? {}) as Record<string, unknown>;
  const limpio = typeof texto === 'string' ? texto.trim() : '';

  if (limpio === '') {
    throw new BadRequestException('Escribe la observación.');
  }
  if (limpio.length > LARGO_MAXIMO) {
    throw new BadRequestException(
      `La observación puede tener hasta ${LARGO_MAXIMO} caracteres.`,
    );
  }

  return limpio;
}

/**
 * Las notas del mesón sobre una reserva (T225, `SPEC-reservas.md` § Observaciones del
 * mesón): el socio que se pasó de su hora, el que dejó la cancha sucia.
 *
 * Las escriben el admin y el gestor; **corregirlas y borrarlas es del autor o de un
 * admin**: un gestor no toca la de otro. Borrar borra, sin rastro: es una nota, no el
 * padrón. Y **el socio no las ve nunca**: ninguna respuesta que le llega las trae.
 */
@Injectable()
export class Observaciones {
  constructor(private readonly prisma: PrismaService) {}

  async anotar(
    reservaId: number,
    texto: string,
    yo: UsuarioActual,
  ): Promise<ObservacionDeReserva> {
    const existe = await this.prisma.reserva.count({
      where: { id: reservaId },
    });
    if (existe === 0) {
      throw new NotFoundException('No hay una reserva con ese número.');
    }

    return this.prisma.observacionReserva.create({
      data: {
        reservaId,
        texto,
        autorId: yo.id,
        autorNombre: `${yo.nombre} ${yo.apellido}`.trim(),
      },
      select: OBSERVACION,
    });
  }

  async corregir(
    id: number,
    texto: string,
    yo: UsuarioActual,
  ): Promise<ObservacionDeReserva> {
    await this.exigirQuePuedaTocarla(id, yo);

    return this.prisma.observacionReserva.update({
      where: { id },
      data: { texto, editadaEn: new Date() },
      select: OBSERVACION,
    });
  }

  async borrar(id: number, yo: UsuarioActual): Promise<{ id: number }> {
    await this.exigirQuePuedaTocarla(id, yo);
    await this.prisma.observacionReserva.delete({ where: { id } });

    return { id };
  }

  /** Todas las del socio, de la reserva más nueva a la más vieja. */
  async delSocio(socioId: number): Promise<ObservacionDelHistorial[]> {
    const filas = await this.prisma.observacionReserva.findMany({
      where: { reserva: { socioId } },
      orderBy: [
        { reserva: { inicio: 'desc' } },
        { creadaEn: 'asc' },
        { id: 'asc' },
      ],
      select: {
        ...OBSERVACION,
        reserva: {
          select: {
            id: true,
            folio: true,
            inicio: true,
            cancha: { select: { nombre: true } },
          },
        },
      },
    });

    return filas.map(({ reserva, ...observacion }) => ({
      ...observacion,
      reservaId: reserva.id,
      folio: reserva.folio,
      cancha: reserva.cancha.nombre,
      inicio: reserva.inicio,
    }));
  }

  private async exigirQuePuedaTocarla(
    id: number,
    yo: UsuarioActual,
  ): Promise<void> {
    const observacion = await this.prisma.observacionReserva.findUnique({
      where: { id },
      select: { autorId: true },
    });

    if (!observacion) {
      throw new NotFoundException('No hay una observación con ese número.');
    }
    if (!yo.esAdmin && observacion.autorId !== yo.id) {
      throw new ForbiddenException(
        'Solo quien escribió la observación, o un admin, la puede corregir o borrar.',
      );
    }
  }
}
