import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { PrismaService } from '../prisma/prisma.service';
import type { FilaDeTallas } from './catalogo-admin.dto';
import type {
  FiltroDelCatalogo,
  OrdenDelCatalogo,
} from './catalogo-publico.dto';
import { disponibles } from './disponible';
import { direccionesDeLaFoto } from './fotos.service';
import { porcentajeDeSocio, precioDeSocio } from './precio';
import { textoDeTalla } from './tallas';

type Nombrado = { id: number; nombre: string };

/** Un producto en `/tienda`. */
export interface ProductoDelCatalogo {
  id: number;
  nombre: string;
  categoria: Nombrado;
  marca: Nombrado | null;
  precioClp: number;
  /** Solo para el socio activo y al día con sesión; para el resto, nulo. */
  precioSocioClp: number | null;
  /** La miniatura de su primera foto, o nada. */
  foto: string | null;
  /** A ninguna variante activa le queda nada, y no se vende por encargo. */
  agotado: boolean;
  /** A ninguna le queda nada, pero se vende por encargo (T170): "llega en N días". */
  porEncargo: boolean;
}

/** Un producto en su ficha, `/tienda/:id`. */
export interface FichaPublica {
  id: number;
  nombre: string;
  descripcion: string;
  categoria: Nombrado;
  marca: Nombrado | null;
  precioClp: number;
  /** Lo que no queda se vende igual, y llega en `diasEncargo` días (T170). */
  aceptaEncargo: boolean;
  diasEncargo: number | null;
  precioSocioClp: number | null;
  variantes: VariantePublica[];
  /** La tabla de la marca, si la categoría la usa; si no, vacía. */
  tallas: FilaDeTallas[];
  fotos: { id: number; miniatura: string; imagen: string }[];
}

export interface VariantePublica {
  id: number;
  etiqueta: string;
  /** "CL 40 · US 8 · EU 41" con la tabla de la marca, o la etiqueta sola. */
  talla: string;
  /** El stock menos lo apartado por pedidos sin pagar, nunca menos de cero (T164). */
  disponible: number;
}

/** Lo que hay para filtrar, sacado solo de lo que se ve. */
export interface FiltrosDelCatalogo {
  categorias: Nombrado[];
  marcas: Nombrado[];
  tallas: string[];
  precioMin: number | null;
  precioMax: number | null;
}

/**
 * **Lo que se ve es lo que se puede comprar**: publicado, sin archivar y con alguna
 * variante activa. Desactivar todas las variantes no despublica (T158), así que sin la
 * tercera condición saldría un producto sin nada que elegir.
 */
const VISIBLE = {
  publicado: true,
  archivado: false,
  variantes: { some: { activa: true } },
} satisfies Prisma.ProductoWhereInput;

/** El id crece con cada producto: ordenar por él es ordenar por novedad. */
const ORDENES: Record<
  OrdenDelCatalogo,
  Prisma.ProductoOrderByWithRelationInput[]
> = {
  novedad: [{ id: 'desc' }],
  'precio-asc': [{ precioClp: 'asc' }, { id: 'desc' }],
  'precio-desc': [{ precioClp: 'desc' }, { id: 'desc' }],
};

const NOMBRADO = { select: { id: true, nombre: true } } as const;

/**
 * El catálogo público de la tienda (T161), para cualquiera, con o sin sesión.
 *
 * **El precio de socio se calcula acá**, con el porcentaje de la configuración: el
 * navegador lo muestra, pero nunca lo manda de vuelta (`SPEC-tienda.md` § Precio).
 */
@Injectable()
export class CatalogoPublico {
  constructor(private readonly prisma: PrismaService) {}

  async listar(
    filtro: FiltroDelCatalogo,
    yo: UsuarioActual | null,
  ): Promise<ProductoDelCatalogo[]> {
    const [productos, porcentaje] = await Promise.all([
      this.prisma.producto.findMany({
        where: {
          ...VISIBLE,
          // La talla reemplaza la condición de las variantes: pedir una activa con esa
          // etiqueta ya pide que haya una activa.
          ...(filtro.talla === null
            ? {}
            : {
                variantes: { some: { activa: true, etiqueta: filtro.talla } },
              }),
          ...(filtro.categoriaId === null
            ? {}
            : { categoriaId: filtro.categoriaId }),
          ...(filtro.marcaId === null ? {} : { marcaId: filtro.marcaId }),
          precioClp: {
            ...(filtro.precioMin === null ? {} : { gte: filtro.precioMin }),
            ...(filtro.precioMax === null ? {} : { lte: filtro.precioMax }),
          },
        },
        orderBy: ORDENES[filtro.orden],
        select: {
          id: true,
          nombre: true,
          precioClp: true,
          aceptaEncargo: true,
          categoria: NOMBRADO,
          marca: NOMBRADO,
          variantes: {
            where: { activa: true },
            select: { id: true, stock: true },
          },
          fotos: {
            select: { id: true },
            orderBy: [{ orden: 'asc' }, { id: 'asc' }],
            take: 1,
          },
        },
      }),
      porcentajeDeSocio(this.prisma, yo),
    ]);

    const quedan = await disponibles(
      this.prisma,
      productos.flatMap((p) => p.variantes),
    );

    return productos.map(({ variantes, fotos, aceptaEncargo, ...producto }) => {
      const sinNada = variantes.every((v) => quedan.get(v.id) === 0);

      return {
        ...producto,
        precioSocioClp:
          porcentaje === null
            ? null
            : precioDeSocio(producto.precioClp, porcentaje),
        foto: fotos[0] ? direccionesDeLaFoto(fotos[0].id).miniatura : null,
        agotado: sinNada && !aceptaEncargo,
        porEncargo: sinNada && aceptaEncargo,
      };
    });
  }

  async ficha(id: number, yo: UsuarioActual | null): Promise<FichaPublica> {
    const [producto, porcentaje] = await Promise.all([
      this.prisma.producto.findFirst({
        where: { id, ...VISIBLE },
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          precioClp: true,
          aceptaEncargo: true,
          diasEncargo: true,
          categoria: {
            select: { id: true, nombre: true, usaTablaDeTallas: true },
          },
          marca: {
            select: {
              id: true,
              nombre: true,
              tallas: {
                select: { tallaCl: true, tallaUs: true, tallaEu: true },
                orderBy: { id: 'asc' },
              },
            },
          },
          variantes: {
            where: { activa: true },
            select: { id: true, etiqueta: true, stock: true },
            orderBy: { id: 'asc' },
          },
          fotos: {
            select: { id: true },
            orderBy: [{ orden: 'asc' }, { id: 'asc' }],
          },
        },
      }),
      porcentajeDeSocio(this.prisma, yo),
    ]);

    // El mismo 404 para el que no existe y para el borrador: un borrador no se anuncia.
    if (!producto)
      throw new NotFoundException('Ese producto no está a la venta.');

    const { categoria, marca, variantes, fotos, ...resto } = producto;
    const { usaTablaDeTallas } = categoria;
    const tallas = usaTablaDeTallas ? (marca?.tallas ?? []) : [];
    const quedan = await disponibles(this.prisma, variantes);

    return {
      ...resto,
      categoria: { id: categoria.id, nombre: categoria.nombre },
      marca: marca ? { id: marca.id, nombre: marca.nombre } : null,
      precioSocioClp:
        porcentaje === null ? null : precioDeSocio(resto.precioClp, porcentaje),
      variantes: variantes.map((v) => ({
        id: v.id,
        etiqueta: v.etiqueta,
        talla: textoDeTalla(v.etiqueta, usaTablaDeTallas, tallas),
        disponible: quedan.get(v.id) ?? 0,
      })),
      tallas,
      fotos: fotos.map((foto) => ({
        id: foto.id,
        ...direccionesDeLaFoto(foto.id),
      })),
    };
  }

  async filtros(): Promise<FiltrosDelCatalogo> {
    const conAlgoVisible = { productos: { some: VISIBLE } };
    const [categorias, marcas, variantes, precios] = await Promise.all([
      this.prisma.categoriaProducto.findMany({
        where: conAlgoVisible,
        select: { id: true, nombre: true },
        orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.marca.findMany({
        where: conAlgoVisible,
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.variante.findMany({
        where: { activa: true, producto: VISIBLE },
        select: { etiqueta: true },
      }),
      this.prisma.producto.aggregate({
        where: VISIBLE,
        _min: { precioClp: true },
        _max: { precioClp: true },
      }),
    ]);

    // Sin distinguir mayúsculas, como el único de la base: "M" y "m" son la misma talla.
    const tallas = new Map(
      variantes.map((v) => [v.etiqueta.toLowerCase(), v.etiqueta]),
    );

    return {
      categorias,
      marcas,
      tallas: [...tallas.values()].sort((a, b) =>
        a.localeCompare(b, 'es', { numeric: true }),
      ),
      precioMin: precios._min.precioClp,
      precioMax: precios._max.precioClp,
    };
  }
}
