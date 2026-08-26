/**
 * Los cortes del reporte de ingreso.
 *
 * Puro: ni base de datos ni reloj. Es la parte que decide **de qué columna es cada
 * peso**, y se prueba sola porque los errores que persigue no hacen fallar nada: un
 * reporte de plata equivocado no se cae, se usa para decidir una inversión.
 */

/** De dónde viene un peso. Las clases y los torneos entran acá cuando se cobren. */
export type Concepto = 'ARRIENDO' | 'CUOTA_MENSUAL' | 'CUOTA_INCORPORACION';

/**
 * Un peso que entró, ya atribuido a su período.
 *
 * **Los tres campos de cancha son nulos en las cuotas** y eso no es un descuido: una
 * cuota no se jugó en ninguna cancha, en ninguna condición y en ninguna franja. El tipo
 * lo dice para que ningún corte pueda olvidarse del caso.
 */
export interface Movimiento {
  montoClp: number;
  concepto: Concepto;
  cancha: string | null;
  techada: boolean | null;
  esPico: boolean | null;
  esSocio: boolean;
}

/** Los cinco cortes del spec. No hay un sexto: para otros cruces está el CSV. */
export const CORTES = [
  'cancha',
  'condicion',
  'franja',
  'usuario',
  'concepto',
] as const;

export type Corte = (typeof CORTES)[number];

export function esCorte(valor: unknown): valor is Corte {
  return CORTES.includes(valor as Corte);
}

export interface FilaDeIngreso {
  etiqueta: string;
  montoClp: number;
}

/**
 * Lo que se muestra cuando un corte no aplica.
 *
 * **Una fila propia y no una omisión.** Dejar las cuotas fuera del corte por cancha
 * haría que la suma de las filas no diera el total, y un reporte cuyas partes no suman
 * el todo es exactamente el que nadie puede auditar.
 */
const SIN_CANCHA = 'Sin cancha (cuotas)';

const NOMBRE_DEL_CONCEPTO: Record<Concepto, string> = {
  ARRIENDO: 'Arriendo',
  CUOTA_MENSUAL: 'Cuota mensual',
  CUOTA_INCORPORACION: 'Cuota de incorporación',
};

/** En qué fila cae cada movimiento, según el corte pedido. */
function etiquetaDe(movimiento: Movimiento, corte: Corte): string {
  switch (corte) {
    case 'cancha':
      return movimiento.cancha ?? SIN_CANCHA;
    case 'condicion':
      if (movimiento.techada === null) return SIN_CANCHA;
      return movimiento.techada ? 'Techada' : 'Abierta';
    case 'franja':
      if (movimiento.esPico === null) return SIN_CANCHA;
      return movimiento.esPico ? 'Pico' : 'Valle';
    case 'usuario':
      return movimiento.esSocio ? 'Socio' : 'No socio';
    case 'concepto':
      return NOMBRE_DEL_CONCEPTO[movimiento.concepto];
  }
}

/**
 * Suma los movimientos en las filas del corte, de más a menos.
 *
 * De más a menos porque la pregunta del club es **cuál rinde**, no cómo se llaman en
 * orden alfabético. A igual monto, por etiqueta, para que dos consultas seguidas no
 * devuelvan la tabla en distinto orden.
 */
export function agrupar(
  movimientos: Movimiento[],
  corte: Corte,
): FilaDeIngreso[] {
  const porEtiqueta = new Map<string, number>();

  for (const movimiento of movimientos) {
    const etiqueta = etiquetaDe(movimiento, corte);
    porEtiqueta.set(
      etiqueta,
      (porEtiqueta.get(etiqueta) ?? 0) + movimiento.montoClp,
    );
  }

  return [...porEtiqueta]
    .map(([etiqueta, montoClp]) => ({ etiqueta, montoClp }))
    .sort(
      (una, otra) =>
        otra.montoClp - una.montoClp ||
        una.etiqueta.localeCompare(otra.etiqueta, 'es'),
    );
}
