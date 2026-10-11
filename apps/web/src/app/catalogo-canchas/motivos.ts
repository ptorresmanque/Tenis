import { BloqueDisponible } from './disponibilidad';

/**
 * Cómo se nombra cada motivo de bloqueo. El enum de la base no se muestra crudo:
 * "MANTENCION" en pantalla se lee como un error del sistema.
 *
 * Aparte, como `superficies.ts`, porque lo usan la grilla y el marcador de la
 * portada (TV3.3): copiado en dos lados, el día que se sume un motivo uno de los
 * dos lo mostraría en mayúsculas.
 */
const MOTIVOS: Record<string, string> = {
  MANTENCION: 'En mantención',
  TORNEO: 'Torneo',
  CLASE: 'Clase',
  OTRO: 'No disponible',
};

/**
 * El ícono de cada motivo, para que lo cerrado no dependa del color. Acá y no en el
 * marcador por la misma razón que los nombres: lo usan el marcador y la grilla (T97).
 */
export const ICONOS_DE_MOTIVO: Record<string, string> = {
  MANTENCION: 'build',
  TORNEO: 'emoji_events',
  CLASE: 'school',
};

/** El motivo en palabras, o "No disponible" si no viene o no se conoce. */
export function nombreDelMotivo(motivo: BloqueDisponible['motivoBloqueo']): string {
  return (motivo && MOTIVOS[motivo]) ?? 'No disponible';
}
