import { Prisma } from '../generated/prisma/client';

/** Prisma reporta toda violación de constraint único con este código. */
const CODIGO_UNICIDAD = 'P2002';

/**
 * Distingue "alguien se te adelantó" de cualquier otra falla de base de datos.
 *
 * Es la diferencia entre decirle al usuario "ese bloque lo tomaron recién,
 * elige otro" y devolverle un 500. Todo el módulo de reservas se apoya acá.
 */
export function esViolacionDeUnicidad(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === CODIGO_UNICIDAD
  );
}

/** "Write conflict or deadlock": la base abortó la transacción y pide repetirla. */
const CODIGO_CONFLICTO = 'P2034';

/**
 * Repite el trabajo si la base lo abortó por un deadlock. Cualquier otro error pasa.
 *
 * Existe por el único `WITHOUT OVERLAPS` de `reserva` (T76): para saber si un rango se
 * cruza con otro, MariaDB bloquea un tramo del índice, y dos escrituras simultáneas
 * —aunque sean de canchas distintas— pueden quedar esperándose una a la otra. Bajo
 * carga le pasó a un tercio de los intentos. El deadlock no deja nada escrito, así que
 * repetir es seguro; y la segunda vez el intento termina bien o choca de verdad con un
 * duplicado, que es la respuesta que corresponde.
 *
 * **El trabajo tiene que ser la transacción entera**, no una consulta suelta dentro de
 * ella: MariaDB revierte la transacción completa, y repetir solo el último paso sobre
 * una transacción abortada no tiene sentido.
 */
export async function reintentarSiHayDeadlock<T>(
  trabajo: () => Promise<T>,
  intentos = 5,
): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await trabajo();
    } catch (error) {
      const esConflicto =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === CODIGO_CONFLICTO;

      if (!esConflicto || intento >= intentos) throw error;

      // Unos milisegundos al azar: los dos que chocaron reintentarían a la vez y
      // volverían a chocar.
      await new Promise((listo) => setTimeout(listo, Math.random() * 20));
    }
  }
}
