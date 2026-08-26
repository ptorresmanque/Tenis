import {
  armarCuadro,
  avanceDe,
  azarCon,
  lugaresDeSiembra,
  lugarRival,
  nombreDeRonda,
  tamanoDelCuadro,
  type Participante,
} from './cuadro';

/**
 * T51: el cuadro, probado sobre su estructura y no sobre una pantalla.
 *
 * Es la parte del módulo que más fácil se equivoca y la más visible: está colgada en el
 * mural del club, y un cruce mal armado lo ve todo el que pasa. Por eso vive en
 * funciones puras y se prueba sin levantar nada.
 */
describe('El cuadro de un torneo', () => {
  /** Doce inscritos: cuatro sembrados y ocho sin sembrar. */
  const doce = (): Participante[] => [
    ...[1, 2, 3, 4].map((siembra) => ({ jugadorId: siembra, siembra })),
    ...[5, 6, 7, 8, 9, 10, 11, 12].map((jugadorId) => ({
      jugadorId,
      siembra: null,
    })),
  ];

  const enRonda = (partidos: ReturnType<typeof armarCuadro>, ronda: number) =>
    partidos.filter((partido) => partido.ronda === ronda);

  describe('tamanoDelCuadro', () => {
    it('doce inscritos juegan un cuadro de dieciséis', () => {
      // Redondear hacia abajo dejaría a cuatro inscritos fuera del torneo.
      expect(tamanoDelCuadro(12)).toBe(16);
    });

    it('ocho exactos son ocho: no inventa una ronda de más', () => {
      expect(tamanoDelCuadro(8)).toBe(8);
    });

    it('con menos de dos no hay torneo', () => {
      expect(() => tamanoDelCuadro(1)).toThrow();
    });
  });

  describe('lugaresDeSiembra', () => {
    it('**el 1 arriba de todo y el 2 abajo de todo**', () => {
      const lugares = lugaresDeSiembra(8);

      expect(lugares[0]).toBe(1);
      expect(lugares[1]).toBe(8);
    });

    it('**el 3 y el 4 en mitades opuestas**', () => {
      const lugares = lugaresDeSiembra(8);
      const mitad = (lugar: number) => (lugar <= 4 ? 'alta' : 'baja');

      expect(mitad(lugares[2])).not.toBe(mitad(lugares[3]));
    });

    it('el 1 y el 2 no se cruzan hasta la final', () => {
      const lugares = lugaresDeSiembra(16);
      const mitad = (lugar: number) => (lugar <= 8 ? 'alta' : 'baja');

      expect(mitad(lugares[0])).not.toBe(mitad(lugares[1]));
    });

    it('cada lugar del cuadro se usa una sola vez', () => {
      const lugares = lugaresDeSiembra(16);

      expect(new Set(lugares).size).toBe(16);
      expect([...lugares].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 16 }, (_, i) => i + 1),
      );
    });
  });

  describe('lugarRival', () => {
    it('los lugares se emparejan de a dos desde arriba', () => {
      expect(lugarRival(1)).toBe(2);
      expect(lugarRival(2)).toBe(1);
      expect(lugarRival(7)).toBe(8);
    });
  });

  describe('armarCuadro', () => {
    it('**doce inscritos: dieciséis lugares y cuatro byes para los sembrados 1 a 4**', () => {
      // El caso del criterio, y el que el club vive de verdad: casi nunca se inscriben
      // exactamente ocho o dieciséis.
      const partidos = armarCuadro(doce(), 42);
      const primera = enRonda(partidos, 1);

      expect(primera).toHaveLength(8);

      const byes = primera.filter(
        (partido) => partido.jugadorAId === null || partido.jugadorBId === null,
      );
      expect(byes).toHaveLength(4);

      // Y los byes son de los sembrados, que en este cuadro son los jugadores 1 a 4.
      const conBye = byes.map((partido) => partido.ganadorId).sort();
      expect(conBye).toEqual([1, 2, 3, 4]);
    });

    it('**ningún sembrado se cruza con otro en primera ronda**', () => {
      const partidos = armarCuadro(doce(), 42);
      const sembrados = new Set([1, 2, 3, 4]);

      for (const partido of enRonda(partidos, 1)) {
        const ambos =
          sembrados.has(partido.jugadorAId ?? 0) &&
          sembrados.has(partido.jugadorBId ?? 0);
        expect(ambos).toBe(false);
      }
    });

    it('**ocho inscritos exactos no generan ningún bye**', () => {
      const ocho = Array.from({ length: 8 }, (_, i) => ({
        jugadorId: i + 1,
        siembra: i < 2 ? i + 1 : null,
      }));

      const primera = enRonda(armarCuadro(ocho, 7), 1);

      expect(primera).toHaveLength(4);
      expect(
        primera.every(
          (partido) =>
            partido.jugadorAId !== null && partido.jugadorBId !== null,
        ),
      ).toBe(true);
      expect(primera.every((partido) => partido.ganadorId === null)).toBe(true);
    });

    it('**genera todos los partidos de todas las rondas**', () => {
      // El cuadro se dibuja entero desde el primer día: es lo que la gente mira en el
      // mural, y una mitad vacía no dice nada.
      const partidos = armarCuadro(doce(), 42);

      expect(partidos).toHaveLength(15); // 8 + 4 + 2 + 1
      expect(enRonda(partidos, 4)).toHaveLength(1);
      expect(enRonda(partidos, 4)[0].jugadorAId).toBeNull();
    });

    it('el que tiene bye ya aparece en la segunda ronda, sin cargar nada', () => {
      const partidos = armarCuadro(doce(), 42);
      const segunda = enRonda(partidos, 2);

      const yaColocados = segunda.flatMap((partido) =>
        [partido.jugadorAId, partido.jugadorBId].filter((id) => id !== null),
      );
      expect(yaColocados.sort()).toEqual([1, 2, 3, 4]);
    });

    it('**un bye da pase a la ronda dos y nada más**', () => {
      // Se veía en el cuadro dibujado: con doce inscritos, los cuatro sembrados
      // aparecían ya en semifinales sin haber jugado un punto, porque un hueco de
      // cuartos se estaba leyendo como otro bye.
      const partidos = armarCuadro(doce(), 42);

      for (const partido of partidos.filter((p) => p.ronda >= 3)) {
        expect(partido.jugadorAId).toBeNull();
        expect(partido.jugadorBId).toBeNull();
        expect(partido.ganadorId).toBeNull();
      }
    });

    it('en las rondas siguientes, un lugar vacío no resuelve el partido', () => {
      const partidos = armarCuadro(doce(), 42);
      const cuartos = enRonda(partidos, 2);

      // Los sembrados están ahí, pero ninguno tiene el partido ganado de antemano.
      expect(cuartos.some((p) => p.jugadorAId !== null)).toBe(true);
      expect(cuartos.every((p) => p.ganadorId === null)).toBe(true);
    });

    it('**la misma semilla da el mismo cuadro**', () => {
      // Si alguien pregunta por qué le tocó ese cruce, el sorteo se puede rehacer.
      expect(armarCuadro(doce(), 12345)).toEqual(armarCuadro(doce(), 12345));
    });

    it('semillas distintas reparten distinto a los no sembrados', () => {
      const uno = armarCuadro(doce(), 1);
      const otro = armarCuadro(doce(), 999);

      expect(uno).not.toEqual(otro);
    });

    it('todos los inscritos entran al cuadro, ninguno se pierde', () => {
      const partidos = armarCuadro(doce(), 42);
      const enPrimera = enRonda(partidos, 1).flatMap((partido) =>
        [partido.jugadorAId, partido.jugadorBId].filter((id) => id !== null),
      );

      expect(enPrimera.sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ]);
    });

    it('sin ningún sembrado también arma, y los byes van desde arriba', () => {
      const seis = Array.from({ length: 6 }, (_, i) => ({
        jugadorId: i + 1,
        siembra: null,
      }));

      const primera = enRonda(armarCuadro(seis, 3), 1);

      expect(primera).toHaveLength(4);
      expect(
        primera.filter(
          (partido) =>
            partido.jugadorAId === null || partido.jugadorBId === null,
        ),
      ).toHaveLength(2);
    });
  });

  describe('azarCon', () => {
    it('la misma semilla da la misma secuencia', () => {
      const una = azarCon(7);
      const otra = azarCon(7);

      expect([una(), una(), una()]).toEqual([otra(), otra(), otra()]);
    });

    it('devuelve números entre cero y uno', () => {
      const azar = azarCon(99);

      for (let i = 0; i < 50; i++) {
        const valor = azar();
        expect(valor).toBeGreaterThanOrEqual(0);
        expect(valor).toBeLessThan(1);
      }
    });
  });

  describe('avanceDe', () => {
    it('**el ganador de la posición 3 va a la posición 2 de la ronda siguiente**', () => {
      // Es el caso del criterio: los partidos se emparejan de a dos, el 3 y el 4 dan
      // el 2 de la ronda que viene.
      expect(avanceDe(1, 3)).toEqual({ ronda: 2, posicion: 2, lado: 'A' });
    });

    it('**el de posición impar entra arriba y el par abajo**', () => {
      // Confundir el lado dibuja un cuadro donde los cruces no son los que se jugaron.
      expect(avanceDe(1, 1).lado).toBe('A');
      expect(avanceDe(1, 2).lado).toBe('B');
      expect(avanceDe(2, 4).lado).toBe('B');
    });

    it('los dos partidos de un cruce llegan al mismo lugar por lados distintos', () => {
      const uno = avanceDe(1, 5);
      const otro = avanceDe(1, 6);

      expect(uno.posicion).toBe(otro.posicion);
      expect(uno.lado).not.toBe(otro.lado);
    });
  });

  describe('nombreDeRonda', () => {
    it('el nombre depende del tamaño del cuadro, no del número de ronda', () => {
      // En un cuadro de 8 la ronda 1 es cuartos; en uno de 32, dieciseisavos.
      expect(nombreDeRonda(1, 3)).toBe('Cuartos de final');
      expect(nombreDeRonda(1, 5)).toBe('Ronda 1');
      expect(nombreDeRonda(3, 3)).toBe('Final');
      expect(nombreDeRonda(2, 3)).toBe('Semifinal');
    });
  });
});
