import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { comoFechaCivil } from '../comun/tiempo';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import type { TemporadaNueva, TourNuevo } from './tours.dto';

/** Una temporada como la ve el panel. Las fechas, civiles: "2027-03-01". */
export interface TemporadaDelPanel {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
}

/** La ficha de un tour en el panel. Los niveles de cada temporada llegan en T189. */
export interface FichaDeTour {
  id: number;
  nombre: string;
  descripcion: string;
  temporadas: TemporadaDelPanel[];
}

const TEMPORADA = {
  id: true,
  nombre: true,
  fechaInicio: true,
  fechaFin: true,
} as const;

/**
 * Los tours y sus temporadas, para el panel (T188). `SPEC-tours.md`.
 *
 * **Nada con torneos se borra.** La base lo impide con los `Restrict` de `torneo_tour`; el
 * servicio cuenta antes para que el 409 diga cuántos, que es lo que el admin necesita
 * para saber qué mover primero.
 */
@Injectable()
export class Tours {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La lista del panel, por nombre. Un club tiene un puñado.
   *
   * Con cuántas temporadas tiene cada uno, ya contado: el `_count` de Prisma no sale tal
   * cual, para que el panel no dependa de cómo arma sus consultas el ORM.
   */
  async listar(): Promise<
    { id: number; nombre: string; temporadas: number }[]
  > {
    const tours = await this.prisma.tour.findMany({
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        _count: { select: { temporadas: true } },
      },
    });

    return tours.map(({ _count, ...tour }) => ({
      ...tour,
      temporadas: _count.temporadas,
    }));
  }

  async ficha(id: number): Promise<FichaDeTour> {
    const tour = await this.prisma.tour.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        // La más nueva primero: es la que el admin viene a tocar.
        temporadas: {
          orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
          select: TEMPORADA,
        },
      },
    });

    if (!tour) throw new NotFoundException('No hay un tour con ese número.');

    return { ...tour, temporadas: tour.temporadas.map(publicarTemporada) };
  }

  async crear(datos: Pick<TourNuevo, 'nombre'>): Promise<FichaDeTour> {
    try {
      const { id } = await this.prisma.tour.create({
        data: { nombre: datos.nombre, descripcion: '' },
        select: { id: true },
      });

      return await this.ficha(id);
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) throw choqueDeTour();

      throw falla;
    }
  }

  async editar(id: number, cambio: Partial<TourNuevo>): Promise<FichaDeTour> {
    // Que exista primero: el 404 y el 409 necesitan respuestas distintas, como en las
    // categorías de juego.
    await this.ficha(id);

    try {
      await this.prisma.tour.update({ where: { id }, data: cambio });
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) throw choqueDeTour();

      throw falla;
    }

    return this.ficha(id);
  }

  /**
   * Borra el tour con sus temporadas y sus niveles, que caen en cascada. **Con torneos,
   * no**: el 409 dice cuántos.
   *
   * Las fotos y la imagen también caen con la fila; sus archivos los borra T190.
   */
  async borrar(id: number): Promise<{ id: number }> {
    await this.ficha(id);

    const torneos = await this.prisma.torneoTour.count({
      where: { tourId: id },
    });
    if (torneos > 0) {
      throw new ConflictException(
        `Ese tour suma para ${cuantos(torneos)}. Quítaselos antes de borrarlo.`,
      );
    }

    await this.prisma.tour.delete({ where: { id } });

    return { id };
  }

  async crearTemporada(
    tourId: number,
    datos: TemporadaNueva,
  ): Promise<TemporadaDelPanel> {
    await this.ficha(tourId);

    try {
      const creada = await this.prisma.temporadaTour.create({
        data: { tourId, ...datos },
        select: TEMPORADA,
      });

      return publicarTemporada(creada);
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) throw choqueDeTemporada();

      throw falla;
    }
  }

  /**
   * Corrige el nombre o las fechas. **Las fechas no se comparan con las de sus
   * torneos** (D13): la temporada a la que suma un torneo la elige el admin.
   */
  async editarTemporada(
    id: number,
    cambio: Partial<TemporadaNueva>,
  ): Promise<TemporadaDelPanel> {
    await this.exigirTemporada(id);

    try {
      const editada = await this.prisma.temporadaTour.update({
        where: { id },
        data: cambio,
        select: TEMPORADA,
      });

      return publicarTemporada(editada);
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) throw choqueDeTemporada();

      throw falla;
    }
  }

  /** Borra la temporada con sus niveles. **Con torneos, no**, como el tour. */
  async borrarTemporada(id: number): Promise<{ id: number }> {
    await this.exigirTemporada(id);

    const torneos = await this.prisma.torneoTour.count({
      where: { nivel: { temporadaId: id } },
    });
    if (torneos > 0) {
      throw new ConflictException(
        `Esa temporada tiene ${cuantos(torneos)}. Quítaselos antes de borrarla.`,
      );
    }

    await this.prisma.temporadaTour.delete({ where: { id } });

    return { id };
  }

  private async exigirTemporada(id: number): Promise<void> {
    const temporada = await this.prisma.temporadaTour.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!temporada) {
      throw new NotFoundException('No hay una temporada con ese número.');
    }
  }
}

function publicarTemporada(fila: {
  id: number;
  nombre: string;
  fechaInicio: Date;
  fechaFin: Date;
}): TemporadaDelPanel {
  return {
    ...fila,
    fechaInicio: comoFechaCivil(fila.fechaInicio),
    fechaFin: comoFechaCivil(fila.fechaFin),
  };
}

/** "1 torneo", "3 torneos". */
function cuantos(torneos: number): string {
  return torneos === 1 ? '1 torneo' : `${torneos} torneos`;
}

/** Funciones y no instancias compartidas: el stack tiene que ser el del `throw`. */
function choqueDeTour(): ConflictException {
  return new ConflictException('Ya hay un tour con ese nombre.');
}

function choqueDeTemporada(): ConflictException {
  return new ConflictException(
    'Ese tour ya tiene una temporada con ese nombre.',
  );
}
