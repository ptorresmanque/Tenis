import { Injectable, Logger } from '@nestjs/common';

import { PerfilGoogle, ProveedorGoogle } from './google.port';

const AUTORIZACION = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';

interface RespuestaToken {
  id_token?: string;
}

/** Claims del id_token que se usan. Google manda muchos más. */
export interface ClaimsGoogle {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
}

function configuracion(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET. Ver apps/api/.env.example.',
    );
  }

  const api =
    process.env.API_PUBLIC_URL ??
    `http://localhost:${process.env.PORT ?? 3000}/api`;

  return { clientId, clientSecret, redirectUri: `${api}/auth/google/callback` };
}

/**
 * Lee los claims del id_token sin verificar la firma.
 *
 * Es seguro **solo acá**: este token llegó como respuesta directa del endpoint de
 * Google sobre TLS, no lo trajo el navegador. La propia documentación de Google lo
 * dice. Un id_token que llegara por cualquier otro camino habría que verificarlo
 * contra las claves públicas de Google antes de creerle una palabra.
 */
export function claimsDe(idToken: string): ClaimsGoogle | null {
  const payload = idToken.split('.')[1];
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as ClaimsGoogle;
  } catch {
    return null;
  }
}

@Injectable()
export class GoogleOAuth extends ProveedorGoogle {
  private readonly log = new Logger('Google');

  configurado(): boolean {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    );
  }

  urlDeAutorizacion(state: string, desafioPkce: string): string {
    const { clientId, redirectUri } = configuracion();

    const parametros = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: desafioPkce,
      code_challenge_method: 'S256',
      // No se piden permisos para actuar en nombre de nadie: esto es solo entrar.
      access_type: 'online',
    });

    return `${AUTORIZACION}?${parametros.toString()}`;
  }

  async perfil(
    codigo: string,
    verificadorPkce: string,
  ): Promise<PerfilGoogle | null> {
    const { clientId, clientSecret, redirectUri } = configuracion();

    const respuesta = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: codigo,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verificadorPkce,
      }),
    });

    if (!respuesta.ok) {
      // Sin el cuerpo de la respuesta: puede traer el código, que es una credencial.
      this.log.warn(`Google rechazó el canje del código: ${respuesta.status}`);
      return null;
    }

    const { id_token: idToken } = (await respuesta.json()) as RespuestaToken;
    const claims = idToken ? claimsDe(idToken) : null;

    if (!claims?.sub || !claims.email) {
      return null;
    }

    return {
      googleId: claims.sub,
      email: claims.email.toLowerCase(),
      emailVerificado: claims.email_verified === true,
      nombre: claims.given_name ?? claims.email.split('@')[0],
      apellido: claims.family_name ?? '',
    };
  }
}
