import { BadRequestException } from '@nestjs/common';

/**
 * La tabla de puntos de un nivel (T189): cuánto da cada resultado, contando desde la
 * final hacia atrás. Siete filas cubren un cuadro de 64; una ronda más lejos da cero.
 */
export interface TablaDePuntos {
  campeon: number;
  finalista: number;
  semifinal: number;
  cuartos: number;
  octavos: number;
  dieciseisavos: number;
  treintaidosavos: number;
}

/** Las siete columnas de `NivelTemporada`, para el `select`. */
export const COLUMNAS_DE_LA_TABLA = {
  puntosCampeon: true,
  puntosFinalista: true,
  puntosSemifinal: true,
  puntosCuartos: true,
  puntosOctavos: true,
  puntosDieciseisavos: true,
  puntosTreintaidosavos: true,
} as const;

/**
 * De las columnas a la tabla. La leen igual el panel de tours y el ranking (T198), así
 * que vive acá y no en cada uno.
 */
export function deColumnas(fila: {
  puntosCampeon: number;
  puntosFinalista: number;
  puntosSemifinal: number;
  puntosCuartos: number;
  puntosOctavos: number;
  puntosDieciseisavos: number;
  puntosTreintaidosavos: number;
}): TablaDePuntos {
  return {
    campeon: fila.puntosCampeon,
    finalista: fila.puntosFinalista,
    semifinal: fila.puntosSemifinal,
    cuartos: fila.puntosCuartos,
    octavos: fila.puntosOctavos,
    dieciseisavos: fila.puntosDieciseisavos,
    treintaidosavos: fila.puntosTreintaidosavos,
  };
}

/**
 * Las filas en orden, con cómo se nombran en un mensaje. El español no deja armarlos con
 * una sola plantilla: "el campeón no puede", "los cuartos no pueden".
 */
const FILAS: {
  clave: keyof TablaDePuntos;
  sujeto: string;
  plural: boolean;
  /** Cuando es la fila de arriba en la comparación: "más puntos que la final". */
  referencia: string;
  /** "Faltan los puntos del campeón", "… de cuartos". */
  de: string;
}[] = [
  {
    clave: 'campeon',
    sujeto: 'El campeón',
    plural: false,
    referencia: 'el campeón',
    de: 'del campeón',
  },
  {
    clave: 'finalista',
    sujeto: 'El finalista',
    plural: false,
    referencia: 'la final',
    de: 'del finalista',
  },
  {
    clave: 'semifinal',
    sujeto: 'La semifinal',
    plural: false,
    referencia: 'la semifinal',
    de: 'de la semifinal',
  },
  {
    clave: 'cuartos',
    sujeto: 'Los cuartos',
    plural: true,
    referencia: 'los cuartos',
    de: 'de cuartos',
  },
  {
    clave: 'octavos',
    sujeto: 'Los octavos',
    plural: true,
    referencia: 'los octavos',
    de: 'de octavos',
  },
  {
    clave: 'dieciseisavos',
    sujeto: 'Los dieciseisavos',
    plural: true,
    referencia: 'los dieciseisavos',
    de: 'de dieciseisavos',
  },
  {
    clave: 'treintaidosavos',
    sujeto: 'Los treintaidosavos',
    plural: true,
    referencia: 'los treintaidosavos',
    de: 'de treintaidosavos',
  },
];

/**
 * El techo de una fila: contra el dedazo de un cero de más, como el tope de las cuotas.
 * Un Máster del club no da cien mil puntos.
 */
const TOPE = 100_000;

/**
 * Lee la tabla y la valida entera (`SPEC-tours.md` § La tabla de puntos).
 *
 * **La escala no se puede desordenar**: cada fila vale lo mismo o menos que la anterior,
 * el campeón da más de cero y ninguna fila es negativa. Es lo único que sobrevive del
 * diseño anterior, que fijaba los porcentajes justamente para que nadie pudiera dejar la
 * semifinal por encima de la final. **La primera ronda sí puede dar puntos** (D7): si el
 * club no quiere premiar la participación, pone cero.
 *
 * Por eso la tabla se lee completa y no fila por fila: la regla compara filas entre sí.
 */
export function leerTabla(valor: unknown): TablaDePuntos {
  if (typeof valor !== 'object' || valor === null) {
    throw new BadRequestException('Falta la tabla de puntos.');
  }

  const datos = valor as Record<string, unknown>;
  const tabla = {} as TablaDePuntos;

  for (const fila of FILAS) {
    const puntos = datos[fila.clave];

    if (typeof puntos !== 'number' || !Number.isInteger(puntos)) {
      throw new BadRequestException(
        `Faltan los puntos ${fila.de}, en número entero.`,
      );
    }
    if (puntos < 0) {
      throw new BadRequestException(
        `${fila.sujeto} no ${fila.plural ? 'pueden' : 'puede'} dar puntos negativos.`,
      );
    }
    if (puntos > TOPE) {
      throw new BadRequestException(
        `${fila.sujeto} no ${fila.plural ? 'pueden' : 'puede'} dar más de ${TOPE.toLocaleString('es-CL')} puntos.`,
      );
    }

    tabla[fila.clave] = puntos;
  }

  if (tabla.campeon === 0) {
    throw new BadRequestException(
      'El campeón tiene que dar más de cero puntos.',
    );
  }

  FILAS.slice(1).forEach((fila, i) => {
    const arriba = FILAS[i];

    if (tabla[fila.clave] > tabla[arriba.clave]) {
      throw new BadRequestException(
        `${fila.sujeto} no ${fila.plural ? 'pueden' : 'puede'} dar más puntos que ` +
          `${arriba.referencia} (${tabla[fila.clave]} contra ${tabla[arriba.clave]}).`,
      );
    }
  });

  return tabla;
}
