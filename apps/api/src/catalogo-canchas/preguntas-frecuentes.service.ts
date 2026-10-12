import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { PreguntaFrecuenteNueva } from './preguntas-frecuentes.dto';

/**
 * Las preguntas frecuentes del club (T144).
 *
 * Una tabla chica que el club escribe a mano: sin paginación, sin borradores y sin
 * borrado lógico. Una pregunta que ya no aplica se borra; no tiene nada colgando.
 */
@Injectable()
export class PreguntasFrecuentes {
  constructor(private readonly prisma: PrismaService) {}

  /** En el orden que eligió el club; con el mismo orden, la más antigua primero. */
  listar() {
    return this.prisma.preguntaFrecuente.findMany({
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });
  }

  /** Lo que ve cualquiera: la pregunta y la respuesta, sin el orden ni las fechas. */
  listarPublicas() {
    return this.prisma.preguntaFrecuente.findMany({
      select: { id: true, pregunta: true, respuesta: true },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });
  }

  async crear({ orden, ...datos }: PreguntaFrecuenteNueva) {
    return this.prisma.preguntaFrecuente.create({
      data: { ...datos, orden: orden ?? (await this.siguienteOrden()) },
    });
  }

  async editar(id: number, cambio: Partial<PreguntaFrecuenteNueva>) {
    await this.exigir(id);

    return this.prisma.preguntaFrecuente.update({
      where: { id },
      data: cambio,
    });
  }

  async borrar(id: number): Promise<void> {
    await this.exigir(id);
    await this.prisma.preguntaFrecuente.delete({ where: { id } });
  }

  /** Una más que la última: la nueva queda al final sin que el admin elija un número. */
  private async siguienteOrden(): Promise<number> {
    const { _max } = await this.prisma.preguntaFrecuente.aggregate({
      _max: { orden: true },
    });

    return (_max.orden ?? 0) + 1;
  }

  /**
   * Se comprueba antes de escribir, como en las categorías de juego: un 404 claro es
   * más barato que traducir el `P2025` de Prisma.
   */
  private async exigir(id: number): Promise<void> {
    const existe = await this.prisma.preguntaFrecuente.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existe) {
      throw new NotFoundException(
        'No hay una pregunta frecuente con ese número.',
      );
    }
  }
}
