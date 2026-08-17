import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { DatosCancha, DatosFranja, DatosHorario } from './admin.dto';
import { DisponibilidadService } from './disponibilidad.service';

/** Una cancha con horas de apertura que ninguna tarifa cubre. */
export interface AdvertenciaDeTarifa {
  canchaId: number;
  nombre: string;
  /** Los bloques que hoy saldrían gratis, en UTC. */
  sinTarifa: string[];
}

@Injectable()
export class AdminCanchasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly disponibilidad: DisponibilidadService,
  ) {}

  /**
   * Todas, también las desactivadas: si el panel solo mostrara las activas,
   * desactivar una sería un viaje de ida.
   */
  canchas() {
    return this.prisma.cancha.findMany({
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      include: {
        horarios: { orderBy: { diaSemana: 'asc' } },
        franjas: { orderBy: { horaDesde: 'asc' } },
      },
    });
  }

  async crear(datos: DatosCancha) {
    try {
      return await this.prisma.cancha.create({ data: datos });
    } catch (error) {
      if (esViolacionDeUnicidad(error)) {
        // Sin traducirlo, el nombre repetido sale como un 500 y el admin no se
        // entera de que el problema es que ya existe esa cancha.
        throw new ConflictException('Ya hay una cancha con ese nombre.');
      }

      throw error;
    }
  }

  async editar(
    id: number,
    cambios: Partial<DatosCancha & { activa: boolean }>,
  ) {
    await this.laCancha(id);

    try {
      return await this.prisma.cancha.update({ where: { id }, data: cambios });
    } catch (error) {
      if (esViolacionDeUnicidad(error)) {
        throw new ConflictException('Ya hay una cancha con ese nombre.');
      }

      throw error;
    }
  }

  /**
   * Reemplaza el horario completo de una cancha.
   *
   * En una transacción: si el borrado saliera y la escritura no, la cancha
   * quedaría sin horario y desaparecería de la grilla sin que nadie lo pidiera.
   */
  async fijarHorarios(canchaId: number, horarios: DatosHorario[]) {
    await this.laCancha(canchaId);

    return this.prisma.$transaction(async (tx) => {
      await tx.horarioApertura.deleteMany({ where: { canchaId } });
      await tx.horarioApertura.createMany({
        data: horarios.map((horario) => ({ ...horario, canchaId })),
      });

      return tx.horarioApertura.findMany({
        where: { canchaId },
        orderBy: { diaSemana: 'asc' },
      });
    });
  }

  async crearFranja(datos: DatosFranja) {
    if (datos.canchaId !== null) {
      await this.laCancha(datos.canchaId);
    }

    return this.prisma.franjaHoraria.create({ data: datos });
  }

  async borrarFranja(id: number): Promise<void> {
    const borradas = await this.prisma.franjaHoraria.deleteMany({
      where: { id },
    });

    if (borradas.count === 0) {
      throw new NotFoundException('No hay una tarifa con ese número.');
    }
  }

  /**
   * Qué horas de qué canchas quedarían sin cobrar ese día.
   *
   * Un bloque sin franja vale 0 y no es pico: legal según la spec, pero casi
   * siempre significa que el admin olvidó una tarifa y el club está regalando
   * horas de cancha sin enterarse.
   */
  async advertencias(fecha: string): Promise<AdvertenciaDeTarifa[]> {
    const canchas = await this.disponibilidad.canchas();

    const porCancha = await Promise.all(
      canchas.map(async (cancha) => ({
        canchaId: cancha.id,
        nombre: cancha.nombre,
        sinTarifa: (await this.disponibilidad.de(cancha.id, fecha))
          .filter((bloque) => !bloque.bloqueado && bloque.montoClp === 0)
          .map((bloque) => bloque.inicio.toISOString()),
      })),
    );

    return porCancha.filter((cancha) => cancha.sinTarifa.length > 0);
  }

  /** Existe o 404. Editar una cancha que no está no puede pasar en silencio. */
  private async laCancha(id: number): Promise<void> {
    const cancha = await this.prisma.cancha.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!cancha) {
      throw new NotFoundException('No hay una cancha con ese número.');
    }
  }
}
