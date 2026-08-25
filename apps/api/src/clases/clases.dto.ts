import { BadRequestException } from '@nestjs/common';

import { entero, instanteDeCuerpo } from '../catalogo-canchas/admin.dto';
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

  return motivo.slice(0, 200);
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
