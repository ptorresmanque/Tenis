/**
 * El club está en Santiago y sus horarios se leen en la hora de Santiago, sin
 * importar dónde esté el navegador. Un socio que abre la grilla desde un viaje
 * tiene que ver la misma hora que el que la abre desde la sede.
 *
 * Zona IANA y nunca un desfase fijo, por la misma razón que en la API: Chile
 * cambia la hora dos veces al año.
 */
const ZONA_DEL_CLUB = 'America/Santiago';

const RELOJ = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const CALENDARIO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_DEL_CLUB,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DIA_LARGO = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const PESOS = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

/**
 * Qué día es en el club en ese instante, "AAAA-MM-DD".
 *
 * No es lo mismo que cortar el ISO: un bloqueo que empieza a las 22:00 de un
 * lunes en Santiago llega como `2026-08-18T02:00:00Z`, y el corte diría martes.
 */
export function fechaEnElClub(instante: string | Date): string {
  return CALENDARIO.format(new Date(instante));
}

/** Hoy en el club, que es lo que come `<input type="date">`. */
export function hoyEnElClub(ahora = new Date()): string {
  return fechaEnElClub(ahora);
}

/** La hora que marca el reloj del club en ese instante, "HH:MM". */
export function horaEnElClub(instante: string | Date): string {
  return RELOJ.format(new Date(instante));
}

/** "lunes, 17 de agosto", para encabezar la grilla. */
export function diaEnPalabras(fecha: string): string {
  // Se lee a mediodía UTC y no a medianoche: a medianoche UTC en Santiago todavía
  // es el día anterior, y el encabezado mostraría un día menos que la grilla.
  return DIA_LARGO.format(new Date(`${fecha}T12:00:00.000Z`));
}

export function enPesos(monto: number): string {
  return PESOS.format(monto);
}
