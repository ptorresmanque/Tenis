/**
 * El mensaje que mandó el servidor, listo para mostrar.
 *
 * Se prefiere al genérico porque dice qué arreglar: "Ya hay una cancha con ese
 * nombre" o "El club necesita un nombre" resuelven el problema, y "algo salió mal"
 * obliga a adivinar.
 *
 * `message` puede venir como texto o como lista —`ValidationPipe` de Nest devuelve
 * un arreglo cuando falla más de un campo—, y de ahí las dos ramas.
 *
 * Para los rechazos de dominio de `reservas`, que además traen un `motivo` con el
 * que la pantalla decide qué ofrecer, está `mensajeDeRechazo` en su servicio.
 */
export function mensajeDelServidor(
  falla: unknown,
  porDefecto = 'No se pudo guardar. Reintenta en un momento.',
): string {
  const mensaje = (falla as { error?: { message?: unknown } } | null)?.error
    ?.message;

  if (typeof mensaje === 'string') return mensaje;
  if (Array.isArray(mensaje) && typeof mensaje[0] === 'string') {
    return mensaje[0];
  }

  return porDefecto;
}
