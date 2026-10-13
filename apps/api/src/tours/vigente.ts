/** Lo que la regla necesita de una temporada. */
interface ConFechas {
  id: number;
  fechaInicio: Date;
  fechaFin: Date;
}

/**
 * La temporada que se muestra por omisión (T194, `SPEC-tours.md` § Temporadas).
 *
 * 1. La que contiene hoy y, si son varias, la que empezó más tarde: una "Clausura" que
 *    corre dentro de una temporada anual es la que se está jugando.
 * 2. Si ninguna contiene hoy —el receso entre dos—, la más reciente que ya empezó: su
 *    ranking es el último que se jugó.
 * 3. Si ninguna empezó todavía, la más próxima.
 *
 * Entre dos que empiezan el mismo día, la de id mayor: la respuesta no puede depender del
 * orden en que la base devuelva las filas.
 *
 * @param hoy El día del club, a medianoche UTC como las columnas `DATE`. Parámetro y no
 *            `new Date()` adentro, para probarla moviendo el reloj.
 */
export function temporadaVigente(
  temporadas: ConFechas[],
  hoy: Date,
): number | null {
  const masTarde = (a: ConFechas, b: ConFechas) =>
    b.fechaInicio.getTime() - a.fechaInicio.getTime() || b.id - a.id;

  const empezadas = temporadas
    .filter((t) => t.fechaInicio <= hoy)
    .sort(masTarde);
  const enCurso = empezadas.filter((t) => hoy <= t.fechaFin);

  if (enCurso.length > 0) return enCurso[0].id;
  if (empezadas.length > 0) return empezadas[0].id;

  // La más próxima: la de inicio más temprano, y entre empates, también la de id mayor.
  const proximas = [...temporadas].sort(
    (a, b) => a.fechaInicio.getTime() - b.fechaInicio.getTime() || b.id - a.id,
  );

  return proximas[0]?.id ?? null;
}
