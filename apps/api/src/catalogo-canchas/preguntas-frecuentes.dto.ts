import { BadRequestException } from '@nestjs/common';

import { texto } from '../identidad/registro.dto';
import { entero } from './admin.dto';

/** Una pregunta frecuente tal como la escribe el admin (T144). */
export interface PreguntaFrecuenteNueva {
  pregunta: string;
  respuesta: string;
  /** Sin él, el servicio la pone al final. */
  orden?: number;
}

/**
 * Cuánto cabe en una respuesta. Una respuesta más larga ya no es frecuente: es una
 * página aparte.
 */
const LARGO_DE_LA_RESPUESTA = 2000;

/** El techo que convierte un dedazo en el orden —un año, un teléfono— en un 400. */
const ORDEN_MAXIMO = 1000;

export function leerPreguntaFrecuente(cuerpo: unknown): PreguntaFrecuenteNueva {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    pregunta: texto(datos.pregunta, 'la pregunta'),
    respuesta: respuesta(datos.respuesta),
    orden: datos.orden === undefined ? undefined : orden(datos.orden),
  };
}

/** Solo lo que vino: corregir una respuesta no pide repetir la pregunta. */
export function leerCambioDePreguntaFrecuente(
  cuerpo: unknown,
): Partial<PreguntaFrecuenteNueva> {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambio: Partial<PreguntaFrecuenteNueva> = {};

  if (datos.pregunta !== undefined) {
    cambio.pregunta = texto(datos.pregunta, 'la pregunta');
  }
  if (datos.respuesta !== undefined)
    cambio.respuesta = respuesta(datos.respuesta);
  if (datos.orden !== undefined) cambio.orden = orden(datos.orden);

  if (Object.keys(cambio).length === 0) {
    throw new BadRequestException('No viene ningún cambio.');
  }

  return cambio;
}

/**
 * La respuesta, sin espacios a los lados y con sus saltos de línea.
 *
 * **Se rechaza por largo y no se recorta**, al revés que los datos del club: recortarla
 * publicaría una respuesta cortada a la mitad sin que nadie lo note. El formulario no
 * deja pasar el largo, así que esto solo salta con un cliente que no es el panel.
 */
function respuesta(valor: unknown): string {
  const limpia = typeof valor === 'string' ? valor.trim() : '';

  if (!limpia) throw new BadRequestException('Falta la respuesta.');
  if (limpia.length > LARGO_DE_LA_RESPUESTA) {
    throw new BadRequestException(
      `Acorta la respuesta: tiene más de ${LARGO_DE_LA_RESPUESTA} caracteres.`,
    );
  }

  return limpia;
}

function orden(valor: unknown): number {
  return entero(valor, 'El orden de la pregunta', 0, ORDEN_MAXIMO);
}
