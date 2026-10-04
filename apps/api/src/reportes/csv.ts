/**
 * La salida a planilla.
 *
 * No es un adorno: el club lleva años trabajando en planillas y la directiva va a
 * querer sus propios cruces. Negarle el CSV no hace que use el panel, hace que copie
 * los números a mano y se equivoque.
 */

/**
 * Punto y coma y no coma.
 *
 * **Excel en español parte por punto y coma.** Con coma, el archivo se abre entero en
 * una sola columna y el club vuelve exactamente a lo que este archivo intenta evitar:
 * copiar a mano. El estándar dice coma, pero el estándar no es quien abre el archivo.
 *
 * Los decimales van con coma (ver `comoCelda`), y no chocan con el separador por la
 * misma razón: el separador es el punto y coma.
 */
export const SEPARADOR = ';';

/**
 * La marca que hace que Excel lea el archivo como UTF-8.
 *
 * Sin ella "Díaz" se abre como "DÃ­az" y el club concluye que el sistema guarda mal los
 * nombres. Tres bytes que evitan esa llamada.
 */
const BOM = '\uFEFF';

/** Lo que puede ir en una celda. `null` es una celda vacía, distinta de un cero. */
export type Celda = string | number | null;

/**
 * Arma el CSV.
 *
 * @param encabezados Los títulos de columna, en el orden de las celdas.
 * @param filas       Una fila por dato, con tantas celdas como encabezados.
 */
export function aCsv(encabezados: string[], filas: Celda[][]): string {
  const lineas = [encabezados, ...filas].map((fila) =>
    fila.map(comoCelda).join(SEPARADOR),
  );

  // CRLF porque es lo que dice el formato y lo que esperan las planillas viejas.
  return BOM + lineas.join('\r\n');
}

/**
 * Una celda, escapada si hace falta.
 *
 * **Un nombre con el separador adentro parte la fila en dos** y corre todas las
 * columnas de la derecha. En una planilla eso no se ve como un error: se ve como datos,
 * y alguien decide con ellos.
 */
function comoCelda(valor: Celda): string {
  if (valor === null) return '';
  // Coma decimal: es lo que Excel en español lee como número. Con punto, la media
  // hora de la ocupación (T77) se abre como texto o como fecha y la columna no suma.
  if (typeof valor === 'number') return String(valor).replace('.', ',');

  const necesitaComillas =
    valor.includes(SEPARADOR) || valor.includes('"') || /[\r\n]/.test(valor);

  // La comilla de adentro se duplica; si no, el campo queda abierto y se come el
  // resto del archivo.
  return necesitaComillas ? `"${valor.replaceAll('"', '""')}"` : valor;
}
