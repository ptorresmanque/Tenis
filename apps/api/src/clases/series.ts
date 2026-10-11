import { BadRequestException, ConflictException } from '@nestjs/common';

import type { ReservaAfectada } from '../reservas/cierre-de-cancha.service';
import {
  ClaseNueva,
  Decisiones,
  leerClaseNueva,
  SerieNueva,
} from './clases.dto';

/** Una fecha de una serie simulada (T113): lo que el admin decide antes de agendar. */
export interface FechaDeLaSerie {
  fecha: string;
  inicio: Date;
  fin: Date;
  /**
   * Por qué la cancha no se puede cerrar a esa hora: fuera del horario, u otra clase,
   * torneo o mantención encima. Nulo si está libre de cierres.
   */
  choque: string | null;
  /** Las reservas que la clase cancelaría, como en la clase suelta. */
  afectadas: ReservaAfectada[];
}

const DIA = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** "martes 20 de octubre", de una fecha civil. */
function enPalabras(fecha: string): string {
  return DIA.format(new Date(`${fecha}T12:00:00.000Z`)).replace(',', '');
}

/**
 * Las fechas que una serie genera: cada día del rango que cae en uno de sus días de la
 * semana (T113).
 *
 * Se recorre el calendario y no instantes: el día de la semana es el de la fecha civil, y
 * un sábado a las 22:00 del club ya es domingo en UTC.
 */
export function fechasDeLaSerie(
  serie: Pick<SerieNueva, 'diasSemana' | 'desde' | 'hasta'>,
): string[] {
  const fechas: string[] = [];
  const hasta = new Date(`${serie.hasta}T00:00:00.000Z`);

  for (
    const dia = new Date(`${serie.desde}T00:00:00.000Z`);
    dia <= hasta;
    dia.setUTCDate(dia.getUTCDate() + 1)
  ) {
    if (serie.diasSemana.includes(dia.getUTCDay())) {
      fechas.push(dia.toISOString().slice(0, 10));
    }
  }

  return fechas;
}

/**
 * La serie como clases sueltas, una por fecha. Cada una se lee igual que una clase que
 * agenda el admin a mano, así que las 19:00 son las 19:00 del club antes y después del
 * cambio de horario.
 */
export function clasesDeLaSerie(serie: SerieNueva): ClaseNueva[] {
  return fechasDeLaSerie(serie).map((fecha) =>
    leerClaseNueva({ ...serie, fecha }),
  );
}

/**
 * Qué fechas se agendan y cuáles se saltan, con las decisiones del admin (T114).
 *
 * **Una fecha con algo encima y sin decisión rechaza la serie entera**, y dice cuáles: nada
 * se cancela sin estar en la lista que el admin vio. Se revisa contra una simulación hecha al
 * confirmar, así que una reserva que apareció después de mirar también frena la serie.
 *
 * Una fecha con la cancha cerrada —otra clase, un torneo, una mantención— o fuera del
 * horario solo se puede saltar: ese cierre no se cancela desde una serie. Y no se cancela
 * una reserva que se está pagando en este momento, como en la clase suelta.
 */
export function repartirFechas(
  fechas: (Pick<FechaDeLaSerie, 'fecha' | 'choque'> & {
    afectadas: Pick<ReservaAfectada, 'folio' | 'pagoEnCurso'>[];
  })[],
  decisiones: Decisiones,
): { agendar: string[]; saltadas: string[] } {
  const deLaSerie = new Set(fechas.map(({ fecha }) => fecha));
  const ajena = Object.keys(decisiones).find((fecha) => !deLaSerie.has(fecha));
  if (ajena) {
    throw new BadRequestException(`El ${ajena} no es una fecha de la serie.`);
  }

  const agendar: string[] = [];
  const saltadas: string[] = [];
  const pendientes: string[] = [];

  for (const { fecha, choque, afectadas } of fechas) {
    const decision = decisiones[fecha];
    const folios = afectadas.map((reserva) => reserva.folio).join(', ');

    if (decision === 'saltar') {
      saltadas.push(fecha);
    } else if (choque !== null) {
      pendientes.push(
        `${enPalabras(fecha)} (${choque.replace(/\.$/, '')}; solo se puede saltar)`,
      );
    } else if (afectadas.length > 0 && decision !== 'cancelar') {
      pendientes.push(
        `${enPalabras(fecha)} (reservas ${folios}: cancelarlas o saltar la fecha)`,
      );
    } else if (afectadas.some((reserva) => reserva.pagoEnCurso)) {
      pendientes.push(
        `${enPalabras(fecha)} (hay un pago en curso en ${folios}: se puede saltar, o esperar ` +
          'a que termine)',
      );
    } else {
      agendar.push(fecha);
    }
  }

  if (pendientes.length > 0) {
    throw new ConflictException({
      motivo: 'FALTA_DECIDIR',
      message: `Falta decidir qué hacer con estas fechas: ${pendientes.join('; ')}.`,
    });
  }

  return { agendar, saltadas };
}
