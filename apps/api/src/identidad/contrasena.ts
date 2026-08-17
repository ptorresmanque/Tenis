import { hash } from '@node-rs/argon2';

import { CONTRASENAS_FILTRADAS } from './contrasenas-filtradas';

/**
 * SPEC-identidad.md § Autenticación: largo mínimo 10 y contraste contra una lista
 * de filtradas. Sin exigir símbolos ni mayúsculas: esa clase de regla empuja a
 * `Tenis2026!` y no a una contraseña larga de verdad.
 */
export const LARGO_MINIMO = 10;

/** Devuelve el motivo del rechazo, o null si la contraseña sirve. */
export function problemaDeContrasena(contrasena: string): string | null {
  // El largo se mide sin los espacios de los bordes —doce espacios miden doce
  // caracteres y no protegen nada—, pero la contraseña se guarda tal como llegó:
  // recortarla cambiaría en silencio lo que la persona escribió.
  if (contrasena.trim().length < LARGO_MINIMO) {
    return `La contraseña necesita al menos ${LARGO_MINIMO} caracteres.`;
  }

  if (CONTRASENAS_FILTRADAS.has(contrasena.trim().toLowerCase())) {
    return 'Esa contraseña aparece en listas de contraseñas filtradas. Elegí otra.';
  }

  return null;
}

/**
 * Hash argon2id. Los parámetros son los que la librería trae por omisión
 * (19 MiB, 2 pasadas), que son los que OWASP recomienda; se declaran explícitos
 * para que un cambio de default en la librería no los mueva sin que nadie mire.
 */
// El `Algorithm` de la librería es un `declare const enum`, y con isolatedModules
// activo TypeScript no deja leerlo. El valor 2 es Argon2id; el test verifica que el
// hash empiece con `$argon2id$`, así que un cambio de numeración no pasa callado.
const ARGON2ID = 2;

export function hashear(contrasena: string): Promise<string> {
  return hash(contrasena, {
    algorithm: ARGON2ID,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}
