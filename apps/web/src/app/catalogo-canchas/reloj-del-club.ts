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

const DIA_CON_ANIO = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const DIA_CORTO = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  weekday: 'short',
});

const MES_CORTO = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  month: 'short',
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

/** "Sáb", con mayúscula y sin punto: el día de un partido bajo su caja en el árbol. */
export function diaCortoEnElClub(instante: string | Date): string {
  const dia = DIA_CORTO.format(new Date(instante)).replace('.', '');
  return dia.charAt(0).toUpperCase() + dia.slice(1);
}

/** "lunes, 17 de agosto", para encabezar la grilla. */
export function diaEnPalabras(fecha: string): string {
  // Se lee a mediodía UTC y no a medianoche: a medianoche UTC en Santiago todavía
  // es el día anterior, y el encabezado mostraría un día menos que la grilla.
  //
  // Los diez primeros caracteres y no la cadena entera: una columna `DATE` viaja a
  // veces como "2026-11-10" y a veces como "2026-11-10T00:00:00.000Z", y concatenarle
  // la hora a la segunda forma daba una fecha inválida que hacía desaparecer el
  // bloque entero sin un solo error a la vista.
  return DIA_LARGO.format(new Date(`${fecha.slice(0, 10)}T12:00:00.000Z`));
}

/**
 * "26 de agosto de 2025", para fechas que no son de esta semana.
 *
 * Con año y sin día de la semana, al revés que `diaEnPalabras`: el corte del ranking
 * está siempre a un año de distancia, y ahí "el 26 de agosto" no dice nada mientras
 * que "martes" no le importa a nadie.
 */
export function diaConAnioEnPalabras(fecha: string): string {
  return DIA_CON_ANIO.format(new Date(`${fecha.slice(0, 10)}T12:00:00.000Z`));
}

/**
 * "ago", para el bloque de fecha de las tarjetas.
 *
 * Se le pide el mes a Intl en vez de recortar el "lunes, 17 de agosto" de
 * `diaEnPalabras`: ese texto está en español y con esa forma **hoy**, y quien
 * cambie el formato o el idioma no tiene por qué adivinar que alguien lo estaba
 * partiendo por " de " en otro archivo.
 *
 * Los tres caracteres son del diseño, no del idioma: es una columna angosta bajo
 * el número del día. Intl devuelve "sept" para septiembre y a veces con punto,
 * así que se normaliza acá.
 */
export function mesCortoEnElClub(instante: string | Date): string {
  return MES_CORTO.format(new Date(instante)).replace('.', '').slice(0, 3);
}

/**
 * Cuántos minutos dura un bloque o una reserva. Restar los instantes alcanza: Chile cambia
 * la hora a medianoche, con el club cerrado, así que ningún tramo cruza el cambio.
 */
export function minutosDe({ inicio, fin }: { inicio: string; fin: string }): number {
  return (Date.parse(fin) - Date.parse(inicio)) / 60_000;
}

export function enPesos(monto: number): string {
  return PESOS.format(monto);
}

export interface DiaDelClub {
  /** "AAAA-MM-DD", lo que comen la API y el `<input type="date">`. */
  fecha: string;
  /** "Hoy", "Mañana" o el día abreviado: "jue". */
  etiqueta: string;
  /** El número del día, para la segunda línea del chip. */
  numero: string;
}

/**
 * Los próximos días del club, para la tira de chips de la disponibilidad.
 *
 * Cada día se calcula desde el mediodía UTC y no sumando 24 horas: los dos
 * domingos al año en que Chile cambia la hora tienen 23 o 25, y sumando horas la
 * tira saltaría un día o repetiría el mismo. A mediodía UTC en Santiago son las
 * 08:00 o las 09:00, así que siempre cae dentro del día que corresponde.
 */
export function proximosDias(cuantos: number, ahora = new Date()): DiaDelClub[] {
  const base = new Date(`${hoyEnElClub(ahora)}T12:00:00.000Z`);

  return Array.from({ length: cuantos }, (_, i) => {
    const dia = new Date(base);
    dia.setUTCDate(base.getUTCDate() + i);

    return {
      fecha: fechaEnElClub(dia),
      etiqueta:
        i === 0
          ? 'Hoy'
          : i === 1
            ? 'Mañana'
            : // Intl devuelve "jue." con punto; el chip se ve mejor sin él.
              DIA_CORTO.format(dia).replace('.', ''),
      numero: String(Number(fechaEnElClub(dia).slice(8))),
    };
  });
}
