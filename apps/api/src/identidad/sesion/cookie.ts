import type { Request, Response } from 'express';

export const NOMBRE_COOKIE = 'sesion';

export const DIAS_DE_SESION = 30;
const VIDA_MS = DIAS_DE_SESION * 24 * 60 * 60 * 1000;

/**
 * Si las cookies deben llevar `Secure`. SPEC-identidad.md § Sesión las pide
 * seguras, y lo son en todas partes menos en el localhost de desarrollo.
 *
 * Chrome acepta cookies `Secure` sobre `http://localhost`, pero Safari y otros las
 * descartan en silencio, y entonces no se puede entrar de ninguna forma. La
 * excepción se limita a localhost sobre http: cualquier otra combinación —https,
 * un host remoto, o la variable sin definir— lleva `Secure`, para que un despliegue
 * mal configurado falle del lado seguro.
 */
export function cookiesSeguras(): boolean {
  const api = process.env.API_PUBLIC_URL;
  if (!api) {
    return true;
  }

  try {
    const url = new URL(api);
    const enEstaMaquina =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    return !(url.protocol === 'http:' && enEstaMaquina);
  } catch {
    // Una URL ilegible es un error de configuración; se asume lo más seguro.
    return true;
  }
}

export function atributosDeCookie() {
  return {
    httpOnly: true,
    secure: cookiesSeguras(),
    sameSite: 'lax',
    path: '/',
  } as const;
}

export function ponerCookieDeSesion(res: Response, token: string): void {
  res.cookie(NOMBRE_COOKIE, token, { ...atributosDeCookie(), maxAge: VIDA_MS });
}

export function borrarCookieDeSesion(res: Response): void {
  res.clearCookie(NOMBRE_COOKIE, atributosDeCookie());
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
