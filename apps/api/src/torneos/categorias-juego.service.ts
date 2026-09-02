import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import type { CategoriaDeJuegoNueva } from './categorias-juego.dto';

/**
 * Las categorías con que juega el club: 5ª, 4ª, 3ª, 2ª, 1ª, Honor.
 *
 * **Vive en su propio archivo y no junto a `CategoriaTorneo`**, aunque el CRUD sea
 * casi el mismo. Las dos cosas se llaman "categoría" y significan cosas distintas —
 * una es el nivel del jugador y la otra el del torneo, del que salen los puntos del
 * ranking—, y `SPEC-torneos.md` § Las dos categorías que no son la misma dice que
 * confundirlas es el error que el módulo más quiere evitar. Dos servicios en el mismo
 * archivo es la forma más barata de que alguien tome la de al lado por descuido.
 */
@Injectable()
export class CategoriasDeJuego {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * De la más baja a la más alta, siempre.
   *
   * **Por `orden` y no por nombre**: "1ª" ordena antes que "5ª" alfabéticamente, y
   * "Honor" después de las dos. Y tampoco por `activa` primero, al revés que
   * `CategoriaTorneo`: acá el orden *es* el significado del campo, y romperlo en la
   * pantalla del admin haría que el número que está escribiendo no se corresponda con
   * lo que ve.
   */
  listar(soloActivas = false) {
    return this.prisma.categoriaJuego.findMany({
      where: soloActivas ? { activa: true } : {},
      orderBy: { orden: 'asc' },
    });
  }

  async crear(datos: CategoriaDeJuegoNueva) {
    try {
      return await this.prisma.categoriaJuego.create({ data: datos });
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) throw choque();

      throw falla;
    }
  }

  /**
   * Editar, reordenar o desactivar.
   *
   * **Desactivar no borra.** Una categoría que el club deja de correr este año tiene
   * torneos jugados colgando, y su fila es lo que hace que el año que viene se
   * reactive sin reescribirla.
   */
  async editar(
    id: number,
    cambio: Partial<CategoriaDeJuegoNueva> & { activa?: boolean },
  ) {
    // Se comprueba que exista **antes** de actualizar, en vez de traducir el error
    // que devuelva `update`. Los dos casos que pueden fallar acá —la categoría no
    // existe, y el nombre o el lugar ya están tomados— necesitan respuestas
    // distintas: un 404 y un 409. Prisma los reporta con códigos distintos, pero
    // separarlos en el `catch` obligaría a que este servicio conozca `P2025` además
    // de `P2002`, y `prisma/errores.ts` solo expone el segundo. Una consulta de más
    // sobre una tabla de seis filas es más barata que ampliar ese contrato.
    const existe = await this.prisma.categoriaJuego.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existe) {
      throw new NotFoundException('No hay una categoría con ese número.');
    }

    try {
      return await this.prisma.categoriaJuego.update({
        where: { id },
        data: cambio,
      });
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) throw choque();

      throw falla;
    }
  }
}

/**
 * El mismo mensaje para los dos únicos.
 *
 * Prisma reporta ambos con el mismo código y sin decir cuál —ver
 * `prisma/errores.ts`—, así que distinguirlos exigiría una consulta previa por cada
 * campo. El mensaje nombra las dos posibilidades, que es lo que el admin necesita
 * para saber qué mirar: son dos campos, no veinte.
 *
 * **Función y no una instancia compartida.** Una excepción guarda el stack del momento
 * en que se construyó: reusar la misma haría que todos los 409 apuntaran a la carga
 * del módulo en vez de al `throw`, que es justo el dato que se busca cuando hay que
 * averiguar de dónde salió uno.
 */
function choque(): ConflictException {
  return new ConflictException(
    'Ya hay una categoría con ese nombre, o una en ese mismo lugar.',
  );
}
