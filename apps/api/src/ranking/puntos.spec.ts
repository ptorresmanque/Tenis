import type { TablaDePuntos } from '../tours/tabla';
import {
  FilaDeRanking,
  PartidoJugado,
  puntosDe,
  puntosDelCuadro,
  tablaDeRanking,
  CuadroTerminado,
} from './puntos';

/**
 * El motor del ranking de torneos, sin base de datos (T54, rehecho en T198).
 *
 * Desde T198 los puntos salen de **la tabla del nivel** con que el torneo entró al tour
 * (`SPEC-ranking.md` § De dónde salen los puntos), y la tabla manda también en la primera
 * ronda (D7). Lo que no cambió: el bye no cuenta, el walkover sí, el cero no aparece y el
 * empate se muestra como empate.
 */
describe('puntos del ranking de torneos', () => {
  /** Un 250 cualquiera. Los números van escritos: un test que los calcula los copia. */
  const TABLA_250: TablaDePuntos = {
    campeon: 250,
    finalista: 150,
    semifinal: 90,
    cuartos: 45,
    octavos: 20,
    dieciseisavos: 10,
    treintaidosavos: 5,
  };

  /** Un partido de verdad: dos jugadores y un ganador. */
  const jugado = (
    ronda: number,
    a: number,
    b: number,
    gano: number,
  ): PartidoJugado => ({
    ronda,
    jugadorAId: a,
    jugadorBId: b,
    ganadorId: gano,
  });

  /** Un lugar vacío del cuadro: el sembrado pasa sin jugar. */
  const bye = (ronda: number, a: number): PartidoJugado => ({
    ronda,
    jugadorAId: a,
    jugadorBId: null,
    ganadorId: a,
  });

  describe('la fila de la tabla que corresponde', () => {
    // Cuadros de 4, 8, 16 y 64: dos, tres, cuatro y seis rondas.
    it.each([2, 3, 4, 6])(
      'el campeón suma la fila del campeón (%i rondas)',
      (rondas) => {
        expect(puntosDe(rondas, rondas, true, TABLA_250)).toBe(250);
      },
    );

    it.each([2, 3, 4, 6])(
      'el finalista, la del finalista (%i rondas)',
      (rondas) => {
        expect(puntosDe(rondas, rondas, false, TABLA_250)).toBe(150);
      },
    );

    it('**la tabla manda también en la primera ronda** (D7): en un cuadro de 4, la semifinal', () => {
      expect(puntosDe(1, 2, false, TABLA_250)).toBe(90);
    });

    it('**quien pierde en cuartos de un cuadro de 8 suma la fila de cuartos**', () => {
      expect(puntosDe(1, 3, false, TABLA_250)).toBe(45);
    });

    it('en un cuadro de 16, perder en octavos da la fila de octavos', () => {
      expect(puntosDe(1, 4, false, TABLA_250)).toBe(20);
    });

    it('en un cuadro de 64, la primera ronda son los treintaidosavos', () => {
      expect(puntosDe(1, 6, false, TABLA_250)).toBe(5);
      expect(puntosDe(2, 6, false, TABLA_250)).toBe(10);
    });

    it('**una ronda más lejos que la última fila da cero**: la primera de un cuadro de 128', () => {
      expect(puntosDe(1, 7, false, TABLA_250)).toBe(0);
    });

    it('quien no llegó a jugar ningún partido no suma', () => {
      expect(puntosDe(0, 3, false, TABLA_250)).toBe(0);
    });

    it('una fila en cero da cero: el club decide no premiar la participación', () => {
      expect(puntosDe(1, 3, false, { ...TABLA_250, cuartos: 0 })).toBe(0);
    });
  });

  describe('la ronda que cuenta es la del último partido jugado', () => {
    it('reparte el cuadro entero: campeón, finalista y los que perdieron entrando', () => {
      // Cuadro de 4: dos semifinales y una final.
      const cuadro: CuadroTerminado = {
        tabla: TABLA_250,
        partidos: [
          jugado(1, 10, 20, 10),
          jugado(1, 30, 40, 30),
          jugado(2, 10, 30, 10),
        ],
      };

      const puntos = puntosDelCuadro(cuadro);

      expect(puntos.get(10)).toBe(250);
      expect(puntos.get(30)).toBe(150);
      expect(puntos.get(20)).toBe(90);
      expect(puntos.get(40)).toBe(90);
    });

    it('**el bye no es una ronda alcanzada**: cuadro de 12 en 16', () => {
      // El sembrado 1 entra en segunda ronda y pierde ahí. Alcanzó los cuartos, que
      // es donde jugó, y no los octavos, que es donde no jugó.
      const cuadro: CuadroTerminado = {
        tabla: TABLA_250,
        partidos: [
          bye(1, 1),
          jugado(2, 1, 7, 7),
          // El resto del camino del 7, para que la final quede en la ronda 4.
          jugado(3, 7, 8, 7),
          jugado(4, 7, 9, 7),
        ],
      };

      expect(puntosDelCuadro(cuadro).get(1)).toBe(45);
    });

    it('un cuadro donde nadie jugó no le da puntos a nadie', () => {
      // La protección contra contar el bye como partido: si se colara, estos dos
      // sumarían la primera fila, o saldrían campeones, sin haber jugado un punto.
      const cuadro: CuadroTerminado = {
        tabla: TABLA_250,
        partidos: [bye(1, 1), bye(1, 2)],
      };

      expect([...puntosDelCuadro(cuadro).values()]).toEqual([0, 0]);
    });

    it('**el walkover cuenta**: un partido con dos nombres y un ganador es un partido', () => {
      // Quien ganó la final por walkover es campeón —ganó todo lo anterior—, y quien
      // no se presentó llegó a la final ganando sus partidos.
      const cuadro: CuadroTerminado = {
        tabla: TABLA_250,
        partidos: [
          jugado(1, 10, 20, 10),
          jugado(1, 30, 40, 30),
          jugado(2, 10, 30, 10),
        ],
      };

      const puntos = puntosDelCuadro(cuadro);

      expect(puntos.get(10)).toBe(250);
      expect(puntos.get(30)).toBe(150);
    });

    it('una final que todavía no se juega no corona a nadie', () => {
      const cuadro: CuadroTerminado = {
        tabla: TABLA_250,
        partidos: [
          jugado(1, 10, 20, 10),
          { ronda: 2, jugadorAId: 10, jugadorBId: null, ganadorId: null },
        ],
      };

      // El 10 jugó la semifinal y nada más: suma esa fila, no la del campeón.
      expect(puntosDelCuadro(cuadro).get(10)).toBe(90);
    });
  });

  describe('la tabla', () => {
    const nombres = new Map([
      [1, 'Ana Uno'],
      [2, 'Beto Dos'],
      [3, 'Cata Tres'],
      [4, 'Dani Cuatro'],
      [5, 'Eva Cinco'],
      [6, 'Fito Seis'],
    ]);

    /** Una tabla de puntos con solo campeón y finalista: lo demás en cero. */
    const soloFinal = (campeon: number, finalista: number): TablaDePuntos => ({
      campeon,
      finalista,
      semifinal: 0,
      cuartos: 0,
      octavos: 0,
      dieciseisavos: 0,
      treintaidosavos: 0,
    });

    /**
     * Un cuadro de cuatro: `campeon` le gana la final a `finalista`, y los dos de
     * `otros` pierden entrando —uno contra cada uno—.
     */
    const cuadroDe = (
      tabla: TablaDePuntos,
      campeon: number,
      finalista: number,
      otros: [number, number],
    ): CuadroTerminado => ({
      tabla,
      partidos: [
        jugado(1, campeon, otros[0], campeon),
        jugado(1, finalista, otros[1], finalista),
        jugado(2, campeon, finalista, campeon),
      ],
    });

    const puestos = (filas: FilaDeRanking[]) =>
      filas.map((fila) => [fila.puesto, fila.nombre, fila.puntos]);

    it('suma los cuadros que recibe', () => {
      // Cada uno ganó uno y perdió el otro: 250 + 150. Con un solo cuadro esto no
      // probaría que suma.
      const tabla = tablaDeRanking(
        [
          cuadroDe(soloFinal(250, 150), 1, 2, [3, 4]),
          cuadroDe(soloFinal(250, 150), 2, 1, [3, 4]),
        ],
        nombres,
      );

      expect(puestos(tabla)).toEqual([
        [1, 'Ana Uno', 400],
        [1, 'Beto Dos', 400],
      ]);
    });

    it('**con la fila en cero, quien perdió entrando no aparece**', () => {
      const tabla = tablaDeRanking(
        [cuadroDe(soloFinal(250, 150), 1, 2, [3, 4])],
        nombres,
      );

      expect(tabla.map((fila) => fila.jugadorId)).toEqual([1, 2]);
    });

    it('**con la fila en la tabla, aparece con lo suyo** (D7)', () => {
      const tabla = tablaDeRanking(
        [cuadroDe(TABLA_250, 1, 2, [3, 4])],
        nombres,
      );

      expect(puestos(tabla)).toEqual([
        [1, 'Ana Uno', 250],
        [2, 'Beto Dos', 150],
        [3, 'Cata Tres', 90],
        [3, 'Dani Cuatro', 90],
      ]);
    });

    it('desempata por menos cuadros: 250 en uno vale más que 250 en dos', () => {
      const tabla = tablaDeRanking(
        [
          // Ana campeona, Beto finalista: 250 y 150.
          cuadroDe(soloFinal(250, 150), 1, 2, [3, 4]),
          // Beto campeón de uno chico: llega a 250, pero le costó dos.
          cuadroDe(soloFinal(100, 60), 2, 3, [4, 5]),
        ],
        nombres,
      );

      expect(tabla[0].nombre).toBe('Ana Uno');
      expect(tabla[0].torneos).toBe(1);
      expect(tabla[1].nombre).toBe('Beto Dos');
      expect(tabla[1].torneos).toBe(2);
      // Y el empate se ve: los dos tienen 250 y los dos van en el puesto 1.
      expect(tabla[0].puesto).toBe(tabla[1].puesto);
    });

    it('**a igual puntaje y cuadros, arriba quien jugó el nivel más alto**', () => {
      const tabla = tablaDeRanking(
        [
          // Ana finalista de un 500: 300 puntos.
          cuadroDe(soloFinal(500, 300), 3, 1, [4, 5]),
          // Beto campeón de un 300: los mismos 300, en un nivel más bajo.
          cuadroDe(soloFinal(300, 180), 2, 4, [5, 6]),
        ],
        nombres,
      );

      const empatados = tabla
        .filter((fila) => fila.puntos === 300)
        .map((fila) => fila.nombre);

      expect(empatados).toEqual(['Ana Uno', 'Beto Dos']);
    });

    it('y si sigue empatado, por orden alfabético', () => {
      const tabla = tablaDeRanking(
        [
          cuadroDe(soloFinal(250, 150), 3, 4, [1, 5]),
          cuadroDe(soloFinal(250, 150), 2, 5, [1, 6]),
        ],
        nombres,
      );

      expect(tabla.slice(0, 2).map((fila) => fila.nombre)).toEqual([
        'Beto Dos',
        'Cata Tres',
      ]);
    });

    it('**el empate se muestra como empate: dos en el 1 y el siguiente en el 3**', () => {
      const tabla = tablaDeRanking(
        [
          cuadroDe(soloFinal(250, 150), 2, 5, [3, 4]),
          cuadroDe(soloFinal(250, 150), 3, 6, [1, 4]),
        ],
        nombres,
      );

      expect(puestos(tabla)).toEqual([
        [1, 'Beto Dos', 250],
        [1, 'Cata Tres', 250],
        [3, 'Eva Cinco', 150],
        [3, 'Fito Seis', 150],
      ]);
    });

    it('sin cuadros, la tabla queda vacía y no se cae', () => {
      expect(tablaDeRanking([], nombres)).toEqual([]);
    });

    it('un jugador sin nombre no rompe la tabla', () => {
      // No debería pasar —el nombre sale de la misma consulta—, pero una tabla que
      // explota es peor que una que muestra un número.
      const tabla = tablaDeRanking(
        [cuadroDe(soloFinal(250, 150), 99, 98, [1, 2])],
        new Map(),
      );

      expect(tabla).toHaveLength(2);
    });
  });
});
