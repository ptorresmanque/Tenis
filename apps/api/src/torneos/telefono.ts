/**
 * El teléfono como **llave de identidad** de un jugador.
 *
 * Con la inscripción pública, quien escribe el nombre es el propio jugador, distinto
 * cada año y sin nadie que revise antes de guardar. El teléfono es la única llave que
 * el club le puede pedir a un desconocido, que la persona escribe igual todos los años,
 * y que además necesita para llamarlo. Ver `SPEC-torneos.md` § El jugador no es el
 * socio.
 *
 * **Normalizar es parte de la llave, no un detalle de presentación.** `+56 9 8765 4321`,
 * `56987654321` y `9 8765 4321` son la misma persona; sin llevarlos a una sola forma, el
 * único de la base no impide nada y el ranking termina sumando los puntos de alguien en
 * tres filas distintas.
 *
 * Puro a propósito: es la parte del módulo que más fácil se equivoca y la que decide si
 * dos personas son una, así que se prueba sola, sin levantar nada.
 */

/** Chile. Es el club, no una configuración. */
const PREFIJO_PAIS = '56';

/**
 * Cuántos dígitos se aceptan.
 *
 * Ocho por abajo porque un número chileno sin prefijo ya los tiene; quince por arriba
 * porque es el máximo del E.164 y **el torneo recibe jugadores de otros países**, que
 * escriben su número con su propio prefijo y no hay por qué rechazarlos.
 */
const MINIMO_DIGITOS = 8;
const MAXIMO_DIGITOS = 15;

/**
 * Lleva un teléfono escrito por una persona a la forma con que se guarda y se compara.
 *
 * Devuelve `null` cuando no queda un número usable: quien no deja teléfono no es un
 * error, es alguien a quien el club no va a poder llamar.
 *
 * **Los locales se completan con el prefijo del país y los extranjeros se dejan como
 * están.** Ponerle `56` a un número argentino de once dígitos lo convertiría en otro
 * número, y el club llamaría a un desconocido.
 */
export function normalizarTelefono(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;

  const digitos = valor.replace(/\D/g, '');

  if (digitos.length < MINIMO_DIGITOS || digitos.length > MAXIMO_DIGITOS) {
    return null;
  }

  return canonico(digitos);
}

/**
 * Las tres formas en que un chileno escribe su celular, llevadas a una.
 *
 * - `56987654321` (11 dígitos, ya con prefijo) queda igual.
 * - `987654321` (9, el móvil completo) recibe el `56`.
 * - `87654321` (8, el móvil sin su 9) recibe `569`. Es como todavía lo dicta media
 *   generación, y rechazarlo sería pedirle al club que corrija a sus socios.
 *
 * Cualquier otro largo se deja intacto: o es un fijo con área, o es de otro país.
 */
function canonico(digitos: string): string {
  if (digitos.length === 11 && digitos.startsWith(PREFIJO_PAIS)) return digitos;
  if (digitos.length === 9) return `${PREFIJO_PAIS}${digitos}`;
  if (digitos.length === 8) return `${PREFIJO_PAIS}9${digitos}`;

  return digitos;
}
