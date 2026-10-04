import {
  agruparOcupacion,
  BloqueMedido,
  estadoDelBloque,
  CORTES_DE_OCUPACION,
  esCorteDeOcupacion,
  porcentajeDeOcupacion,
} from './ocupacion';

/**
 * T58: la medición de ocupación, sin base de datos.
 *
 * Dos cosas se deciden acá y las dos pueden mentir en silencio. La primera: **una clase
 * ocupa la cancha, no la cierra**. En la base una clase es un `Bloqueo`, igual que una
 * mantención, y confundirlas convierte las horas más productivas del club en horas
 * cerradas. La segunda: **lo cerrado sale del denominador**, porque una cancha cerrada
 * por riego no está ocupada ni desaprovechada, y meterla en cualquiera de los dos lados
 * miente.
 */
describe('ocupación de cancha', () => {
  const enHoras = (desdeH: number, hastaH: number) => ({
    inicio: new Date(
      `2026-08-10T${String(desdeH).padStart(2, '0')}:00:00.000Z`,
    ),
    fin: new Date(`2026-08-10T${String(hastaH).padStart(2, '0')}:00:00.000Z`),
  });

  const bloque = (
    desdeH: number,
    bloqueado = false,
    motivo: string | null = null,
  ) => ({
    ...enHoras(desdeH, desdeH + 1),
    bloqueado,
    motivoBloqueo: motivo,
  });

  describe('de qué es cada bloque', () => {
    it('sin nada encima, está libre', () => {
      expect(estadoDelBloque(bloque(10), [])).toBe('LIBRE');
    });

    it('con una reserva encima, ocupado', () => {
      expect(estadoDelBloque(bloque(10), [enHoras(10, 11)])).toBe('OCUPADO');
    });

    it('una reserva que lo pisa a medias también lo ocupa', () => {
      // Media hora de cancha tomada no deja media hora vendible.
      expect(estadoDelBloque(bloque(10), [enHoras(10, 11)])).toBe('OCUPADO');
      expect(estadoDelBloque(bloque(10), [enHoras(9, 11)])).toBe('OCUPADO');
    });

    it('una reserva que termina justo cuando empieza no lo toca', () => {
      // Los bordes exactos no se pisan: la misma regla que usa la grilla.
      expect(estadoDelBloque(bloque(10), [enHoras(9, 10)])).toBe('LIBRE');
    });

    it('**una hora en mantención no está ocupada ni libre: está cerrada**', () => {
      expect(estadoDelBloque(bloque(10, true, 'MANTENCION'), [])).toBe(
        'CERRADO',
      );
    });

    it('una hora tomada por un torneo, igual', () => {
      expect(estadoDelBloque(bloque(10, true, 'TORNEO'), [])).toBe('CERRADO');
    });

    it('**una clase ocupa la cancha, no la cierra**', () => {
      // En la base una clase es un `Bloqueo` como la mantención. Si contara como
      // cierre, las horas que más rinden saldrían del denominador y el club vería una
      // ocupación inventada.
      expect(estadoDelBloque(bloque(10, true, 'CLASE'), [])).toBe('OCUPADO');
    });

    it('un cierre gana sobre una reserva: esa hora no se jugó', () => {
      // No debería pasar —cerrar cancela las reservas—, pero si pasa, la hora que el
      // club cerró no estuvo a la venta.
      expect(
        estadoDelBloque(bloque(10, true, 'MANTENCION'), [enHoras(10, 11)]),
      ).toBe('CERRADO');
    });
  });

  describe('la tabla', () => {
    const medido = (
      estado: BloqueMedido['estado'],
      extra: Partial<BloqueMedido> = {},
    ): BloqueMedido => ({
      cancha: 'Cancha 1',
      techada: false,
      esPico: false,
      estado,
      horas: 1,
      ...extra,
    });

    it('sin bloques no devuelve filas', () => {
      expect(agruparOcupacion([], 'cancha')).toEqual([]);
    });

    it('suma horas y no cuenta bloques: dos tramos de media hora son una hora', () => {
      // T77. Con reservas que empiezan cada media hora, el reporte mide en tramos de
      // 30 minutos y entrega horas. Contar tramos mostraría 8 donde el club abrió 4.
      const filas = agruparOcupacion(
        [
          medido('OCUPADO', { horas: 0.5 }),
          medido('OCUPADO', { horas: 0.5 }),
          medido('LIBRE', { horas: 0.5 }),
          medido('CERRADO', { horas: 0.5 }),
        ],
        'cancha',
      );

      expect(filas[0]).toMatchObject({
        horas: 2,
        ocupados: 1,
        libres: 0.5,
        cerrados: 0.5,
        porcentajeOcupacion: 67,
      });
    });

    it('cuenta ocupados, cerrados y libres por separado', () => {
      const filas = agruparOcupacion(
        [medido('OCUPADO'), medido('LIBRE'), medido('CERRADO')],
        'cancha',
      );

      expect(filas[0]).toMatchObject({
        etiqueta: 'Cancha 1',
        horas: 3,
        ocupados: 1,
        cerrados: 1,
        libres: 1,
      });
    });

    it('**lo cerrado sale del denominador**', () => {
      // Tres bloques, uno cerrado: la ocupación es 1 de 2, no 1 de 3. Contar el
      // cerrado como disponible castiga al club por regar la cancha.
      const filas = agruparOcupacion(
        [medido('OCUPADO'), medido('LIBRE'), medido('CERRADO')],
        'cancha',
      );

      expect(filas[0].porcentajeOcupacion).toBe(50);
    });

    it('un día entero cerrado no da 0 % ni 100 %: da nulo', () => {
      // No hubo horas que ofrecer. Un cero se lee como "nadie vino", que es otra cosa.
      const filas = agruparOcupacion([medido('CERRADO')], 'cancha');

      expect(filas[0].porcentajeOcupacion).toBeNull();
    });

    it('**techada contra abierta, que es lo que el club está esperando**', () => {
      const filas = agruparOcupacion(
        [
          medido('OCUPADO', { techada: true }),
          medido('OCUPADO', { techada: true }),
          medido('OCUPADO', { techada: false }),
          medido('LIBRE', { techada: false }),
        ],
        'condicion',
      );

      expect(filas.map((f) => [f.etiqueta, f.porcentajeOcupacion])).toEqual([
        ['Techada', 100],
        ['Abierta', 50],
      ]);
    });

    it('por franja, que es por lo que se mide y no solo por día', () => {
      const filas = agruparOcupacion(
        [medido('OCUPADO', { esPico: true }), medido('LIBRE')],
        'franja',
      );

      expect(filas.map((f) => f.etiqueta).sort()).toEqual(['Pico', 'Valle']);
    });

    it('ordena de más ocupada a menos: la pregunta es cuál rinde', () => {
      const filas = agruparOcupacion(
        [medido('LIBRE'), medido('OCUPADO', { cancha: 'Cancha 9' })],
        'cancha',
      );

      expect(filas.map((f) => f.etiqueta)).toEqual(['Cancha 9', 'Cancha 1']);
    });

    it('**la suma de las filas da el total, en los tres cortes**', () => {
      const bloques = [
        medido('OCUPADO', { techada: true, esPico: true }),
        medido('LIBRE', { cancha: 'Cancha 2' }),
        medido('CERRADO', { techada: true }),
      ];

      for (const corte of CORTES_DE_OCUPACION) {
        const suma = agruparOcupacion(bloques, corte).reduce(
          (total, fila) => total + fila.horas,
          0,
        );

        expect([corte, suma]).toEqual([corte, 3]);
      }
    });
  });

  describe('el porcentaje, que es una sola regla', () => {
    // Exportada porque la usan las filas **y** el total del reporte. Calculada aparte
    // para el total, un reporte terminaría con un total que no cuadra con sus filas.
    it('**la cerrada no entra en el denominador**', () => {
      // Uno ocupado, uno cerrado, dos libres: 1 de 3 es 33 %. Contando la cerrada
      // darían 25 %, y es el caso donde las dos fórmulas se separan.
      expect(
        porcentajeDeOcupacion({ horas: 4, ocupados: 1, cerrados: 1 }),
      ).toBe(33);
    });

    it('sin horas que ofrecer, nulo y no cero', () => {
      expect(
        porcentajeDeOcupacion({ horas: 3, ocupados: 0, cerrados: 3 }),
      ).toBeNull();
    });

    it('todo ocupado es 100 %', () => {
      expect(
        porcentajeDeOcupacion({ horas: 5, ocupados: 4, cerrados: 1 }),
      ).toBe(100);
    });
  });

  describe('el corte pedido', () => {
    it('reconoce los tres que tienen sentido sobre un bloque', () => {
      // Ni "socio" ni "concepto": una hora libre no tiene usuario ni concepto, y
      // ofrecer el corte obligaría a inventar una fila que no significa nada.
      expect(CORTES_DE_OCUPACION).toEqual(['cancha', 'condicion', 'franja']);
      expect(CORTES_DE_OCUPACION.every(esCorteDeOcupacion)).toBe(true);
    });

    it('y rechaza el resto', () => {
      expect(esCorteDeOcupacion('usuario')).toBe(false);
      expect(esCorteDeOcupacion('concepto')).toBe(false);
    });
  });
});
