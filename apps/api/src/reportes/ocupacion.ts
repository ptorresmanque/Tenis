/**
 * La medición de ocupación de cancha.
 *
 * Pura: ni base de datos ni reloj. Acá se deciden las dos cosas que pueden mentir en
 * silencio, y por eso se prueban solas.
 */

/** Qué pasó con un bloque de la grilla. */
export type EstadoBloque = 'OCUPADO' | 'CERRADO' | 'LIBRE';

/**
 * El motivo de bloqueo que **no** es un cierre.
 *
 * En la base una clase es un `Bloqueo`, igual que una mantención. Tratarlas iguales
 * convierte las horas más productivas del club en horas cerradas, y encima las saca del
 * denominador: la ocupación saldría más alta cuantas más clases dé el club.
 */
const BLOQUEO_QUE_OCUPA = 'CLASE';

/** Algo que toma la cancha en un rango. Reservas confirmadas, hoy. */
export interface Ocupante {
  inicio: Date;
  fin: Date;
}

/**
 * De qué es este bloque.
 *
 * **El cierre gana sobre la reserva.** No debería haber una reserva confirmada bajo una
 * mantención —cerrar la cancela—, pero si la hay, la hora que el club cerró no estuvo a
 * la venta y no puede contarse como vendida.
 */
export function estadoDelBloque(
  bloque: {
    inicio: Date;
    fin: Date;
    bloqueado: boolean;
    motivoBloqueo: string | null;
  },
  ocupantes: Ocupante[],
): EstadoBloque {
  if (bloque.bloqueado) {
    return bloque.motivoBloqueo === BLOQUEO_QUE_OCUPA ? 'OCUPADO' : 'CERRADO';
  }

  // Se pisa si empieza antes de que el otro termine y termina después de que el otro
  // empiece. Los bordes exactos no cuentan: la misma regla que usa la grilla.
  const tomado = ocupantes.some(
    (quien) => quien.inicio < bloque.fin && quien.fin > bloque.inicio,
  );

  return tomado ? 'OCUPADO' : 'LIBRE';
}

/** Un bloque ya medido, con lo que hace falta para cortarlo. */
export interface BloqueMedido {
  cancha: string;
  techada: boolean;
  esPico: boolean;
  estado: EstadoBloque;
  /**
   * Cuánto pesa en el reporte, en horas de reloj.
   *
   * Desde T77 se mide en tramos de media hora, porque las reservas empiezan cada media
   * hora y una de 10:30 a 11:30 tocaría dos bloques de una hora. Pero el reporte habla
   * en horas: contar tramos mostraría 8 donde el club abrió 4.
   */
  horas: number;
}

/**
 * Los cortes que significan algo sobre un bloque.
 *
 * **Ni "socio" ni "concepto", que sí están en el ingreso.** Una hora libre no tiene
 * usuario ni concepto, y ofrecer esos cortes obligaría a inventar una fila que no
 * quiere decir nada. Los tres que quedan son los que contestan la pregunta del módulo:
 * si la techada rinde más que la abierta, y en qué franja.
 */
export const CORTES_DE_OCUPACION = ['cancha', 'condicion', 'franja'] as const;

export type CorteDeOcupacion = (typeof CORTES_DE_OCUPACION)[number];

export function esCorteDeOcupacion(valor: unknown): valor is CorteDeOcupacion {
  return CORTES_DE_OCUPACION.includes(valor as CorteDeOcupacion);
}

export interface FilaDeOcupacion {
  etiqueta: string;
  /** Las horas que la cancha estuvo abierta, cerradas incluidas. */
  horas: number;
  ocupados: number;
  cerrados: number;
  libres: number;
  /** `null` cuando no hubo ni una hora que ofrecer: un cero diría otra cosa. */
  porcentajeOcupacion: number | null;
}

function etiquetaDe(bloque: BloqueMedido, corte: CorteDeOcupacion): string {
  switch (corte) {
    case 'cancha':
      return bloque.cancha;
    case 'condicion':
      return bloque.techada ? 'Techada' : 'Abierta';
    case 'franja':
      return bloque.esPico ? 'Pico' : 'Valle';
  }
}

/**
 * Cuántas horas de las que el club ofreció se usaron.
 *
 * **Lo cerrado sale del denominador.** Una cancha cerrada por riego no está ocupada ni
 * desaprovechada: contarla como disponible castiga al club por mantener la cancha, y
 * contarla como ocupada le inventa un ingreso que no tuvo.
 */
export function agruparOcupacion(
  bloques: BloqueMedido[],
  corte: CorteDeOcupacion,
): FilaDeOcupacion[] {
  const porEtiqueta = new Map<string, FilaDeOcupacion>();

  for (const bloque of bloques) {
    const etiqueta = etiquetaDe(bloque, corte);
    const fila = porEtiqueta.get(etiqueta) ?? {
      etiqueta,
      horas: 0,
      ocupados: 0,
      cerrados: 0,
      libres: 0,
      porcentajeOcupacion: null,
    };

    fila.horas += bloque.horas;
    if (bloque.estado === 'OCUPADO') fila.ocupados += bloque.horas;
    if (bloque.estado === 'CERRADO') fila.cerrados += bloque.horas;
    if (bloque.estado === 'LIBRE') fila.libres += bloque.horas;

    porEtiqueta.set(etiqueta, fila);
  }

  return [...porEtiqueta.values()]
    .map((fila) => ({
      ...fila,
      porcentajeOcupacion: porcentajeDeOcupacion(fila),
    }))
    .sort(
      (una, otra) =>
        (otra.porcentajeOcupacion ?? -1) - (una.porcentajeOcupacion ?? -1) ||
        una.etiqueta.localeCompare(otra.etiqueta, 'es'),
    );
}

/**
 * Qué proporción de las horas ofrecidas se ocupó.
 *
 * **Exportada porque el total del reporte también la necesita**, y la regla tiene que
 * salir de un solo lugar: calculada aparte para el total, cambiar el redondeo o lo que
 * entra al denominador dejaría un reporte cuyo total no cuadra con sus filas, que es
 * exactamente el que nadie puede auditar.
 *
 * `null` y no cero cuando no hubo horas que ofrecer: un cero se lee como "nadie vino",
 * y lo que pasó fue que la cancha estuvo cerrada.
 */
export function porcentajeDeOcupacion(cuenta: {
  horas: number;
  ocupados: number;
  cerrados: number;
}): number | null {
  const ofrecidos = cuenta.horas - cuenta.cerrados;

  return ofrecidos === 0
    ? null
    : Math.round((cuenta.ocupados / ofrecidos) * 100);
}
