import { BadRequestException } from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';

export type OrdenDelCatalogo = 'novedad' | 'precio-asc' | 'precio-desc';

/** Lo que el comprador filtra en `/tienda` (T161). Nulo es "sin ese filtro". */
export interface FiltroDelCatalogo {
  categoriaId: number | null;
  marcaId: number | null;
  talla: string | null;
  precioMin: number | null;
  precioMax: number | null;
  orden: OrdenDelCatalogo;
}

/** Como llega en la URL: todo texto, y un parámetro repetido llega como lista. */
export function leerFiltroDelCatalogo(
  consulta: Record<string, unknown>,
): FiltroDelCatalogo {
  return {
    categoriaId: numero(consulta.categoriaId, 'La categoría', 1),
    marcaId: numero(consulta.marcaId, 'La marca', 1),
    talla: talla(consulta.talla),
    precioMin: numero(consulta.precioMin, 'El precio mínimo', 0),
    precioMax: numero(consulta.precioMax, 'El precio máximo', 0),
    orden: orden(consulta.orden),
  };
}

function numero(valor: unknown, campo: string, minimo: number): number | null {
  if (valor === undefined || valor === '') return null;

  return entero(typeof valor === 'string' ? Number(valor) : NaN, campo, minimo);
}

/** El ancho de `variante.etiqueta`: más largo no calza con ninguna. */
const LARGO_DE_LA_TALLA = 40;

function talla(valor: unknown): string | null {
  if (valor === undefined) return null;
  if (typeof valor !== 'string' || valor.length > LARGO_DE_LA_TALLA) {
    throw new BadRequestException('La talla no se entiende.');
  }

  return valor.trim() || null;
}

function orden(valor: unknown): OrdenDelCatalogo {
  if (valor === undefined || valor === '') return 'novedad';
  if (valor === 'novedad' || valor === 'precio-asc' || valor === 'precio-desc')
    return valor;

  throw new BadRequestException(
    'El orden es novedad, precio-asc o precio-desc.',
  );
}
