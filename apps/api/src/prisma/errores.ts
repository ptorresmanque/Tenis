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
