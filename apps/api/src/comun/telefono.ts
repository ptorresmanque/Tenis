import { BadRequestException } from '@nestjs/common';

/**
 * El teléfono, con una sola regla para todo el sitio (T120): **+56 y 9 dígitos**.
 *
 * Nació en torneos (T64) como la **llave de identidad** de un jugador: el teléfono es lo
 * único que el club le puede pedir a un desconocido, la persona lo escribe igual todos los
 * años y el club lo necesita para llamarlo. Ver `SPEC-torneos.md` § El jugador no es el
 * socio. Desde la sexta parte vale para todos los formularios (decisión 1).
 *
 * **Normalizar es parte de la llave, no un detalle de presentación.** `+56 9 8765 4321`,
 * `56987654321` y `9 8765 4321` son la misma persona; sin llevarlos a una sola forma, el
 * único de la base no impide nada y el ranking suma los puntos de alguien en dos filas.
 *
 * **Hasta T120 aceptaba números extranjeros**, de 8 a 15 dígitos, porque al torneo venían
 * jugadores de afuera. El club decidió +56 fijo en todo: el extranjero deja un número
 * chileno o ninguno. Los que ya estaban guardados no se tocan (la migración de T120 los deja
 * como estaban) y `mostrarTelefono` los muestra tal cual.
 *
 * Puro a propósito: es la parte que más fácil se equivoca y la que decide si dos personas
 * son una, así que se prueba sola.
 */

/** Chile. Es el club, no una configuración. */
const PREFIJO_PAIS = '56';

/** Los 9 dígitos de un teléfono chileno, móvil o fijo, sin el prefijo. */
const DIGITOS = 9;

/**
 * La forma con que se guarda y se compara: `56` más los 9 dígitos. Nulo si no es un
 * teléfono chileno: quien no deja teléfono no es un error, es alguien a quien el club no
 * va a poder llamar.
 */
export function normalizarTelefono(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;

  const digitos = valor.replace(/\D/g, '');

  if (digitos.length === DIGITOS) return `${PREFIJO_PAIS}${digitos}`;
  if (
    digitos.length === DIGITOS + PREFIJO_PAIS.length &&
    digitos.startsWith(PREFIJO_PAIS)
  ) {
    return digitos;
  }

  return null;
}

/**
 * El teléfono de un cuerpo de petición: la forma guardada, nulo si vino vacío y es
 * opcional, o un 400 que dice el formato. Es lo que usan los DTO.
 */
export function leerTelefono(
  valor: unknown,
  opciones: { obligatorio: true },
): string;
export function leerTelefono(
  valor: unknown,
  opciones: { obligatorio: boolean },
): string | null;
export function leerTelefono(
  valor: unknown,
  { obligatorio }: { obligatorio: boolean },
): string | null {
  const vacio =
    valor === undefined ||
    valor === null ||
    (typeof valor === 'string' && valor.trim() === '');

  if (vacio) {
    if (obligatorio)
      throw new BadRequestException('El teléfono es obligatorio.');
    return null;
  }

  const telefono = normalizarTelefono(valor);

  if (telefono === null) {
    throw new BadRequestException(
      'El teléfono tiene que tener 9 dígitos, sin contar el +56.',
    );
  }

  return telefono;
}

/**
 * Cómo se lee en pantalla y en un correo: `+56 9 8765 4321`.
 *
 * El móvil y el fijo de Santiago se agrupan 1-4-4; el fijo de región, con su área de dos
 * dígitos, 2-3-4. Lo que no está en la forma guardada —un dato de antes que la migración
 * no pudo leer— se devuelve como vino: mejor verlo tal cual que perderlo.
 */
export function mostrarTelefono(guardado: string): string {
  if (!/^56\d{9}$/.test(guardado)) return guardado;

  const n = guardado.slice(PREFIJO_PAIS.length);

  return n.startsWith('9') || n.startsWith('2')
    ? `+56 ${n[0]} ${n.slice(1, 5)} ${n.slice(5)}`
    : `+56 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
}
