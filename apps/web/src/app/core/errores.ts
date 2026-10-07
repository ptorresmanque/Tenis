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
 *
 * `soloSi` limita el texto del servidor a los estados que le dicen a la persona qué
 * hacer —corregir (400), esperar (429)—. Lo demás sería "Internal server error", que
 * no le sirve a nadie y suena a que la persona hizo algo mal.
 */
export function mensajeDelServidor(
  falla: unknown,
  porDefecto = 'No se pudo guardar. Reintenta en un momento.',
  soloSi?: number[],
): string {
  const respuesta = falla as { status?: number; error?: { message?: unknown } } | null;
  const mensaje = respuesta?.error?.message;

  if (soloSi && !soloSi.includes(respuesta?.status ?? 0)) return porDefecto;
  if (typeof mensaje === 'string') return mensaje;
  if (Array.isArray(mensaje) && typeof mensaje[0] === 'string') {
    return mensaje[0];
  }

  return porDefecto;
}
