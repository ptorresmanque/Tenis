/**
 * Cuánto vive un pago sin terminar (`SPEC-pagos.md` § Expiración).
 *
 * No sale de `ConfiguracionClub`: no es una regla del club sino el tiempo que la
 * pasarela deja abierta una transacción, y darle una perilla al admin invita a
 * subirlo a una hora, con el bloque tomado todo ese rato.
 */
export const MINUTOS_PARA_EXPIRAR = 15;

/** Desde qué instante hacia atrás una pendiente ya no sirve. */
export function limiteDeExpiracion(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() - MINUTOS_PARA_EXPIRAR * 60_000);
}
