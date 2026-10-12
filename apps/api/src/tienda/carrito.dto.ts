import { BadRequestException } from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';

/** Una línea del carrito como la manda el navegador: **solo qué y cuánto**. */
export interface LineaDelCarrito {
  varianteId: number;
  cantidad: number;
}

/** Más de esto de una vez es un dedazo, no una compra: el club no vende al por mayor. */
export const CANTIDAD_MAXIMA = 99;

/** Una zapatilla en todas sus tallas son unas 20; 50 líneas es un carrito roto. */
const LINEAS_MAXIMAS = 50;

/**
 * `{ lineas: [{ varianteId, cantidad }] }`. **Cualquier otro campo se descarta**: un
 * precio que llegue del navegador no se lee, ni para compararlo (`SPEC.md` § Never).
 */
export function leerCarrito(cuerpo: unknown): LineaDelCarrito[] {
  const { lineas } = (cuerpo ?? {}) as Record<string, unknown>;

  if (!Array.isArray(lineas)) {
    throw new BadRequestException('El carrito llega como una lista de líneas.');
  }
  if (lineas.length > LINEAS_MAXIMAS) {
    throw new BadRequestException(
      `Un carrito lleva hasta ${LINEAS_MAXIMAS} productos distintos.`,
    );
  }

  const leidas = lineas.map((linea: unknown) => {
    const datos = (linea ?? {}) as Record<string, unknown>;

    return {
      varianteId: entero(datos.varianteId, 'Cada producto del carrito', 1),
      cantidad: entero(datos.cantidad, 'La cantidad', 1, CANTIDAD_MAXIMA),
    };
  });

  // El carrito del sitio junta las unidades de una misma variante; dos líneas iguales son
  // otro cliente o un error, y sumarlas en silencio escondería cuál.
  if (new Set(leidas.map((l) => l.varianteId)).size !== leidas.length) {
    throw new BadRequestException('Un producto está dos veces en el carrito.');
  }

  return leidas;
}
