import { createHash, randomBytes } from 'node:crypto';

/**
 * Tokens opacos que viajan al usuario —enlace de verificación, cookie de sesión— y
 * de los que en la base solo queda el hash.
 *
 * SHA-256 sin sal a propósito: el token son 256 bits de azar, no una contraseña, y
 * la búsqueda tiene que ser un índice exacto. Un hash lento acá no protege de nada
 * y convertiría cada request autenticado en un cálculo de argon2.
 */
export function nuevoToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
