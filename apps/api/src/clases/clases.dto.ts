import { BadRequestException } from '@nestjs/common';

import {
  diaValido,
  entero,
  fechaDeCuerpo,
  instanteDeCuerpo,
} from '../catalogo-canchas/admin.dto';
import { NivelClase } from '../generated/prisma/client';

/** Una clase por agendar, con el rango ya resuelto a instantes. */
export interface ClaseNueva {
  canchaId: number;
  profesorId: number;
  /** Fecha civil del club, "AAAA-MM-DD". La grilla se pide por día, no por instante. */
  fecha: string;
  inicio: Date;
  fin: Date;
  cupoMaximo: number;
  nivel: NivelClase;
  notas: string | null;
}

/**
 * Una serie de clases (T113): la ficha de una clase, más los días de la semana y el rango
 * de fechas. Las horas quedan como reloj del club; cada fecha las convierte a instantes.
 */
export interface SerieNueva {
  canchaId: number;
  profesorId: number;
  /** De 0 (domingo) a 6 (sábado), sin repetidos y en orden. */
  diasSemana: number[];
  horaDesde: string;
  horaHasta: string;
  /** Fechas civiles del club, "AAAA-MM-DD", las dos incluidas. */
  desde: string;
  hasta: string;
  cupoMaximo: number;
  nivel: NivelClase;
  notas: string | null;
}

/** El tope de una serie (A10): seis meses. Más largo, se agenda otra. */
const MESES_MAXIMOS = 6;

/**
 * Lee la serie del formulario.
 *
 * Lo de cada clase —cancha, profesor, horas, cupo, nivel, notas— se valida leyendo la
 * primera fecha como una clase suelta: así la serie no tiene reglas propias que se
 * desalineen de las de la clase.
 */
export function leerSerie(cuerpo: unknown): SerieNueva {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  if (!Array.isArray(datos.diasSemana) || datos.diasSemana.length === 0) {
    throw new BadRequestException('Elige al menos un día de la semana.');
  }
  const diasSemana = [...new Set(datos.diasSemana.map(diaValido))].sort(
    (a, b) => a - b,
  );

  const desde = fechaDeCuerpo(datos.desde, 'El inicio de la serie');
  const hasta = fechaDeCuerpo(datos.hasta, 'El término de la serie');

  if (hasta < desde) {
    throw new BadRequestException(
      'La serie tiene que terminar después de empezar.',
    );
  }

  // `Date.UTC` con el mes pasado de 11 rueda solo al año siguiente.
  const tope = new Date(
    Date.UTC(
      desde.getUTCFullYear(),
      desde.getUTCMonth() + MESES_MAXIMOS,
      desde.getUTCDate(),
    ),
  );
  if (hasta > tope) {
    throw new BadRequestException(
      `Una serie dura como máximo ${MESES_MAXIMOS} meses: para más, agenda otra después.`,
    );
  }

  const fecha = (dia: Date) => dia.toISOString().slice(0, 10);
  const muestra = leerClaseNueva({ ...datos, fecha: fecha(desde) });

  return {
    canchaId: muestra.canchaId,
    profesorId: muestra.profesorId,
    diasSemana,
    horaDesde: datos.horaDesde as string,
    horaHasta: datos.horaHasta as string,
    desde: fecha(desde),
    hasta: fecha(hasta),
    cupoMaximo: muestra.cupoMaximo,
    nivel: muestra.nivel,
    notas: muestra.notas,
  };
}

/**
 * Qué hacer con una fecha de la serie que tiene algo encima (decisión 9): cancelar las
 * reservas, como una clase suelta, o saltar esa clase. Saltar vale también para una fecha
 * libre: un feriado.
 */
export type Decision = 'cancelar' | 'saltar';

/** Las decisiones del admin, por fecha civil del club ("AAAA-MM-DD"). */
export type Decisiones = Record<string, Decision>;

/** Lee las decisiones de la serie. Que cada fecha sea de la serie lo revisa `repartirFechas`. */
export function leerDecisiones(valor: unknown): Decisiones {
  if (valor === undefined || valor === null) return {};

  if (typeof valor !== 'object' || Array.isArray(valor)) {
    throw new BadRequestException(
      'Las decisiones van por fecha: { "AAAA-MM-DD": "saltar" }.',
    );
  }

  return Object.fromEntries(
    Object.entries(valor).map(([fecha, decision]) => {
      if (decision !== 'cancelar' && decision !== 'saltar') {
        throw new BadRequestException(
          `Para el ${fecha} la decisión es "cancelar" o "saltar".`,
        );
      }
      return [fecha, decision];
    }),
  );
}

/** Adónde se mueve una clase. La cancha puede cambiar; el resto de la ficha no. */
export interface Movimiento {
  canchaId?: number;
  fecha: string;
  inicio: Date;
  fin: Date;
}

/**
 * Lee la clase del formulario.
 *
 * **El rango entra en hora del club y sale en instantes**, igual que el bloqueo: la
 * conversión la hace el servidor y no el navegador, que es la regla del proyecto
 * desde el bug de marzo.
 */
export function leerClaseNueva(cuerpo: unknown): ClaseNueva {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const niveles = Object.values(NivelClase) as string[];
  if (typeof datos.nivel !== 'string' || !niveles.includes(datos.nivel)) {
    throw new BadRequestException(
      `El nivel tiene que ser uno de: ${niveles.join(', ')}.`,
    );
  }

  const { fecha, inicio, fin } = leerRango(datos);

  const notas = typeof datos.notas === 'string' ? datos.notas.trim() : '';
  // El mismo tope que las columnas `notas` de clase y de serie: VARCHAR(500).
  if (notas.length > 500) {
    throw new BadRequestException('Las notas son demasiado largas.');
  }

  return {
    canchaId: entero(datos.canchaId, 'La cancha', 1),
    profesorId: entero(datos.profesorId, 'El profesor', 1),
    fecha,
    inicio,
    fin,
    // Tope alto y no un número redondo del club: una clase de 40 alumnos es un dato
    // mal escrito, pero el club decide cuántos caben en su cancha, no este archivo.
    cupoMaximo: entero(datos.cupoMaximo, 'El cupo', 1, 40),
    nivel: datos.nivel as NivelClase,
    notas: notas || null,
  };
}

/** Lee el movimiento. La cancha solo viaja si de verdad cambia. */
export function leerMovimiento(cuerpo: unknown): Movimiento {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const { fecha, inicio, fin } = leerRango(datos);

  return {
    canchaId:
      datos.canchaId === undefined
        ? undefined
        : entero(datos.canchaId, 'La cancha', 1),
    fecha,
    inicio,
    fin,
  };
}

/**
 * Lee la cancelación.
 *
 * **El motivo es obligatorio**, por lo mismo que en las cuotas: una clase que
 * desaparece de la agenda sin explicación es la que alguien pregunta un mes después,
 * y el club tiene que poder decirle a los inscritos por qué no hubo clase.
 */
export function leerCancelacion(cuerpo: unknown): string {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const motivo = typeof datos.motivo === 'string' ? datos.motivo.trim() : '';

  if (motivo === '') {
    throw new BadRequestException(
      'Escribe por qué se cancela: los inscritos van a preguntar.',
    );
  }

  // El largo de la columna `motivo_cancelacion`, VARCHAR(191): con más, un 500.
  return motivo.slice(0, 191);
}

function leerRango(datos: Record<string, unknown>): {
  fecha: string;
  inicio: Date;
  fin: Date;
} {
  const inicio = instanteDeCuerpo(
    datos.fecha,
    datos.horaDesde,
    'inicio de la clase',
  );
  const fin = instanteDeCuerpo(
    datos.fecha,
    datos.horaHasta,
    'término de la clase',
  );

  if (fin <= inicio) {
    // Una clase al revés no cierra nada y no avisa: la cancha sigue libre y nadie
    // entiende por qué la clase no tomó. Es la misma regla del bloqueo.
    throw new BadRequestException(
      'La clase tiene que terminar después de empezar.',
    );
  }

  // Una clase no cruza la medianoche: las dos horas son del mismo día del club, y
  // por eso la fecha se lee una vez y vale para las dos.
  return { fecha: datos.fecha as string, inicio, fin };
}

/** Quién se inscribe: un socio del club o un alumno de afuera, nunca los dos. */
export interface InscripcionNueva {
  socioId: number | null;
  nombre: string | null;
  telefono: string | null;
}

/**
 * Lee la inscripción.
 *
 * **Exactamente uno de los dos, y lo impone esto.** La base no puede: MariaDB no deja
 * un CHECK sobre una columna con clave foránea, el mismo muro que encontró
 * `AcompananteReserva`. Una fila con socio y nombre a la vez se cuenta una vez o dos
 * según quién la lea —el que arma la lista del profesor ve los dos campos, el que
 * cuenta el cupo ve uno—, y esa diferencia aparece como un alumno de más en la cancha.
 */
export function leerInscripcion(cuerpo: unknown): InscripcionNueva {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
  const telefono =
    typeof datos.telefono === 'string' ? datos.telefono.trim() : '';
  const traeSocio = datos.socioId !== undefined && datos.socioId !== null;

  if (traeSocio && nombre !== '') {
    throw new BadRequestException(
      'O es un socio del club o es un alumno de afuera: elige uno.',
    );
  }

  if (traeSocio) {
    return {
      socioId: entero(datos.socioId, 'El socio', 1),
      nombre: null,
      telefono: null,
    };
  }

  if (nombre === '') {
    throw new BadRequestException(
      'Dinos quién viene: un socio del club o el nombre del alumno.',
    );
  }

  // **El alumno de afuera deja teléfono**, a diferencia del invitado de una reserva:
  // a aquel lo trae un socio que responde por él; a este lo tiene que poder llamar el
  // club cuando el profesor se enferma.
  if (telefono === '') {
    throw new BadRequestException(
      'Falta el teléfono del alumno: es por donde el club avisa si la clase se mueve.',
    );
  }

  return {
    socioId: null,
    nombre: nombre.slice(0, 120),
    telefono: telefono.slice(0, 40),
  };
}

/**
 * Lee la lista de asistencia.
 *
 * **`undefined` y lista vacía no son lo mismo, y la diferencia es la regla.** Sin el
 * campo, la clase se cierra sin pasar lista y nadie cambia de estado —la asistencia es
 * un dato que el club lleva si quiere, no un trámite que bloquea cerrar—. Con la lista
 * vacía, el club está diciendo que no vino nadie.
 */
export function leerAsistencia(cuerpo: unknown): number[] | null {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  if (datos.asistieron === undefined) return null;

  if (!Array.isArray(datos.asistieron)) {
    throw new BadRequestException(
      'La asistencia va como una lista de inscripciones.',
    );
  }

  return datos.asistieron.map((id) => entero(id, 'La inscripción', 1));
}
