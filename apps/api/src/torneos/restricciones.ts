import { BadRequestException } from '@nestjs/common';

/**
 * Las franjas en que un inscrito **no puede** jugar.
 *
 * Puro: es lo que T67 consulta para no programarle un partido a una hora imposible, y
 * lo que decide si el club puede o no poner a alguien en la cancha. Se prueba solo.
 */

/** Una franja, tal como se guarda. `0 = domingo … 6 = sábado`, como `HorarioApertura`. */
export interface Franja {
  diaSemana: number;
  horaDesde: string;
  horaHasta: string;
}

/**
 * Lunes a viernes, y nada más.
 *
 * **El fin de semana no se puede bloquear**: el torneo se juega sábado y domingo, así
 * que permitir una franja ahí es permitir inscribirse a un torneo que uno no puede
 * jugar. El club se enteraría al armar el calendario, con la inscripción ya cerrada.
 */
const LUNES = 1;
const VIERNES = 5;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lee y valida una franja. Lo que no pase por acá no llega a la base. */
export function leerFranja(valor: unknown): Franja {
  const datos = (valor ?? {}) as Record<string, unknown>;

  const diaSemana = Number(datos.diaSemana);

  if (
    !Number.isInteger(diaSemana) ||
    diaSemana < LUNES ||
    diaSemana > VIERNES
  ) {
    throw new BadRequestException(
      'Las franjas van de lunes a viernes: el torneo se juega el fin de semana.',
    );
  }

  const horaDesde = hora(datos.horaDesde);
  const horaHasta = hora(datos.horaHasta);

  // **Una franja invertida bloquea todo o nada según cómo se lea**, y ninguna de las
  // dos es lo que la persona quiso decir. Se rechaza en vez de adivinar.
  if (horaDesde >= horaHasta) {
    throw new BadRequestException(
      `Esa franja termina antes de empezar: ${horaDesde} a ${horaHasta}.`,
    );
  }

  return { diaSemana, horaDesde, horaHasta };
}

/**
 * Las franjas de una inscripción. Ninguna es una respuesta válida.
 *
 * **No se valida que no se superpongan.** La pregunta que se le hace a la restricción
 * es "¿este horario cae dentro de alguna?", y dos franjas que se pisan responden lo
 * mismo que una sola fusionada: comprobarlo sería código que no cambia ninguna
 * respuesta.
 */
export function leerFranjas(valor: unknown): Franja[] {
  if (valor === undefined || valor === null) return [];

  if (!Array.isArray(valor)) {
    throw new BadRequestException('Las franjas se mandan como una lista.');
  }

  // Un tope para que un cuerpo sin autenticar no siembre miles de filas por
  // inscripción: cinco por día de semana es más de lo que nadie necesita.
  if (valor.length > 25) {
    throw new BadRequestException(
      'Son demasiadas franjas. Junta las que se pisan.',
    );
  }

  return valor.map(leerFranja);
}

/**
 * ¿Este partido cae dentro de alguna franja en que la persona no puede jugar?
 *
 * **Basta con que se solapen; no hace falta que la franja lo contenga entero.** Un
 * partido de 20:00 a 22:00 contra "no puedo de 21:00 a 23:00" es un partido que esa
 * persona no va a terminar, y programarlo igual es programar un walkover.
 *
 * Los dos extremos son abiertos: quien no puede hasta las 20:00 sí puede jugar a las
 * 20:00. Si no, dos franjas contiguas dejarían un hueco imposible de expresar.
 */
export function chocaConAlguna(
  franjas: Franja[],
  partido: { diaSemana: number; horaDesde: string; horaHasta: string },
): Franja | null {
  return (
    franjas.find(
      (franja) =>
        franja.diaSemana === partido.diaSemana &&
        franja.horaDesde < partido.horaHasta &&
        partido.horaDesde < franja.horaHasta,
    ) ?? null
  );
}

/** Cómo se lee una franja en un mensaje de error: "los martes de 18:00 a 21:00". */
export function enPalabras(franja: Franja): string {
  return `los ${DIAS[franja.diaSemana]} de ${franja.horaDesde} a ${franja.horaHasta}`;
}

const DIAS = [
  'domingos',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábados',
];

function hora(valor: unknown): string {
  if (typeof valor !== 'string' || !HORA.test(valor)) {
    throw new BadRequestException(
      'Las horas se escriben como HH:MM, entre 00:00 y 23:59.',
    );
  }

  return valor;
}
