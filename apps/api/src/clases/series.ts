import { ClaseNueva, leerClaseNueva, SerieNueva } from './clases.dto';

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
