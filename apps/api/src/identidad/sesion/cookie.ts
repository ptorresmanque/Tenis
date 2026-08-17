import type { Request, Response } from 'express';

export const NOMBRE_COOKIE = 'sesion';

export const DIAS_DE_SESION = 30;
const VIDA_MS = DIAS_DE_SESION * 24 * 60 * 60 * 1000;

// SPEC-identidad.md § Sesión. `secure` va siempre: los navegadores tratan
// http://localhost como origen seguro, así que el desarrollo no necesita excepción
// y producción no depende de que alguien se acuerde de activarlo.
const ATRIBUTOS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const;

export function ponerCookieDeSesion(res: Response, token: string): void {
  res.cookie(NOMBRE_COOKIE, token, { ...ATRIBUTOS, maxAge: VIDA_MS });
}

export function borrarCookieDeSesion(res: Response): void {
  res.clearCookie(NOMBRE_COOKIE, ATRIBUTOS);
}

/**
 * Lee la cookie de sesión del encabezado. Express no parsea cookies por su cuenta
 * y traer `cookie-parser` para un solo nombre no se paga.
 */
export function tokenDeSesion(req: Request): string | null {
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const separador = parte.indexOf('=');
    if (separador > 0 && parte.slice(0, separador).trim() === NOMBRE_COOKIE) {
      return decodeURIComponent(parte.slice(separador + 1).trim()) || null;
    }
  }

  return null;
}
