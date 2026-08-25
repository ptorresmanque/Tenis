/**
 * El cuadro de un torneo: siembra, byes y sorteo.
 *
 * Puro: ni base de datos ni reloj ni azar del sistema. Es la parte del módulo que más
 * fácil se equivoca y la más visible para los competidores —está colgada en el mural
 * del club—, así que se prueba sola, sin levantar nada.
 */

/** Quién entra al cuadro. La siembra la pone el admin; nula es no sembrado. */
export interface Participante {
  jugadorId: number;
  siembra: number | null;
}

/** Un partido del cuadro, tal como se guarda. */
export interface PartidoDelCuadro {
  ronda: number;
  posicion: number;
  jugadorAId: number | null;
  jugadorBId: number | null;
  /** Puesto de una vez cuando el partido es un bye: no hay nada que jugar. */
  ganadorId: number | null;
}

/**
 * El tamaño del cuadro: la potencia de 2 igual o mayor al número de inscritos.
 *
 * Doce inscritos juegan un cuadro de 16 con 4 byes. Redondear hacia abajo dejaría a
 * cuatro personas inscritas fuera del torneo, que es lo que el club no puede explicar.
 */
export function tamanoDelCuadro(inscritos: number): number {
  if (inscritos < 2) {
    throw new Error(
      `Un cuadro necesita al menos dos jugadores, no ${inscritos}.`,
    );
  }

  let tamano = 2;
  while (tamano < inscritos) tamano *= 2;

  return tamano;
}

/**
 * En qué lugar del cuadro va cada sembrado, por la regla estándar.
 *
 * Devuelve un arreglo donde la posición `s - 1` es el lugar del sembrado `s`: para un
 * cuadro de 8, `[1, 8, 4, 5, 2, 7, 3, 6]` quiere decir que el 1 va arriba de todo, el 2
 * abajo de todo, y el 3 y el 4 en mitades opuestas.
 *
 * Se construye duplicando: cada lugar `x` de un cuadro de `n` se convierte en `x` y
 * `2n + 1 - x` en el de `2n`. **Eso es lo que impide que los dos mejores se crucen
 * antes de la final**, y que el 3 y el 4 se crucen antes de semifinales.
 */
export function lugaresDeSiembra(tamano: number): number[] {
  let lugares = [1];

  while (lugares.length < tamano) {
    const n = lugares.length;
    lugares = lugares.flatMap((lugar) => [lugar, 2 * n + 1 - lugar]);
  }

  return lugares;
}

/**
 * El lugar con el que se cruza este en la primera ronda.
 *
 * Los lugares se emparejan de a dos desde arriba: 1 con 2, 3 con 4. El rival de un
 * lugar impar es el siguiente, y el de uno par, el anterior.
 */
export function lugarRival(lugar: number): number {
  return lugar % 2 === 1 ? lugar + 1 : lugar - 1;
}

/**
 * Azar reproducible a partir de una semilla.
 *
 * `Math.random` no sirve acá: **el sorteo tiene que poder rehacerse**. Si alguien
 * pregunta por qué le tocó ese cruce, la respuesta no puede ser "salió así"; con la
 * semilla guardada, el club vuelve a correr el sorteo y sale lo mismo.
 *
 * Es mulberry32: cuatro líneas, determinista y suficiente para repartir doce nombres.
 * No es criptográfico y no tiene por qué serlo.
 */
export function azarCon(semilla: number): () => number {
  let estado = semilla >>> 0;

  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Baraja una copia, sin tocar el original. Fisher-Yates con el azar que se le pase. */
export function barajar<T>(elementos: T[], azar: () => number): T[] {
  const copia = [...elementos];

  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }

  return copia;
}

/**
 * Arma el cuadro completo.
 *
 * 1. El tamaño es la potencia de 2 igual o mayor a los inscritos.
 * 2. **Los lugares que sobran son byes, y se los quedan los sembrados en orden**: con
 *    12 jugadores hay 4 byes, y son para los sembrados 1 a 4. Un bye es el rival vacío
 *    de un sembrado, no un lugar suelto en cualquier parte.
 * 3. Los sembrados van a su lugar por la regla estándar.
 * 4. **Los no sembrados se reparten al azar** entre los lugares que quedan, con la
 *    semilla que se guarda en el torneo.
 * 5. Se generan **todos** los partidos de todas las rondas, con jugadores nulos donde
 *    todavía no se sabe. El cuadro se dibuja entero desde el primer día.
 *
 * Los byes se resuelven al armar: el partido queda con ganador y el jugador ya
 * aparece en la ronda siguiente. Hacer que el admin "cargue" un bye sería pedirle que
 * confirme algo que no pasó.
 */
export function armarCuadro(
  participantes: Participante[],
  semilla: number,
): PartidoDelCuadro[] {
  const tamano = tamanoDelCuadro(participantes.length);
  const lugares = lugaresDeSiembra(tamano);

  const sembrados = participantes
    .filter(
      (quien): quien is Participante & { siembra: number } =>
        quien.siembra !== null,
    )
    .sort((una, otra) => una.siembra - otra.siembra);
  const sinSembrar = participantes.filter((quien) => quien.siembra === null);

  /** Lugar del cuadro → jugador. Vacío es bye. */
  const ocupantes = new Map<number, number>();
  for (const [indice, quien] of sembrados.entries()) {
    ocupantes.set(lugares[indice], quien.jugadorId);
  }

  // Los byes: el lugar rival de cada sembrado, en orden. Si sobran byes porque hay
  // menos sembrados que lugares vacíos, los que queden se reparten desde arriba del
  // cuadro, que es lo mismo que hacer el club con un papel.
  const byes = tamano - participantes.length;
  const reservados = new Set<number>();
  for (let i = 0; i < byes; i++) {
    reservados.add(
      i < sembrados.length ? lugarRival(lugares[i]) : (lugares[i] ?? 0),
    );
  }

  const libres: number[] = [];
  for (let lugar = 1; lugar <= tamano; lugar++) {
    if (!ocupantes.has(lugar) && !reservados.has(lugar)) libres.push(lugar);
  }

  const sorteados = barajar(sinSembrar, azarCon(semilla));
  for (const [indice, quien] of sorteados.entries()) {
    if (libres[indice] !== undefined) {
      ocupantes.set(libres[indice], quien.jugadorId);
    }
  }

  return partidosDeTodasLasRondas(tamano, ocupantes);
}

/** Cómo se llama esa ronda, contando desde la final hacia atrás. */
export function nombreDeRonda(ronda: number, rondas: number): string {
  const nombres = [
    'Final',
    'Semifinal',
    'Cuartos de final',
    'Octavos de final',
  ];
  const desdeElFinal = rondas - ronda;

  return nombres[desdeElFinal] ?? `Ronda ${ronda}`;
}

function partidosDeTodasLasRondas(
  tamano: number,
  ocupantes: Map<number, number>,
): PartidoDelCuadro[] {
  const partidos: PartidoDelCuadro[] = [];
  const rondas = Math.log2(tamano);

  // Quién llega a cada lugar de la ronda que viene, ya resuelto por los byes.
  let avanzan = new Map<number, number>();

  for (let ronda = 1; ronda <= rondas; ronda++) {
    const cuantos = tamano / 2 ** ronda;
    const siguientes = new Map<number, number>();

    for (let posicion = 1; posicion <= cuantos; posicion++) {
      const a =
        ronda === 1
          ? ocupantes.get(posicion * 2 - 1)
          : avanzan.get(posicion * 2 - 1);
      const b =
        ronda === 1 ? ocupantes.get(posicion * 2) : avanzan.get(posicion * 2);

      // **Un hueco solo es un bye en la primera ronda.** Más adelante un lugar vacío
      // es "todavía no se sabe quién llega", y tratarlo como bye hacía avanzar al
      // sembrado ronda tras ronda: con doce inscritos, los cuatro sembrados aparecían
      // en semifinales sin haber jugado un punto.
      const esBye = ronda === 1 && (a === undefined) !== (b === undefined);
      const ganadorId = esBye ? (a ?? b ?? null) : null;

      if (ganadorId !== null) siguientes.set(posicion, ganadorId);

      partidos.push({
        ronda,
        posicion,
        jugadorAId: a ?? null,
        jugadorBId: b ?? null,
        ganadorId,
      });
    }

    avanzan = siguientes;
  }

  return partidos;
}
