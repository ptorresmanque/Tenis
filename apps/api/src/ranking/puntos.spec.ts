import {
  FilaDeRanking,
  PartidoJugado,
  puntosDe,
  puntosDelCuadro,
  tablaDeRanking,
  CuadroTerminado,
} from './puntos';

/**
 * T54: el motor del ranking de torneos, sin base de datos.
 *
 * Es la parte que decide quién está arriba de una tabla que se cuelga en el mural, así
 * que se prueba sola: los porcentajes, la ronda que cuenta y el desempate no necesitan
 * un torneo de verdad para equivocarse.
 */
describe('puntos del ranking de torneos', () => {
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

  describe('la tabla de porcentajes', () => {
    // Los números de la derecha son los del spec para una categoría de 250. Van
    // escritos y no calculados: un test que repita la fórmula del código no prueba
    // nada, solo la copia.
    it('el campeón se lleva los puntos completos de la categoría', () => {
      expect(puntosDe(5, 5, true, 250)).toBe(250);
    });

    it('el finalista, el 60 %', () => {
      expect(puntosDe(5, 5, false, 250)).toBe(150);
    });

    it('la semifinal, el 36 %', () => {
      expect(puntosDe(4, 5, false, 250)).toBe(90);
    });

    it('los cuartos, el 18 %', () => {
      expect(puntosDe(3, 5, false, 250)).toBe(45);
    });

    it('los octavos, el 9 % —redondeado, porque 22,5 no es un puntaje—', () => {
      expect(puntosDe(2, 5, false, 250)).toBe(23);
    });

    it('los dieciseisavos, el 4,5 %', () => {
      // Ronda 2 de un cuadro de 64: la primera ronda de ese cuadro son los
      // treintaidosavos, que no puntúan.
      expect(puntosDe(2, 6, false, 250)).toBe(11);
    });

    it('**perder en primera ronda da cero**', () => {
      // Participar no es un logro que ordene una tabla: darle puntos hace que quien
      // se inscribe en todo suba sin ganar nunca.
      expect(puntosDe(1, 5, false, 250)).toBe(0);
    });

    it('perder la primera ronda de un cuadro de cuatro tampoco puntúa', () => {
      // Esa ronda se llama semifinal, y aun así no ganó un partido. La regla es
      // "haber ganado alguno", no cómo se llama la ronda donde perdió.
      expect(puntosDe(1, 2, false, 250)).toBe(0);
    });

    it('quien no llegó a jugar ningún partido no puntúa', () => {
      expect(puntosDe(0, 4, false, 250)).toBe(0);
    });

    it('la categoría es la única perilla: el doble de campeón, el doble en cada fila', () => {
      expect(puntosDe(5, 5, true, 500)).toBe(500);
      expect(puntosDe(4, 5, false, 500)).toBe(180);
    });
  });

  describe('la ronda que cuenta es la del último partido jugado', () => {
    it('reparte el cuadro entero: campeón, finalista y los que perdieron entrando', () => {
      // Cuadro de 4: dos semifinales y una final.
      const torneo: CuadroTerminado = {
        puntosCampeon: 250,
        partidos: [
          jugado(1, 10, 20, 10),
          jugado(1, 30, 40, 30),
          jugado(2, 10, 30, 10),
        ],
      };

      const puntos = puntosDelCuadro(torneo);

      expect(puntos.get(10)).toBe(250);
      expect(puntos.get(30)).toBe(150);
      expect(puntos.get(20)).toBe(0);
      expect(puntos.get(40)).toBe(0);
    });

    it('**el bye no es una ronda alcanzada**: cuadro de 12 en 16', () => {
      // El sembrado 1 entra en segunda ronda y pierde ahí. Alcanzó los cuartos, que
      // es donde jugó, y no los octavos, que es donde no jugó.
      const torneo: CuadroTerminado = {
        puntosCampeon: 250,
        partidos: [
          bye(1, 1),
          jugado(2, 1, 7, 7),
          // El resto del camino del 7, para que la final quede en la ronda 4.
          jugado(3, 7, 8, 7),
          jugado(4, 7, 9, 7),
        ],
      };

      expect(puntosDelCuadro(torneo).get(1)).toBe(45);
    });

    it('un cuadro donde nadie jugó no le da puntos a nadie', () => {
      // No es un caso real; es la protección contra contar el bye como partido. Si
      // se colara, estos dos aparecerían campeones sin haber jugado un punto.
      const torneo: CuadroTerminado = {
        puntosCampeon: 250,
        partidos: [bye(1, 1), bye(1, 2)],
      };

      expect([...puntosDelCuadro(torneo).values()]).toEqual([0, 0]);
    });

    it('**el walkover cuenta para los dos**: el que avanzó y el que no llegó', () => {
      // Quien ganó la final por walkover es campeón —ganó todo lo anterior—, y quien
      // no se presentó llegó a la final ganando sus partidos. El ranking no mira la
      // bandera de walkover: un partido con dos nombres y un ganador es un partido.
      const torneo: CuadroTerminado = {
        puntosCampeon: 250,
        partidos: [
          jugado(1, 10, 20, 10),
          jugado(1, 30, 40, 30),
          jugado(2, 10, 30, 10),
        ],
      };

      const puntos = puntosDelCuadro(torneo);

      expect(puntos.get(10)).toBe(250);
      expect(puntos.get(30)).toBe(150);
    });

    it('un partido que todavía no se juega no corona a nadie', () => {
      const torneo: CuadroTerminado = {
        puntosCampeon: 250,
        partidos: [
          jugado(1, 10, 20, 10),
          { ronda: 2, jugadorAId: 10, jugadorBId: null, ganadorId: null },
        ],
      };

      // La final está a medias: el 10 alcanzó la ronda 1 y ahí no se puntúa.
      expect(puntosDelCuadro(torneo).get(10)).toBe(0);
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

    /**
     * Un cuadro de cuatro: `campeon` le gana la final a `finalista`, y los dos de
     * `otros` pierden entrando —uno contra cada uno—, así que no puntúan.
     */
    const torneoDe = (
      puntosCampeon: number,
      campeon: number,
      finalista: number,
      otros: [number, number],
    ): CuadroTerminado => ({
      puntosCampeon,
      partidos: [
        jugado(1, campeon, otros[0], campeon),
        jugado(1, finalista, otros[1], finalista),
        jugado(2, campeon, finalista, campeon),
      ],
    });

    const puestos = (filas: FilaDeRanking[]) =>
      filas.map((fila) => [fila.puesto, fila.nombre, fila.puntos]);

    it('suma los torneos de la ventana', () => {
      // Cada uno ganó uno y perdió el otro: 250 + 150. Con un solo torneo esto no
      // probaría que suma.
      const tabla = tablaDeRanking(
        [torneoDe(250, 1, 2, [3, 4]), torneoDe(250, 2, 1, [3, 4])],
        nombres,
      );

      expect(puestos(tabla)).toEqual([
        [1, 'Ana Uno', 400],
        [1, 'Beto Dos', 400],
      ]);
    });

    it('**quien no sumó un punto no aparece**', () => {
      // Una tabla de posiciones ordena a quienes lograron algo. Los eliminados en
      // primera ronda están en el cuadro del torneo, que es donde se los busca.
      const tabla = tablaDeRanking([torneoDe(250, 1, 2, [3, 4])], nombres);

      expect(tabla.map((fila) => fila.jugadorId)).toEqual([1, 2]);
    });

    it('desempata por menos torneos: 250 en uno vale más que 250 en dos', () => {
      const tabla = tablaDeRanking(
        [
          // Ana campeona, Beto finalista: 250 y 150.
          torneoDe(250, 1, 2, [3, 4]),
          // Beto campeón de uno chico: llega a 250, pero le costó dos torneos.
          torneoDe(100, 2, 3, [4, 5]),
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

    it('a igual puntaje y torneos, arriba quien jugó la categoría más alta', () => {
      const tabla = tablaDeRanking(
        [
          // Ana finalista de un 500: 300 puntos.
          torneoDe(500, 3, 1, [4, 5]),
          // Beto campeón de un 300: los mismos 300, en un torneo más chico.
          torneoDe(300, 2, 4, [5, 6]),
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
        [torneoDe(250, 3, 4, [1, 5]), torneoDe(250, 2, 5, [1, 6])],
        nombres,
      );

      expect(tabla.slice(0, 2).map((fila) => fila.nombre)).toEqual([
        'Beto Dos',
        'Cata Tres',
      ]);
    });

    it('**el empate se muestra como empate: dos en el 1 y el siguiente en el 3**', () => {
      const tabla = tablaDeRanking(
        [torneoDe(250, 2, 5, [3, 4]), torneoDe(250, 3, 6, [1, 4])],
        nombres,
      );

      expect(puestos(tabla)).toEqual([
        [1, 'Beto Dos', 250],
        [1, 'Cata Tres', 250],
        [3, 'Eva Cinco', 150],
        [3, 'Fito Seis', 150],
      ]);
    });

    it('sin torneos en la ventana, la tabla queda vacía y no se cae', () => {
      expect(tablaDeRanking([], nombres)).toEqual([]);
    });

    it('un jugador sin nombre no rompe la tabla', () => {
      // No debería pasar —el nombre sale de la misma consulta—, pero una tabla que
      // explota es peor que una que muestra un número.
      const tabla = tablaDeRanking([torneoDe(250, 99, 98, [1, 2])], new Map());

      expect(tabla).toHaveLength(2);
    });
  });
});
