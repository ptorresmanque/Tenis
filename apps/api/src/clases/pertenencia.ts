import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { UsuarioActual } from '../identidad/usuario-actual';
import { PrismaService } from '../prisma/prisma.service';

/** Lo que importa de quien pregunta para saber si una clase es suya. */
export type QuienPregunta = Pick<UsuarioActual, 'esAdmin' | 'profesorId'>;

/**
 * **La regla de pertenencia, una sola** (T218, `SPEC-clases.md` § El profesor en el
 * panel): el admin toca cualquier clase; el profesor, solo las de su ficha.
 */
export function exigirSuya(profesorId: number, yo: QuienPregunta): void {
  if (yo.esAdmin || profesorId === yo.profesorId) return;

  throw new ForbiddenException(
    'Esta clase es de otro profesor: solo puedes tocar las tuyas.',
  );
}

/**
 * La misma regla para lo que llega por id. El guard dice quién entra a `admin/clases`;
 * esto dice sobre qué. El profesor de una clase o de una serie no cambia nunca —mover
 * conserva el profesor—, así que mirarlo antes de la operación no deja hueco.
 */
@Injectable()
export class Pertenencia {
  constructor(private readonly prisma: PrismaService) {}

  async deLaClase(id: number, yo: QuienPregunta): Promise<void> {
    if (yo.esAdmin) return;

    const clase = await this.prisma.clase.findUnique({
      where: { id },
      select: { profesorId: true },
    });
    if (!clase) throw new NotFoundException('No hay una clase con ese número.');

    exigirSuya(clase.profesorId, yo);
  }

  async deLaSerie(id: number, yo: QuienPregunta): Promise<void> {
    if (yo.esAdmin) return;

    const serie = await this.prisma.serieDeClases.findUnique({
      where: { id },
      select: { profesorId: true },
    });
    if (!serie) throw new NotFoundException('No hay una serie con ese número.');

    exigirSuya(serie.profesorId, yo);
  }
}
