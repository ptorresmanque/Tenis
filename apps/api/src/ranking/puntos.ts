/**
 * El motor del ranking de torneos: puntos por la ronda alcanzada.
 *
 * Puro: ni base de datos ni reloj. Es la mitad del módulo que decide quién está arriba
 * de una tabla que se cuelga en el mural, así que se prueba sola.
 *
 * **El otro ranking, el interno, no pasa por acá.** Usa Elo y vive aparte a propósito:
 * puntos acumulados premian jugar mucho, y eso es lo correcto para los torneos y lo
 * incorrecto para los partidos entre socios. El porqué está en `SPEC-ranking.md`.
 */

/** Un partido del cuadro, con lo único que el ranking necesita mirarle. */
export interface PartidoJugado {
  ronda: number;
  jugadorAId: number | null;
  jugadorBId: number | null;
  ganadorId: number | null;
}

/**
 * Un **cuadro** terminado, con lo que hace falta para repartir sus puntos.
 *
 * La unidad es el cuadro desde T70: una Copa que corre 5ª, 4ª y Honor entrega tres de
 * éstos, cada uno con su `puntosCampeon`. El motor no se enteró del cambio —siempre
 * contó rondas sobre una lista de partidos con una final—; lo que cambió es quién le
 * pasa las unidades.
 */
export interface CuadroTerminado {
  /** De la categoría del cuadro. Es la única perilla configurable de toda la escala. */
  puntosCampeon: number;
  partidos: PartidoJugado[];
}

/** Una fila de la tabla, ya ordenada y con su puesto. */
export interface FilaDeRanking {
  puesto: number;
  jugadorId: number;
  nombre: string;
  puntos: number;
  /**
   * En cuántos **cuadros** los consiguió. Es el primer criterio de desempate.
   *
   * Se llama `torneos` y no `cuadros` porque es lo que la pantalla dice —"3 torneos"—
   * y para el jugador son tres torneos: nadie juega dos categorías del mismo.
   */
  torneos: number;
}

/**
 * Qué fracción de los puntos del campeón corresponde a cada ronda, contando desde la
 * final hacia atrás: finalista, semifinal, cuartos, octavos, dieciseisavos.
 *
 * **Del diseño y no configurables.** Lo configurable es `puntosCampeon` por categoría:
 * con una sola perilla el club decide que su Máster vale el doble que un torneo
 * cualquiera, y no puede desordenar la escala dejando la semifinal por encima de la
 * final.
 */
const FRACCIONES = [0.6, 0.36, 0.18, 0.09, 0.045];

/**
 * Los puntos de un jugador en un cuadro.
 *
 * @param rondaAlcanzada La ronda del último partido que **jugó**. Cero si no jugó
 *                       ninguno.
 * @param rondas         Cuántas rondas tuvo el cuadro; la final es la última.
 * @param esCampeon      Si ganó la final.
 * @param puntosCampeon  Los de la categoría del cuadro.
 *
 * **Perder en primera ronda da cero**, se llame esa ronda como se llame: en un cuadro
 * de cuatro la primera ronda es la semifinal y tampoco puntúa. Participar no es un
 * logro que ordene una tabla, y darle puntos hace que quien se inscribe en todo suba
 * sin ganar nunca.
 */
export function puntosDe(
  rondaAlcanzada: number,
  rondas: number,
  esCampeon: boolean,
  puntosCampeon: number,
): number {
  if (esCampeon) return puntosCampeon;
  if (rondaAlcanzada <= 1) return 0;

  const fraccion = FRACCIONES[rondas - rondaAlcanzada] ?? 0;

  // Al final y de una vez: 9 % de 250 son 22,5, y un puntaje con coma no se muestra
  // ni se suma bien.
  return Math.round(fraccion * puntosCampeon);
}

/**
 * Si ese partido se jugó de verdad, con dos personas en la cancha.
 *
 * **Un bye no lo es.** El sembrado que entra en segunda ronda y pierde ahí alcanzó la
 * segunda, no la primera: se cuenta por el partido más lejano que jugó, y un lugar
 * vacío del cuadro no se juega. En una sola función porque la pregunta se hace dos
 * veces —para la ronda alcanzada y para saber si hay final— y dos copias de la misma
 * condición es una que alguien cambia sin cambiar la otra.
 */
function seJugo(partido: PartidoJugado): boolean {
  return partido.jugadorAId !== null && partido.jugadorBId !== null;
}

/**
 * Los puntos que reparte un cuadro, por jugador.
 *
 * Están todos los que aparecen en el cuadro, incluidos los que sacaron cero: quien
 * pregunta por qué no suma quiere ver su cero, no su ausencia.
 */
export function puntosDelCuadro(cuadro: CuadroTerminado): Map<number, number> {
  const rondas = cuadro.partidos.reduce(
    (mayor, partido) => Math.max(mayor, partido.ronda),
    0,
  );

  // Campeón es quien ganó la final, y la final es un partido con dos nombres. Sin
  // esta condición, un cuadro de puros byes coronaría a los dos que pasaron solos.
  const final = cuadro.partidos.find(
    (partido) => partido.ronda === rondas && seJugo(partido),
  );
  const campeonId = final?.ganadorId ?? null;

  const alcanzada = new Map<number, number>();
  for (const partido of cuadro.partidos) {
    const juega = seJugo(partido);

    for (const jugadorId of [partido.jugadorAId, partido.jugadorBId]) {
      if (jugadorId === null) continue;

      // Aparecer en el cuadro con cero es distinto de no aparecer.
      const suya = alcanzada.get(jugadorId) ?? 0;
      alcanzada.set(jugadorId, juega ? Math.max(suya, partido.ronda) : suya);
    }
  }

  return new Map(
    [...alcanzada].map(([jugadorId, ronda]) => [
      jugadorId,
      puntosDe(ronda, rondas, jugadorId === campeonId, cuadro.puntosCampeon),
    ]),
  );
}

/** Lo acumulado de un jugador antes de ordenarlo. */
interface Acumulado {
  puntos: number;
  torneos: number;
  /** La categoría más alta que jugó, para el segundo desempate. */
  mejorCategoria: number;
}

/**
 * La tabla completa: suma los torneos, ordena y reparte los puestos.
 *
 * **Se calcula al consultar y no se guarda.** Una tabla materializada hay que
 * recalcularla cuando se corrige un resultado, cuando caduca un torneo y cuando se
 * enlaza un jugador duplicado; el día que uno de esos tres caminos se olvide, la tabla
 * queda mintiendo sin que nada falle. Con los torneos de un club esto son
 * milisegundos.
 *
 * @param cuadros Los que caen dentro de la ventana. Elegirlos es de quien consulta.
 * @param nombres Cómo se llama cada jugador, para mostrar y para el último desempate.
 */
export function tablaDeRanking(
  cuadros: CuadroTerminado[],
  nombres: Map<number, string>,
): FilaDeRanking[] {
  const acumulado = new Map<number, Acumulado>();

  for (const cuadro of cuadros) {
    for (const [jugadorId, puntos] of puntosDelCuadro(cuadro)) {
      // Un cuadro donde no sumó no cuenta: el desempate premia a quien llegó a los
      // mismos puntos en menos, no a quien se inscribió en más.
      if (puntos === 0) continue;

      const suyo = acumulado.get(jugadorId) ?? {
        puntos: 0,
        torneos: 0,
        mejorCategoria: 0,
      };

      acumulado.set(jugadorId, {
        puntos: suyo.puntos + puntos,
        torneos: suyo.torneos + 1,
        mejorCategoria: Math.max(suyo.mejorCategoria, cuadro.puntosCampeon),
      });
    }
  }

  const nombreDe = (jugadorId: number) =>
    nombres.get(jugadorId) ?? `Jugador ${jugadorId}`;

  const ordenadas = [...acumulado]
    .sort(([unId, una], [otroId, otra]) => {
      if (una.puntos !== otra.puntos) return otra.puntos - una.puntos;
      if (una.torneos !== otra.torneos) return una.torneos - otra.torneos;
      if (una.mejorCategoria !== otra.mejorCategoria) {
        return otra.mejorCategoria - una.mejorCategoria;
      }

      return nombreDe(unId).localeCompare(nombreDe(otroId), 'es');
    })
    .map(([jugadorId, suyo]) => ({ jugadorId, ...suyo }));

  // **El empate se muestra como empate**: dos en el puesto 3 y el siguiente en el 5.
  // El orden de las filas lo deciden los desempates, pero romper el puesto con un
  // criterio que nadie ve deja al de abajo explicando por qué está abajo.
  return ordenadas.map((fila) => ({
    puesto: 1 + ordenadas.filter((otra) => otra.puntos > fila.puntos).length,
    jugadorId: fila.jugadorId,
    nombre: nombreDe(fila.jugadorId),
    puntos: fila.puntos,
    torneos: fila.torneos,
  }));
}
