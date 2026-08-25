import {
  cambioDeElo,
  ELO_INICIAL,
  esperado,
  PartidoConfirmado,
  tablaInterna,
} from './elo';

/**
 * T56: el motor del ranking interno, sin base de datos.
 *
 * Elo es secuencial —el resultado depende del orden en que se jugaron los partidos—, así
 * que lo que más se prueba acá no son los números sueltos sino que **el recorrido sea
 * determinista**: un ranking que da resultados distintos en dos consultas seguidas no es
 * un ranking.
 *
 * Los números van escritos, no calculados con la misma fórmula del código: un test que
 * repite la fórmula no prueba nada, solo la copia.
 */
describe('Elo del ranking interno', () => {
  const HOY = new Date('2026-08-25T00:00:00.000Z');

  /** Un partido confirmado. `dia` es la fecha civil; `orden` desempata dentro del día. */
  const partido = (
    ganador: number,
    perdedor: number,
    dia = '2026-08-01',
    orden = 0,
  ): PartidoConfirmado => ({
    socioAId: ganador,
    socioBId: perdedor,
    ganadorSocioId: ganador,
    jugadoEn: new Date(`${dia}T00:00:00.000Z`),
    cargadoEn: new Date(`${dia}T10:00:00.000Z`).getTime() + orden,
  });

  const nombres = new Map([
    [1, 'Ana Uno'],
    [2, 'Beto Dos'],
    [3, 'Cata Tres'],
    [4, 'Dani Cuatro'],
  ]);

  const elosDe = (partidos: PartidoConfirmado[], hoy = HOY) =>
    Object.fromEntries(
      tablaInterna(partidos, nombres, hoy).map((fila) => [
        fila.nombre,
        fila.elo,
      ]),
    );

  describe('los números', () => {
    it('todos empiezan en 1200', () => {
      expect(ELO_INICIAL).toBe(1200);
    });

    it('entre iguales, el esperado es la mitad', () => {
      expect(esperado(1200, 1200)).toBeCloseTo(0.5, 10);
    });

    it('**ganarle a un igual mueve 16**', () => {
      // K = 32, esperado 0.5: 32 × (1 − 0,5) = 16.
      expect(cambioDeElo(1200, 1200)).toBe(16);
    });

    it('**ganarle a alguien 300 puntos por debajo casi no suma**', () => {
      // Es el punto del sistema: el ranking no se escala jugando siempre contra el
      // mismo principiante.
      expect(cambioDeElo(1500, 1200)).toBe(5);
    });

    it('**y perder contra él cuesta caro**', () => {
      // El de 1200 le gana al de 1500 y se lleva 27, cinco veces más que al revés.
      expect(cambioDeElo(1200, 1500)).toBe(27);
    });

    it('el cambio nunca pasa de K', () => {
      // Contra alguien infinitamente peor, el esperado tiende a 1 y el cambio a 0;
      // contra alguien infinitamente mejor, tiende a 32.
      expect(cambioDeElo(3000, 100)).toBeGreaterThanOrEqual(0);
      expect(cambioDeElo(100, 3000)).toBeLessThanOrEqual(32);
    });
  });

  describe('la suma no cambia', () => {
    it('**lo que gana uno es exactamente lo que pierde el otro**', () => {
      // El test que ataja el error de redondear cada lado por separado.
      const tabla = tablaInterna([partido(1, 2)], nombres, HOY);

      expect(tabla.map((f) => f.elo)).toEqual([1216, 1184]);
      expect(tabla[0].elo + tabla[1].elo).toBe(2 * ELO_INICIAL);
    });

    it('**y sigue sumando cero después de una cadena larga**', () => {
      // Esta secuencia no es cualquiera: está elegida porque **distingue** el redondeo
      // correcto del incorrecto. Acumulando en flotante y redondeando cada fila al
      // mostrarla, la tabla da 4801 y Ana termina con 1215 en vez de 1214: un punto
      // inventado de la nada, que es justo el error que el spec manda atajar.
      const partidos = [
        partido(2, 3, '2026-03-01'),
        partido(1, 3, '2026-03-05'),
        partido(3, 4, '2026-04-01'),
        partido(2, 1, '2026-05-01'),
        partido(2, 4, '2026-06-01'),
        partido(1, 3, '2026-07-01'),
      ];

      const tabla = tablaInterna(partidos, nombres, HOY);
      const porNombre = Object.fromEntries(
        tabla.map((fila) => [fila.nombre, fila.elo]),
      );

      expect(porNombre).toEqual({
        'Ana Uno': 1214,
        'Beto Dos': 1246,
        'Cata Tres': 1171,
        'Dani Cuatro': 1169,
      });
      expect(tabla.reduce((suma, fila) => suma + fila.elo, 0)).toBe(
        4 * ELO_INICIAL,
      );
    });
  });

  describe('el orden', () => {
    it('**el resultado no depende del orden en que lleguen los partidos**', () => {
      // Elo es secuencial: los mismos dos partidos en distinto orden dan tablas
      // distintas. Lo que no puede pasar es que dependa de cómo los devuelva la base.
      const primero = partido(1, 2, '2026-08-01', 1);
      const segundo = partido(2, 1, '2026-08-01', 2);

      expect(elosDe([primero, segundo])).toEqual(elosDe([segundo, primero]));
    });

    it('**dentro del mismo día manda el orden de carga**', () => {
      // Los dos partidos son el mismo día. Si el desempate no existiera, la tabla
      // saldría distinta según el humor de la base.
      const antes = partido(1, 2, '2026-08-01', 1);
      const despues = partido(2, 1, '2026-08-01', 2);

      // Gana Ana y después gana Beto: Beto queda arriba por 2 puntos.
      expect(elosDe([antes, despues])).toEqual({
        'Beto Dos': 1201,
        'Ana Uno': 1199,
      });
    });

    it('y al revés da lo contrario, que es lo que hace que el orden importe', () => {
      const antes = partido(2, 1, '2026-08-01', 1);
      const despues = partido(1, 2, '2026-08-01', 2);

      expect(elosDe([antes, despues])).toEqual({
        'Ana Uno': 1201,
        'Beto Dos': 1199,
      });
    });

    it('los días mandan sobre el orden de carga', () => {
      // Un partido de marzo cargado ayer va antes que uno de agosto cargado hace un
      // mes: lo que ordena es cuándo se jugó.
      const marzo = {
        ...partido(1, 2, '2026-03-01'),
        cargadoEn: 9_999_999_999,
      };
      const agosto = { ...partido(2, 1, '2026-08-01'), cargadoEn: 1 };

      expect(elosDe([marzo, agosto])).toEqual(elosDe([agosto, marzo]));
      expect(elosDe([marzo, agosto])['Beto Dos']).toBe(1201);
    });
  });

  describe('la tabla', () => {
    it('ordena de más a menos y numera los puestos', () => {
      const tabla = tablaInterna([partido(1, 2)], nombres, HOY);

      expect(tabla.map((f) => [f.puesto, f.nombre])).toEqual([
        [1, 'Ana Uno'],
        [2, 'Beto Dos'],
      ]);
    });

    it('cuenta los partidos jugados y los ganados', () => {
      const tabla = tablaInterna(
        [partido(1, 2, '2026-07-01'), partido(2, 1, '2026-07-02')],
        nombres,
        HOY,
      );
      const ana = tabla.find((f) => f.nombre === 'Ana Uno');

      expect(ana?.partidos).toBe(2);
      expect(ana?.ganados).toBe(1);
    });

    it('dice cuándo jugó cada uno por última vez', () => {
      const tabla = tablaInterna([partido(1, 2, '2026-07-15')], nombres, HOY);

      expect(tabla[0].ultimoPartido).toBe('2026-07-15');
    });

    it('quien solo perdió queda debajo de 1200', () => {
      const tabla = tablaInterna([partido(1, 2)], nombres, HOY);

      expect(tabla.find((f) => f.nombre === 'Beto Dos')!.elo).toBeLessThan(
        ELO_INICIAL,
      );
    });

    it('sin partidos, la tabla queda vacía y no se cae', () => {
      expect(tablaInterna([], nombres, HOY)).toEqual([]);
    });

    it('un jugador sin nombre no rompe la tabla', () => {
      expect(tablaInterna([partido(98, 99)], new Map(), HOY)).toHaveLength(2);
    });
  });

  describe('los inactivos', () => {
    it('**quien no juega hace seis meses sale de la tabla principal**', () => {
      // Un ranking con alguien arriba que no juega hace dos años no lo cree nadie.
      const tabla = tablaInterna([partido(1, 2, '2026-01-10')], nombres, HOY);

      expect(tabla.every((f) => f.activo)).toBe(false);
    });

    it('**y conserva su Elo intacto para cuando vuelva**', () => {
      // Salir de la tabla no es perder lo ganado: el Elo no caduca.
      const tabla = tablaInterna([partido(1, 2, '2026-01-10')], nombres, HOY);

      expect(tabla.find((f) => f.nombre === 'Ana Uno')!.elo).toBe(1216);
    });

    it('uno de hace cinco meses sigue activo', () => {
      // El par del anterior: sin este, un corte que dejara a todos afuera pasaría.
      const tabla = tablaInterna([partido(1, 2, '2026-04-10')], nombres, HOY);

      expect(tabla.every((f) => f.activo)).toBe(true);
    });

    it('**los inactivos no ocupan puesto**', () => {
      // Si contaran, el segundo activo aparecería tercero sin que nadie entienda por
      // qué falta el segundo.
      const tabla = tablaInterna(
        [
          // Cata y Dani juegan hace poco; Ana y Beto hace ocho meses.
          partido(1, 2, '2025-12-20'),
          partido(3, 4, '2026-08-01'),
        ],
        nombres,
        HOY,
      );

      const activos = tabla.filter((f) => f.activo).map((f) => f.puesto);
      expect(activos).toEqual([1, 2]);
      expect(
        tabla.filter((f) => !f.activo).every((f) => f.puesto === null),
      ).toBe(true);
    });

    it('los inactivos van al final, no mezclados', () => {
      const tabla = tablaInterna(
        [partido(1, 2, '2025-12-20'), partido(3, 4, '2026-08-01')],
        nombres,
        HOY,
      );

      expect(tabla.slice(0, 2).every((f) => f.activo)).toBe(true);
      expect(tabla.slice(2).every((f) => !f.activo)).toBe(true);
    });
  });
});
