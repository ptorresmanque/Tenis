import { BadRequestException } from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';

/** Lo que el panel edita de la tienda (T172). */
export interface ConfiguracionDeLaTienda {
  descuentoSocioPorcentaje: number;
  umbralStockBajo: number;
  arriendoRaquetasTexto: string;
}

/** La mitad del precio: más que eso no es un descuento de socio, es un regalo (T172). */
const DESCUENTO_MAXIMO = 50;
const UMBRAL_MAXIMO = 100;
/** El ancho de `arriendo_raquetas_texto`. */
const LARGO_DEL_ARRIENDO = 600;

/** Solo lo que vino. Nada que cambiar es un 400, como en el resto del panel. */
export function leerConfiguracion(
  cuerpo: unknown,
): Partial<ConfiguracionDeLaTienda> {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambio: Partial<ConfiguracionDeLaTienda> = {};

  if (datos.descuentoSocioPorcentaje !== undefined) {
    cambio.descuentoSocioPorcentaje = entero(
      datos.descuentoSocioPorcentaje,
      'El descuento de socio',
      0,
      DESCUENTO_MAXIMO,
    );
  }
  if (datos.umbralStockBajo !== undefined) {
    cambio.umbralStockBajo = entero(
      datos.umbralStockBajo,
      'El umbral de stock bajo',
      0,
      UMBRAL_MAXIMO,
    );
  }
  if (datos.arriendoRaquetasTexto !== undefined) {
    if (typeof datos.arriendoRaquetasTexto !== 'string') {
      throw new BadRequestException('El texto del arriendo va como texto.');
    }
    const texto = datos.arriendoRaquetasTexto.trim();
    if (texto.length > LARGO_DEL_ARRIENDO) {
      throw new BadRequestException(
        `Acorta el texto del arriendo: tiene más de ${LARGO_DEL_ARRIENDO} caracteres.`,
      );
    }
    cambio.arriendoRaquetasTexto = texto;
  }

  if (Object.keys(cambio).length === 0) {
    throw new BadRequestException('No viene ningún cambio.');
  }

  return cambio;
}
