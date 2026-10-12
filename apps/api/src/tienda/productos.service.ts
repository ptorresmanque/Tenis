import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { MotivoMovimientoStock, Prisma } from '../generated/prisma/client';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import { direccionesDeLaFoto } from './fotos.service';
import type {
  CambioDeProducto,
  CambioDeVariante,
  EstadoDeProducto,
  ProductoNuevo,
  VarianteNueva,
} from './productos.dto';
import { moverStock } from './stock';

/** Un producto en la lista del panel. */
export interface ProductoDeLaLista {
  id: number;
  nombre: string;
  categoria: { id: number; nombre: string };
  marca: { id: number; nombre: string } | null;
  precioClp: number;
  publicado: boolean;
  archivado: boolean;
  /** La suma de sus variantes activas. Puede ser negativa (encargo, mesón). */
  stockTotal: number;
  variantes: number;
  /** La miniatura de su primera foto, o nada. */
  foto: string | null;
}

/** Un producto en su ficha del panel. */
export interface FichaDeProducto {
  id: number;
  nombre: string;
  descripcion: string;
  categoriaId: number;
  marcaId: number | null;
  precioClp: number;
  publicado: boolean;
  archivado: boolean;
  aceptaEncargo: boolean;
  diasEncargo: number | null;
  variantes: VarianteDeLaFicha[];
  fotos: { id: number; orden: number; miniatura: string; imagen: string }[];
}

export interface VarianteDeLaFicha {
  id: number;
  etiqueta: string;
  codigoBarras: string | null;
  stock: number;
  activa: boolean;
}

/**
 * Los productos de la tienda y sus variantes, para el panel (T158).
 *
 * **El stock no se escribe acá**: el de una variante nueva entra con `moverStock()`, como
 * un movimiento `ENTRADA` con su autor (`SPEC-tienda.md` § Stock).
 */
@Injectable()
export class ProductosDeLaTienda {
  constructor(private readonly prisma: PrismaService) {}

  /** Sin estado, todo lo que no está archivado: lo archivado no se ofrece por omisión. */
  async listar(filtro: {
    estado: EstadoDeProducto | null;
    categoriaId: number | null;
  }): Promise<ProductoDeLaLista[]> {
    const productos = await this.prisma.producto.findMany({
      where: {
        ...ESTADOS[filtro.estado ?? 'vigentes'],
        ...(filtro.categoriaId === null
          ? {}
          : { categoriaId: filtro.categoriaId }),
      },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nombre: true,
        precioClp: true,
        publicado: true,
        archivado: true,
        categoria: { select: { id: true, nombre: true } },
        marca: { select: { id: true, nombre: true } },
        variantes: { select: { stock: true, activa: true } },
        fotos: {
          select: { id: true },
          orderBy: [{ orden: 'asc' }, { id: 'asc' }],
          take: 1,
        },
      },
    });

    return productos.map(({ variantes, fotos, ...producto }) => ({
      ...producto,
      stockTotal: variantes
        .filter((v) => v.activa)
        .reduce((suma, v) => suma + v.stock, 0),
      variantes: variantes.length,
      foto: fotos[0] ? direccionesDeLaFoto(fotos[0].id).miniatura : null,
    }));
  }

  async ficha(id: number): Promise<FichaDeProducto> {
    const producto = await this.prisma.producto.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        categoriaId: true,
        marcaId: true,
        precioClp: true,
        publicado: true,
        archivado: true,
        aceptaEncargo: true,
        diasEncargo: true,
        variantes: { select: VARIANTE, orderBy: { id: 'asc' } },
        fotos: {
          select: { id: true, orden: true },
          orderBy: [{ orden: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!producto)
      throw new NotFoundException('No hay un producto con ese número.');

    return {
      ...producto,
      fotos: producto.fotos.map((foto) => ({
        ...foto,
        ...direccionesDeLaFoto(foto.id),
      })),
    };
  }

  /**
   * Crea el producto con sus variantes, **en borrador**, en una sola transacción: un
   * código de barras tomado no deja un producto a medias.
   */
  async crear(
    datos: ProductoNuevo,
    usuarioId: number,
  ): Promise<FichaDeProducto> {
    await this.exigirReferencias(datos.categoriaId, datos.marcaId);
    const { variantes, ...producto } = datos;

    const id = await this.codigosUnicos(() =>
      this.prisma.$transaction(async (tx) => {
        const creado = await tx.producto.create({
          data: producto,
          select: { id: true },
        });

        for (const variante of variantes) {
          await crearVariante(tx, creado.id, variante, usuarioId);
        }

        return creado.id;
      }),
    );

    return this.ficha(id);
  }

  /**
   * Corrige, publica, despublica o archiva.
   *
   * **Archivar despublica**: un producto archivado no está en la tienda. **Publicar exige
   * algo que vender**: al menos una variante activa, y no estar archivado.
   */
  async editar(id: number, cambio: CambioDeProducto): Promise<FichaDeProducto> {
    const actual = await this.prisma.producto.findUnique({
      where: { id },
      select: {
        archivado: true,
        _count: { select: { variantes: { where: { activa: true } } } },
      },
    });
    if (!actual)
      throw new NotFoundException('No hay un producto con ese número.');

    await this.exigirReferencias(cambio.categoriaId, cambio.marcaId);

    const quedaArchivado = cambio.archivado ?? actual.archivado;
    if (cambio.publicado === true) {
      if (quedaArchivado) {
        throw new ConflictException(
          'Un producto archivado no se publica: desarchívalo primero.',
        );
      }
      if (actual._count.variantes === 0) {
        throw new ConflictException(
          'Agrega una variante activa antes de publicarlo: sin variantes no hay qué vender.',
        );
      }
    }

    await this.prisma.producto.update({
      where: { id },
      data:
        cambio.archivado === true ? { ...cambio, publicado: false } : cambio,
    });

    return this.ficha(id);
  }

  async agregarVariante(
    productoId: number,
    datos: VarianteNueva,
    usuarioId: number,
  ): Promise<VarianteDeLaFicha> {
    const producto = await this.prisma.producto.findUnique({
      where: { id: productoId },
      select: { id: true },
    });
    if (!producto)
      throw new NotFoundException('No hay un producto con ese número.');

    return this.codigosUnicos(() =>
      this.prisma.$transaction(async (tx) => {
        const id = await crearVariante(tx, productoId, datos, usuarioId);

        return tx.variante.findUniqueOrThrow({
          where: { id },
          select: VARIANTE,
        });
      }),
    );
  }

  /** La etiqueta, el código o si está activa. El stock no: ver `leerCambioDeVariante`. */
  async editarVariante(
    id: number,
    cambio: CambioDeVariante,
  ): Promise<VarianteDeLaFicha> {
    const existe = await this.prisma.variante.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existe)
      throw new NotFoundException('No hay una variante con ese número.');

    return this.codigosUnicos(() =>
      this.prisma.variante.update({
        where: { id },
        data: cambio,
        select: VARIANTE,
      }),
    );
  }

  /**
   * Una categoría o una marca que no existe es un pedido mal armado, un 400: el producto
   * es lo que se está escribiendo, y lo que falla es un dato suyo.
   */
  private async exigirReferencias(
    categoriaId: number | undefined,
    marcaId: number | null | undefined,
  ): Promise<void> {
    if (categoriaId !== undefined) {
      const categoria = await this.prisma.categoriaProducto.findUnique({
        where: { id: categoriaId },
        select: { id: true },
      });
      if (!categoria)
        throw new BadRequestException('No hay una categoría con ese número.');
    }
    if (marcaId !== undefined && marcaId !== null) {
      const marca = await this.prisma.marca.findUnique({
        where: { id: marcaId },
        select: { id: true },
      });
      if (!marca)
        throw new BadRequestException('No hay una marca con ese número.');
    }
  }

  /**
   * Los dos únicos de `variante` —la etiqueta dentro del producto y el código de barras en
   * toda la tienda— son un 409. Prisma no dice cuál de los dos chocó (`prisma/errores.ts`),
   * así que el mensaje nombra los dos, como en las categorías de juego.
   */
  private async codigosUnicos<T>(escribir: () => Promise<T>): Promise<T> {
    try {
      return await escribir();
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) {
        throw new ConflictException(
          'Esa etiqueta ya está en el producto, o ese código de barras ya es de otra variante.',
        );
      }

      throw falla;
    }
  }
}

/**
 * Una variante nueva, **con el stock en cero**, y su stock inicial como una entrada. Si
 * nace en cero no deja movimiento: no entró nada.
 */
async function crearVariante(
  tx: Prisma.TransactionClient,
  productoId: number,
  { etiqueta, codigoBarras, stock }: VarianteNueva,
  usuarioId: number,
): Promise<number> {
  const { id } = await tx.variante.create({
    data: { productoId, etiqueta, codigoBarras },
    select: { id: true },
  });

  if (stock > 0) {
    await moverStock(tx, {
      varianteId: id,
      cantidad: stock,
      motivo: MotivoMovimientoStock.ENTRADA,
      usuarioId,
    });
  }

  return id;
}

const VARIANTE = {
  id: true,
  etiqueta: true,
  codigoBarras: true,
  stock: true,
  activa: true,
} as const;

/** Lo que filtra cada estado de la lista. "Vigentes" es la lista sin filtro. */
const ESTADOS: Record<
  EstadoDeProducto | 'vigentes',
  Prisma.ProductoWhereInput
> = {
  vigentes: { archivado: false },
  borrador: { archivado: false, publicado: false },
  publicado: { archivado: false, publicado: true },
  archivado: { archivado: true },
};
