import { BadRequestException } from '@nestjs/common';

import {
  diaValido,
  entero,
  fechaDeCuerpo,
  instanteDeCuerpo,
} from '../catalogo-canchas/admin.dto';
import { leerTelefono } from '../comun/telefono';
import { NivelClase, TipoClase } from '../generated/prisma/client';

/** Lo que tiene toda clase, sea de tenis o del gimnasio. */
interface FichaDeLaClase {
  profesorId: number;
  /** Fecha civil del club, "AAAA-MM-DD". La grilla se pide por día, no por instante. */
  fecha: string;
  inicio: Date;
  fin: Date;
  cupoMaximo: number;
  notas: string | null;
}

/** Una clase de tenis: en una cancha y con nivel. */
export interface ClaseDeTenis extends FichaDeLaClase {
  tipo: typeof TipoClase.TENIS;
  canchaId: number;
  nivel: NivelClase;
}

/** Una clase de preparación física (T231): en el gimnasio, sin cancha y sin nivel. */
export interface ClaseDelGimnasio extends FichaDeLaClase {
  tipo: typeof TipoClase.PREPARACION_FISICA;
  canchaId: null;
  nivel: null;
}

/** Una clase por agendar, con el rango ya resuelto a instantes. */
export type ClaseNueva = ClaseDeTenis | ClaseDelGimnasio;

/** Un día de la semana de una serie, con su horario y su cancha (T228). */
export interface DiaDeLaSerie {
  /** De 0 (domingo) a 6 (sábado). */
  diaSemana: number;
  /** Reloj del club, "HH:MM": cada fecha lo convierte a instantes. */
  horaDesde: string;
  horaHasta: string;
  canchaId: number;
}

/**
 * Una serie de clases (T113): la ficha de una clase, más sus días y el rango de fechas.
 * Desde T228 cada día lleva su horario y su cancha.
 */
export interface SerieNueva {
  profesorId: number;
  /** Sin días repetidos, en orden de la semana. */
  dias: DiaDeLaSerie[];
  /** Fechas civiles del club, "AAAA-MM-DD", las dos incluidas. */
  desde: string;
  hasta: string;
  cupoMaximo: number;
  nivel: NivelClase;
  notas: string | null;
}

/** El tope de una serie (A10): seis meses. Más largo, se agenda otra. */
const MESES_MAXIMOS = 6;

const NOMBRE_DEL_DIA = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

/**
 * Lee la serie del formulario.
 *
 * Lo de cada clase —cancha, profesor, horas, cupo, nivel, notas— se valida leyendo **cada
 * día** como una clase suelta en la primera fecha: así la serie no tiene reglas propias que
 * se desalineen de las de la clase.
 */
export function leerSerie(cuerpo: unknown): SerieNueva {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  if (!Array.isArray(datos.dias) || datos.dias.length === 0) {
    throw new BadRequestException('Elige al menos un día de la semana.');
  }

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

  const vistos = new Set<number>();
  const dias = (datos.dias as unknown[])
    .map((crudo): DiaDeLaSerie => {
      const dia = (crudo ?? {}) as Record<string, unknown>;
      const diaSemana = diaValido(dia.diaSemana);

      if (vistos.has(diaSemana)) {
        throw new BadRequestException(
          `El ${NOMBRE_DEL_DIA[diaSemana]} está dos veces: cada día lleva un solo horario.`,
        );
      }
      vistos.add(diaSemana);

      // Cada día se valida como una clase suelta: horas, cancha y el resto de la ficha.
      const muestra = leerClaseDeTenis({
        ...datos,
        canchaId: dia.canchaId,
        horaDesde: dia.horaDesde,
        horaHasta: dia.horaHasta,
        fecha: fecha(desde),
      });

      return {
        diaSemana,
        horaDesde: dia.horaDesde as string,
        horaHasta: dia.horaHasta as string,
        canchaId: muestra.canchaId,
      };
    })
    .sort((uno, otro) => uno.diaSemana - otro.diaSemana);

  const muestra = leerClaseDeTenis({
    ...datos,
    ...dias[0],
    fecha: fecha(desde),
  });

  return {
    profesorId: muestra.profesorId,
    dias,
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
 *
 * **La cancha y el nivel van con el tipo** (T231): tenis con los dos, preparación física
 * sin ninguno. La base no lo puede imponer —MariaDB no deja un CHECK sobre una columna con
 * clave foránea—, así que lo impone esto.
 */
export function leerClaseNueva(cuerpo: unknown): ClaseNueva {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return leerTipo(datos.tipo) === TipoClase.PREPARACION_FISICA
    ? leerClaseDelGimnasio(datos)
    : leerClaseDeTenis(datos);
}

/** Sin tipo, tenis: es lo que mandaba el panel antes de T231. */
function leerTipo(valor: unknown): TipoClase {
  if (valor === undefined) return TipoClase.TENIS;

  const tipos = Object.values(TipoClase) as string[];
  if (typeof valor !== 'string' || !tipos.includes(valor)) {
    throw new BadRequestException(
      `El tipo tiene que ser uno de: ${tipos.join(', ')}.`,
    );
  }

  return valor as TipoClase;
}

/** La clase de tenis. La serie la usa directo: hasta T232 sus días son todos de tenis. */
export function leerClaseDeTenis(datos: Record<string, unknown>): ClaseDeTenis {
  const niveles = Object.values(NivelClase) as string[];
  if (typeof datos.nivel !== 'string' || !niveles.includes(datos.nivel)) {
    throw new BadRequestException(
      `El nivel tiene que ser uno de: ${niveles.join(', ')}.`,
    );
  }

  return {
    tipo: TipoClase.TENIS,
    ...leerFicha(datos),
    canchaId: entero(datos.canchaId, 'La cancha', 1),
    nivel: datos.nivel as NivelClase,
  };
}

/**
 * La de preparación física. Una cancha cerraría una cancha que nadie usa, y un nivel la
 * anunciaría como de tenis: las dos se rechazan en vez de ignorarse, para que el panel que
 * las mande por error se entere.
 */
function leerClaseDelGimnasio(
  datos: Record<string, unknown>,
): ClaseDelGimnasio {
  if (datos.canchaId !== undefined && datos.canchaId !== null) {
    throw new BadRequestException(
      'Una clase de preparación física va al gimnasio: sin cancha.',
    );
  }

  if (datos.nivel !== undefined && datos.nivel !== null) {
    throw new BadRequestException(
      'Una clase de preparación física va sin nivel.',
    );
  }

  return {
    tipo: TipoClase.PREPARACION_FISICA,
    ...leerFicha(datos),
    canchaId: null,
    nivel: null,
  };
}

function leerFicha(datos: Record<string, unknown>): FichaDeLaClase {
  const { fecha, inicio, fin } = leerRango(datos);

  const notas = typeof datos.notas === 'string' ? datos.notas.trim() : '';
  // El mismo tope que las columnas `notas` de clase y de serie: VARCHAR(500).
  if (notas.length > 500) {
    throw new BadRequestException('Las notas son demasiado largas.');
  }

  return {
    profesorId: entero(datos.profesorId, 'El profesor', 1),
    fecha,
    inicio,
    fin,
    // Tope alto y no un número redondo del club: una clase de 40 alumnos es un dato
    // mal escrito, pero el club decide cuántos caben en su cancha, no este archivo. En el
    // gimnasio, el tope de la grupal lo revisa el servicio, que lee la configuración.
    cupoMaximo: entero(datos.cupoMaximo, 'El cupo', 1, 40),
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
    telefono: leerTelefono(telefono, { obligatorio: true }),
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
