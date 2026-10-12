import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import type { CategoriaNueva, FilaDeTallas } from './catalogo-admin.dto';

/**
 * Las categorías, las marcas y la tabla de tallas de cada marca (T156).
 *
 * Tablas chicas que el club escribe a mano desde su panel. **No se borran**: en cuanto
 * llegue el primer producto (T158), una categoría o una marca tienen cosas colgando, y
 * para un error de tipeo alcanza con editar.
 */
@Injectable()
export class CategoriasYMarcas {
  constructor(private readonly prisma: PrismaService) {}

  /** En el orden que eligió el club; con el mismo orden, la más antigua primero. */
  listarCategorias() {
    return this.prisma.categoriaProducto.findMany({
      select: CATEGORIA,
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });
  }

  async crearCategoria({ orden, ...datos }: CategoriaNueva) {
    return this.unica('categoría', async () =>
      this.prisma.categoriaProducto.create({
        data: { ...datos, orden: orden ?? (await this.siguienteOrden()) },
        select: CATEGORIA,
      }),
    );
  }

  async editarCategoria(id: number, cambio: Partial<CategoriaNueva>) {
    // Se comprueba antes de escribir, como en las preguntas frecuentes: un 404 claro es
    // más barato que traducir el `P2025` de Prisma.
    const existe = await this.prisma.categoriaProducto.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existe) {
      throw new NotFoundException('No hay una categoría con ese número.');
    }

    return this.unica('categoría', () =>
      this.prisma.categoriaProducto.update({
        where: { id },
        data: cambio,
        select: CATEGORIA,
      }),
    );
  }

  listarMarcas() {
    return this.prisma.marca.findMany({
      select: MARCA,
      orderBy: { nombre: 'asc' },
    });
  }

  crearMarca(datos: { nombre: string }) {
    return this.unica('marca', () =>
      this.prisma.marca.create({ data: datos, select: MARCA }),
    );
  }

  async editarMarca(id: number, datos: { nombre: string }) {
    await this.exigirMarca(id);

    return this.unica('marca', () =>
      this.prisma.marca.update({ where: { id }, data: datos, select: MARCA }),
    );
  }

  /** En el orden en que el admin la escribió, que es el de los `id`. */
  async tallasDe(marcaId: number): Promise<FilaDeTallas[]> {
    await this.exigirMarca(marcaId);

    return this.prisma.equivalenciaTalla.findMany({
      where: { marcaId },
      select: TALLA,
      orderBy: { id: 'asc' },
    });
  }

  /**
   * La tabla entera reemplaza a la anterior, en una sola transacción.
   *
   * **Reemplazar y no comparar fila por fila**: la tabla es corta y se edita como una
   * planilla, y un diff tendría que decidir si "40 → 8" corregido a "40 → 7" es una fila
   * nueva o la misma. Borrar y volver a escribir deja el orden que el admin ve.
   */
  async guardarTallas(
    marcaId: number,
    filas: FilaDeTallas[],
  ): Promise<FilaDeTallas[]> {
    await this.exigirMarca(marcaId);

    await this.prisma.$transaction([
      this.prisma.equivalenciaTalla.deleteMany({ where: { marcaId } }),
      this.prisma.equivalenciaTalla.createMany({
        data: filas.map((fila) => ({ ...fila, marcaId })),
      }),
    ]);

    return this.tallasDe(marcaId);
  }

  /** Una más que la última: la nueva queda al final sin que el admin elija un número. */
  private async siguienteOrden(): Promise<number> {
    const { _max } = await this.prisma.categoriaProducto.aggregate({
      _max: { orden: true },
    });

    return (_max.orden ?? 0) + 1;
  }

  private async exigirMarca(id: number): Promise<void> {
    const existe = await this.prisma.marca.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existe)
      throw new NotFoundException('No hay una marca con ese número.');
  }

  /**
   * Un nombre repetido es un 409, como en las categorías de juego. Lo decide el único de
   * la base, que no distingue mayúsculas: chequearlo antes dejaría la carrera abierta y
   * no vería que "ropa" choca con "Ropa".
   */
  private async unica<T>(que: string, escribir: () => Promise<T>): Promise<T> {
    try {
      return await escribir();
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) {
        throw new ConflictException(`Ya hay una ${que} con ese nombre.`);
      }

      throw falla;
    }
  }
}

const CATEGORIA = {
  id: true,
  nombre: true,
  orden: true,
  usaTablaDeTallas: true,
} as const;

const MARCA = { id: true, nombre: true } as const;

const TALLA = { tallaCl: true, tallaUs: true, tallaEu: true } as const;
