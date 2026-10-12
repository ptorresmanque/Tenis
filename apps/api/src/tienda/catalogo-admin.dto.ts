import { BadRequestException } from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';

/** Una categoría tal como la escribe el admin (T156). */
export interface CategoriaNueva {
  nombre: string;
  usaTablaDeTallas?: boolean;
  /** Sin él, el servicio la pone al final. */
  orden?: number;
}

/** Una fila de la tabla de tallas de una marca. */
export interface FilaDeTallas {
  tallaCl: string;
  tallaUs: string;
  tallaEu: string;
}

/** El ancho de `nombre` en `categoria_producto` y en `marca`. */
const LARGO_DEL_NOMBRE = 80;

/** El ancho de cada talla en `equivalencia_talla`. */
const LARGO_DE_LA_TALLA = 10;

/** El techo que convierte un dedazo en el orden en un 400, como en las preguntas frecuentes. */
const ORDEN_MAXIMO = 1000;

/**
 * Cuántas filas caben en una tabla de tallas. Una de zapatillas de adulto tiene unas 20,
 * con las medias tallas; 100 deja de ser una tabla y pasa a ser un error.
 */
const FILAS_MAXIMAS = 100;

export function leerCategoria(cuerpo: unknown): CategoriaNueva {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    nombre: nombre(datos.nombre, 'la categoría'),
    usaTablaDeTallas:
      datos.usaTablaDeTallas === undefined
        ? undefined
        : siONo(datos.usaTablaDeTallas),
    orden: datos.orden === undefined ? undefined : orden(datos.orden),
  };
}

/** Solo lo que vino: marcar la tabla de tallas no pide repetir el nombre. */
export function leerCambioDeCategoria(
  cuerpo: unknown,
): Partial<CategoriaNueva> {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambio: Partial<CategoriaNueva> = {};

  if (datos.nombre !== undefined) {
    cambio.nombre = nombre(datos.nombre, 'la categoría');
  }
  if (datos.usaTablaDeTallas !== undefined) {
    cambio.usaTablaDeTallas = siONo(datos.usaTablaDeTallas);
  }
  if (datos.orden !== undefined) cambio.orden = orden(datos.orden);

  if (Object.keys(cambio).length === 0) {
    throw new BadRequestException('No viene ningún cambio.');
  }

  return cambio;
}

export function leerMarca(cuerpo: unknown): { nombre: string } {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return { nombre: nombre(datos.nombre, 'la marca') };
}

/**
 * La tabla de tallas entera: `{ tallas: [{ tallaCl, tallaUs, tallaEu }, …] }`.
 *
 * **Una talla chilena repetida se rechaza acá, antes de tocar la base**, con la talla en
 * el mensaje. El único de la tabla la atajaría igual, pero con un error que no dice cuál
 * de las veinte filas está repetida.
 */
export function leerTablaDeTallas(cuerpo: unknown): FilaDeTallas[] {
  const { tallas } = (cuerpo ?? {}) as Record<string, unknown>;

  if (!Array.isArray(tallas)) {
    throw new BadRequestException('Falta la tabla de tallas.');
  }
  if (tallas.length > FILAS_MAXIMAS) {
    throw new BadRequestException(
      `Una tabla de tallas no puede tener más de ${FILAS_MAXIMAS} filas.`,
    );
  }

  const filas = tallas.map((fila: unknown) => {
    const datos = (fila ?? {}) as Record<string, unknown>;

    return {
      tallaCl: talla(datos.tallaCl, 'CL'),
      tallaUs: talla(datos.tallaUs, 'US'),
      tallaEu: talla(datos.tallaEu, 'EU'),
    };
  });

  const vistas = new Set<string>();
  for (const { tallaCl } of filas) {
    // Sin distinguir mayúsculas, como el único de la base: "xl" y "XL" son la misma.
    const clave = tallaCl.toLowerCase();

    if (vistas.has(clave)) {
      throw new BadRequestException(
        `La talla CL ${tallaCl} está dos veces en la tabla.`,
      );
    }
    vistas.add(clave);
  }

  return filas;
}

function nombre(valor: unknown, de: string): string {
  const limpio = typeof valor === 'string' ? valor.trim() : '';

  if (!limpio) throw new BadRequestException(`Falta el nombre de ${de}.`);
  if (limpio.length > LARGO_DEL_NOMBRE) {
    throw new BadRequestException(
      `Acorta el nombre de ${de}: tiene más de ${LARGO_DEL_NOMBRE} caracteres.`,
    );
  }

  return limpio;
}

function talla(valor: unknown, sistema: string): string {
  const limpia = typeof valor === 'string' ? valor.trim() : '';

  if (!limpia) {
    throw new BadRequestException(
      `Falta la talla ${sistema} en una fila de la tabla.`,
    );
  }
  if (limpia.length > LARGO_DE_LA_TALLA) {
    throw new BadRequestException(
      `La talla ${sistema} "${limpia}" es demasiado larga: hasta ${LARGO_DE_LA_TALLA} caracteres.`,
    );
  }

  return limpia;
}

function siONo(valor: unknown): boolean {
  if (typeof valor !== 'boolean') {
    throw new BadRequestException(
      'Si la categoría usa tabla de tallas tiene que ser sí o no.',
    );
  }

  return valor;
}

function orden(valor: unknown): number {
  return entero(valor, 'El orden de la categoría', 0, ORDEN_MAXIMO);
}
