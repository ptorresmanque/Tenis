import { BadRequestException } from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';
import {
  esFechaDelClub,
  instanteEnElClub,
  minutosDeReloj,
} from '../comun/tiempo';

/** Cuándo y dónde se juega un partido, ya validado. */
export interface PrograMacionPedida {
  canchaId: number;
  /** Fecha civil del club, "AAAA-MM-DD". Es lo que el admin escribe. */
  fecha: string;
  /** Horas locales del club, "HH:MM". Se comparan con las franjas tal cual. */
  horaDesde: string;
  horaHasta: string;
  /** Los instantes en UTC, que es como se guardan y como los lee `Bloqueo`. */
  inicio: Date;
  fin: Date;
}

/**
 * Cuánto puede durar un partido.
 *
 * **La duración la elige el admin**, con el bloque del club como propuesta en la
 * pantalla: un partido de tenis dura lo que dura y el club lo sabe mejor que una
 * constante — a la final de Honor se le dan tres horas y a una primera ronda de 5ª,
 * una. El tope de seis horas es contra el dedazo, no una regla del juego.
 */
const MINIMO_MINUTOS = 30;
const MAXIMO_MINUTOS = 6 * 60;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function leerProgramacion(cuerpo: unknown): PrograMacionPedida {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const canchaId = entero(datos.canchaId, 'La cancha', 1);
  const fecha = typeof datos.fecha === 'string' ? datos.fecha : '';

  if (!esFechaDelClub(fecha)) {
    throw new BadRequestException(
      'La fecha se espera con forma AAAA-MM-DD y tiene que existir.',
    );
  }

  const horaDesde = hora(datos.horaDesde);
  const horaHasta = hora(datos.horaHasta);
  const duracion = minutosDeReloj(horaHasta) - minutosDeReloj(horaDesde);

  if (duracion < MINIMO_MINUTOS) {
    throw new BadRequestException(
      `Un partido dura al menos ${MINIMO_MINUTOS} minutos, y ese termina antes de empezar o dura menos.`,
    );
  }

  if (duracion > MAXIMO_MINUTOS) {
    throw new BadRequestException(
      `${MAXIMO_MINUTOS / 60} horas es más de lo que dura un partido: revisa la hora de término.`,
    );
  }

  return {
    canchaId,
    fecha,
    horaDesde,
    horaHasta,
    // **Los instantes los calcula el servidor con la zona del club**, nunca llegan del
    // cliente: es el mismo criterio de `franjaPara` en `reservas`. Un instante que
    // manda el navegador trae la zona de quien lo mandó.
    inicio: instanteEnElClub(fecha, horaDesde),
    fin: instanteEnElClub(fecha, horaHasta),
  };
}

function hora(valor: unknown): string {
  if (typeof valor !== 'string' || !HORA.test(valor)) {
    throw new BadRequestException(
      'Las horas se escriben como HH:MM, entre 00:00 y 23:59.',
    );
  }

  return valor;
}
