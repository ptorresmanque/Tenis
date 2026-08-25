import { agrupar, CORTES, esCorte, Movimiento } from './ingreso';

/**
 * T57: los cortes del reporte de ingreso, sin base de datos.
 *
 * Lo que se prueba acá es la parte que decide **de qué columna es cada peso**. Los dos
 * errores que este archivo persigue son los que hacen que un reporte de plata mienta sin
 * que nada falle: que la suma de las filas no dé el total, y que una cuota desaparezca
 * de un corte que no la sabe clasificar.
 *
 * De dónde salen los movimientos y a qué fecha se atribuyen es del servicio; acá ya
 * llegan elegidos.
 */
describe('cortes del reporte de ingreso', () => {
  const arriendo = (
    montoClp: number,
    extra: Partial<Movimiento> = {},
  ): Movimiento => ({
    montoClp,
    concepto: 'ARRIENDO',
    cancha: 'Cancha 1',
    techada: false,
    esPico: false,
    esSocio: false,
    ...extra,
  });

  /** Una cuota no tiene cancha, ni condición, ni franja: no se jugó en ningún lado. */
  const cuota = (
    montoClp: number,
    concepto: Movimiento['concepto'] = 'CUOTA_MENSUAL',
  ): Movimiento => ({
    montoClp,
    concepto,
    cancha: null,
    techada: null,
    esPico: null,
    esSocio: true,
  });

  const filas = (
    movimientos: Movimiento[],
    corte: Parameters<typeof agrupar>[1],
  ) =>
    agrupar(movimientos, corte).map((fila) => [fila.etiqueta, fila.montoClp]);

  it('sin movimientos no devuelve filas y no se cae', () => {
    expect(agrupar([], 'cancha')).toEqual([]);
  });

  describe('por cancha', () => {
    it('una fila por cancha, con lo suyo sumado', () => {
      expect(
        filas(
          [
            arriendo(12000),
            arriendo(8000),
            arriendo(15000, { cancha: 'Cancha 2' }),
          ],
          'cancha',
        ),
      ).toEqual([
        ['Cancha 1', 20000],
        ['Cancha 2', 15000],
      ]);
    });

    it('**las cuotas no desaparecen: van en su propia fila**', () => {
      // Es el error que hace que la suma de las filas no dé el total. Una cuota no se
      // jugó en ninguna cancha, y dejarla fuera del corte la borra de la plata.
      expect(filas([arriendo(10000), cuota(25000)], 'cancha')).toEqual([
        ['Sin cancha (cuotas)', 25000],
        ['Cancha 1', 10000],
      ]);
    });

    it('ordena de más a menos: la pregunta es qué cancha rinde', () => {
      expect(
        filas(
          [arriendo(5000), arriendo(30000, { cancha: 'Cancha 9' })],
          'cancha',
        ),
      ).toEqual([
        ['Cancha 9', 30000],
        ['Cancha 1', 5000],
      ]);
    });
  });

  describe('por condición', () => {
    it('**techada contra abierta, que es la pregunta que motiva el módulo**', () => {
      expect(
        filas(
          [
            arriendo(20000, { techada: true }),
            arriendo(12000, { techada: false }),
            arriendo(18000, { techada: true }),
          ],
          'condicion',
        ),
      ).toEqual([
        ['Techada', 38000],
        ['Abierta', 12000],
      ]);
    });

    it('las cuotas tampoco son techadas ni abiertas', () => {
      expect(filas([cuota(25000)], 'condicion')).toEqual([
        ['Sin cancha (cuotas)', 25000],
      ]);
    });
  });

  describe('por franja', () => {
    it('pico y valle', () => {
      expect(
        filas([arriendo(20000, { esPico: true }), arriendo(12000)], 'franja'),
      ).toEqual([
        ['Pico', 20000],
        ['Valle', 12000],
      ]);
    });
  });

  describe('por tipo de usuario', () => {
    it('socio y no socio', () => {
      expect(filas([arriendo(12000), cuota(25000)], 'usuario')).toEqual([
        ['Socio', 25000],
        ['No socio', 12000],
      ]);
    });
  });

  describe('por concepto', () => {
    it('**de dónde viene la plata**', () => {
      expect(
        filas(
          [arriendo(12000), cuota(25000), cuota(80000, 'CUOTA_INCORPORACION')],
          'concepto',
        ),
      ).toEqual([
        ['Cuota de incorporación', 80000],
        ['Cuota mensual', 25000],
        ['Arriendo', 12000],
      ]);
    });
  });

  describe('la suma cuadra', () => {
    it('**en los cinco cortes, la suma de las filas da el mismo total**', () => {
      // Es el criterio 1 del spec y la única forma de saber que ningún corte pierde
      // plata por el camino. Se comprueba sobre los cinco de una vez: un corte nuevo
      // que no sepa clasificar algo cae acá.
      const movimientos = [
        arriendo(12000, { techada: true, esPico: true, esSocio: true }),
        arriendo(8000, { cancha: 'Cancha 2' }),
        cuota(25000),
        cuota(80000, 'CUOTA_INCORPORACION'),
      ];
      const total = 125000;

      for (const corte of CORTES) {
        const suma = agrupar(movimientos, corte).reduce(
          (acumulado, fila) => acumulado + fila.montoClp,
          0,
        );

        expect([corte, suma]).toEqual([corte, total]);
      }
    });
  });

  describe('el corte pedido', () => {
    it('reconoce los cinco', () => {
      expect(CORTES.every(esCorte)).toBe(true);
    });

    it('y rechaza cualquier otra cosa', () => {
      expect(esCorte('loQueSea')).toBe(false);
      expect(esCorte('')).toBe(false);
    });
  });
});
