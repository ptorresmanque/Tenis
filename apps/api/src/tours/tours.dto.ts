import { BadRequestException } from '@nestjs/common';

import { fechaDelClub } from '../comun/tiempo';

/** Lo que se escribe de un tour desde el panel. La imagen va aparte (T190). */
export interface TourNuevo {
  nombre: string;
  descripcion: string;
}

export interface TemporadaNueva {
  nombre: string;
  fechaInicio: Date;
  fechaFin: Date;
}

/** Los largos de las columnas. */
const LARGO_DEL_NOMBRE = 80;
const LARGO_DE_LA_TEMPORADA = 40;
/** Tres párrafos, y de sobra. Más largo ya no es la presentación de una liga. */
const LARGO_DE_LA_DESCRIPCION = 2000;

/** Un tour nuevo: solo el nombre. Lo demás se completa en su ficha. */
export function leerTourNuevo(cuerpo: unknown): Pick<TourNuevo, 'nombre'> {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    nombre: nombre(datos.nombre, 'el nombre del tour', LARGO_DEL_NOMBRE),
  };
}

/** Solo lo que vino: corregir la descripción no pide repetir el nombre. */
export function leerCambioDeTour(cuerpo: unknown): Partial<TourNuevo> {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambio: Partial<TourNuevo> = {};

  if (datos.nombre !== undefined) {
    cambio.nombre = nombre(
      datos.nombre,
      'el nombre del tour',
      LARGO_DEL_NOMBRE,
    );
  }
  if (datos.descripcion !== undefined) {
    cambio.descripcion = descripcion(datos.descripcion);
  }

  if (Object.keys(cambio).length === 0) {
    throw new BadRequestException('No viene ningún cambio.');
  }

  return cambio;
}

export function leerTemporadaNueva(cuerpo: unknown): TemporadaNueva {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    nombre: nombre(
      datos.nombre,
      'el nombre de la temporada',
      LARGO_DE_LA_TEMPORADA,
    ),
    ...fechas(datos),
  };
}

/**
 * Solo lo que vino. **Las dos fechas se cambian juntas o no se cambian**, como las del
 * torneo: comprobar una contra la guardada deja llegar a una temporada que termina antes
 * de empezar en dos pasos que por separado se ven bien.
 */
export function leerCambioDeTemporada(
  cuerpo: unknown,
): Partial<TemporadaNueva> {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambio: Partial<TemporadaNueva> = {};

  if (datos.nombre !== undefined) {
    cambio.nombre = nombre(
      datos.nombre,
      'el nombre de la temporada',
      LARGO_DE_LA_TEMPORADA,
    );
  }
  if (datos.fechaInicio !== undefined || datos.fechaFin !== undefined) {
    Object.assign(cambio, fechas(datos));
  }

  if (Object.keys(cambio).length === 0) {
    throw new BadRequestException('No viene ningún cambio.');
  }

  return cambio;
}

/**
 * Un nombre obligatorio, sin espacios a los lados.
 *
 * **Se rechaza por largo y no se recorta**: un nombre cortado a la mitad se publica en la
 * página del tour y en el ranking sin que nadie lo note. El formulario no deja pasar el
 * largo, así que esto solo salta con un cliente que no es el panel.
 */
function nombre(valor: unknown, campo: string, largo: number): string {
  const limpio = typeof valor === 'string' ? valor.trim() : '';

  if (!limpio) throw new BadRequestException(`Falta ${campo}.`);
  if (limpio.length > largo) {
    throw new BadRequestException(
      `Acorta ${campo}: tiene más de ${largo} caracteres.`,
    );
  }

  return limpio;
}

/** Texto plano con sus saltos de línea. Vacía es válida: el tour todavía no la tiene. */
function descripcion(valor: unknown): string {
  if (typeof valor !== 'string') {
    throw new BadRequestException('La descripción tiene que ser texto.');
  }

  const limpia = valor.trim();

  if (limpia.length > LARGO_DE_LA_DESCRIPCION) {
    throw new BadRequestException(
      `Acorta la descripción: tiene más de ${LARGO_DE_LA_DESCRIPCION} caracteres.`,
    );
  }

  return limpia;
}

function fechas(datos: Record<string, unknown>): {
  fechaInicio: Date;
  fechaFin: Date;
} {
  const fechaInicio = fecha(datos.fechaInicio, 'de inicio');
  const fechaFin = fecha(datos.fechaFin, 'de término');

  // El mismo día sí: una temporada de un solo torneo es una temporada.
  if (fechaInicio > fechaFin) {
    throw new BadRequestException(
      'La temporada no puede terminar antes de empezar.',
    );
  }

  return { fechaInicio, fechaFin };
}

/** Una fecha civil "AAAA-MM-DD". `fechaDelClub` es la que también rechaza el 30 de febrero. */
function fecha(valor: unknown, cual: string): Date {
  try {
    return fechaDelClub(typeof valor === 'string' ? valor : '');
  } catch {
    throw new BadRequestException(
      `La fecha ${cual} tiene que ser una fecha válida, como 2027-03-01.`,
    );
  }
}
