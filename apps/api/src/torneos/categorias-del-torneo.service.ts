import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import type { CuadroNuevo } from './categorias-del-torneo.dto';

/** Un cuadro tal como lo ve el panel: con el nombre de su categoría ya resuelto. */
const COMO_SE_MUESTRA = {
  id: true,
  torneoId: true,
  categoriaJuegoId: true,
  cupo: true,
  montoInscripcionClp: true,
  semillaSorteo: true,
  categoriaJuego: { select: { nombre: true } },
} as const;

/**
 * Qué categorías corre un torneo, y con cuántos jugadores cada una.
 *
 * **Un torneo corre N categorías a la vez y cada una juega su propio cuadro**
 * (`SPEC-torneos.md` § Un torneo, varios cuadros). Este servicio administra esa lista;
 * armar el cuadro en sí sigue siendo de `cuadro.service.ts`, que en T61 todavía trabaja
 * sobre el torneo entero y pasa a trabajar por categoría en T62.
 */
@Injectable()
export class CategoriasDelTorneo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Los cuadros del torneo, **de la categoría más baja a la más alta**.
   *
   * Por `orden` de la categoría y no por cuándo se agregaron: el club los lee como lee
   * un afiche —5ª, 4ª, … Honor—, y un listado por antigüedad de creación no significa
   * nada para nadie.
   */
  async listar(torneoId: number) {
    await this.exigirTorneo(torneoId);

    const cuadros = await this.prisma.torneoCategoria.findMany({
      where: { torneoId },
      select: COMO_SE_MUESTRA,
      orderBy: { categoriaJuego: { orden: 'asc' } },
    });

    return cuadros.map(aplanar);
  }

  async agregar(torneoId: number, datos: CuadroNuevo) {
    await this.exigirTorneo(torneoId);
    await this.exigirCategoriaDeJuego(datos.categoriaJuegoId);

    try {
      const cuadro = await this.prisma.torneoCategoria.create({
        data: { torneoId, ...datos },
        select: COMO_SE_MUESTRA,
      });

      return aplanar(cuadro);
    } catch (falla) {
      // El único sobre `(torneoId, categoriaJuegoId)`. Dos cuadros de 4ª en el mismo
      // torneo serían dos listas de inscritos para la misma gente.
      if (esViolacionDeUnicidad(falla)) {
        throw new ConflictException(
          'Ese torneo ya corre esa categoría. Edita el cuadro que ya existe.',
        );
      }

      throw falla;
    }
  }

  async editar(
    torneoId: number,
    id: number,
    cambio: Partial<Omit<CuadroNuevo, 'categoriaJuegoId'>>,
  ) {
    await this.exigirCuadro(torneoId, id);

    const cuadro = await this.prisma.torneoCategoria.update({
      where: { id },
      data: cambio,
      select: COMO_SE_MUESTRA,
    });

    return aplanar(cuadro);
  }

  /**
   * Quitar un cuadro. **Solo si está vacío.**
   *
   * Con gente adentro, borrarlo se llevaría las inscripciones y —más tarde— los
   * partidos jugados. La clave foránea es `SET NULL` mientras la columna sea nulable,
   * así que la base no lo impediría: los dejaría colgando sin cuadro y en silencio,
   * que es peor que borrarlos. La regla vive acá hasta que T62 haga la columna
   * obligatoria y la base pueda respaldarla.
   */
  async quitar(torneoId: number, id: number) {
    await this.exigirCuadro(torneoId, id);

    const [inscritos, partidos] = await Promise.all([
      this.prisma.inscripcionTorneo.count({ where: { torneoCategoriaId: id } }),
      this.prisma.partido.count({ where: { torneoCategoriaId: id } }),
    ]);

    if (inscritos > 0 || partidos > 0) {
      throw new ConflictException(
        `Ese cuadro tiene ${inscritos} inscritos y ${partidos} partidos. ` +
          'Retíralos antes de quitarlo.',
      );
    }

    await this.prisma.torneoCategoria.delete({ where: { id } });

    return { id };
  }

  private async exigirTorneo(id: number): Promise<void> {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!torneo)
      throw new NotFoundException('No hay un torneo con ese número.');
  }

  /** La categoría de juego: el nivel de los que juegan este cuadro. */
  private async exigirCategoriaDeJuego(id: number): Promise<void> {
    const categoria = await this.prisma.categoriaJuego.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!categoria) {
      throw new NotFoundException('No hay una categoría con ese número.');
    }
  }

  /**
   * El cuadro **y que sea de ese torneo**.
   *
   * Se comprueba el par y no solo el id: sin eso, un id de otro torneo en la URL
   * editaría o borraría el cuadro de un torneo ajeno, y quien lo escribió creería que
   * tocó el suyo.
   */
  private async exigirCuadro(torneoId: number, id: number): Promise<void> {
    const cuadro = await this.prisma.torneoCategoria.findFirst({
      where: { id, torneoId },
      select: { id: true },
    });

    if (!cuadro) {
      throw new NotFoundException(
        'Ese torneo no corre un cuadro con ese número.',
      );
    }
  }
}

/**
 * El nombre de la categoría se aplana acá y no en la pantalla.
 *
 * Se muestra en toda lista de cuadros, y dejar el objeto anidado obliga a cada
 * consumidor a saber cómo está guardado.
 */
function aplanar<T extends { categoriaJuego: { nombre: string } }>(
  cuadro: T,
): Omit<T, 'categoriaJuego'> & { categoria: string } {
  const { categoriaJuego, ...resto } = cuadro;

  return { ...resto, categoria: categoriaJuego.nombre };
}
