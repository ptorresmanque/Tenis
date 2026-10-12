import { temporadaVigente } from './vigente';

/**
 * T194. La temporada que se muestra por omisión (`SPEC-tours.md` § Temporadas): la que
 * contiene hoy y, si son varias, la que empezó más tarde; si ninguna lo contiene, la más
 * reciente que ya empezó; si ninguna empezó, la más próxima.
 *
 * El día se pasa como parámetro: así se prueba moviendo el reloj, no esperando.
 */
describe('temporadaVigente', () => {
  const dia = (fecha: string) => new Date(`${fecha}T00:00:00.000Z`);
  const temporada = (id: number, inicio: string, fin: string) => ({
    id,
    fechaInicio: dia(inicio),
    fechaFin: dia(fin),
  });

  const DE_2026 = temporada(1, '2026-03-01', '2026-12-15');
  const DE_2027 = temporada(2, '2027-03-01', '2027-12-15');

  it('**hoy dentro de una**: esa', () => {
    expect(temporadaVigente([DE_2026, DE_2027], dia('2027-06-20'))).toBe(2);
  });

  it('el primer y el último día de la temporada cuentan como dentro', () => {
    expect(temporadaVigente([DE_2026, DE_2027], dia('2027-03-01'))).toBe(2);
    expect(temporadaVigente([DE_2026, DE_2027], dia('2026-12-15'))).toBe(1);
  });

  it('**dentro de dos que se pisan**: la que empezó más tarde', () => {
    const anual = temporada(3, '2027-01-01', '2027-12-31');
    const clausura = temporada(4, '2027-07-01', '2027-12-15');

    expect(temporadaVigente([anual, clausura], dia('2027-08-10'))).toBe(4);
    expect(temporadaVigente([anual, clausura], dia('2027-03-10'))).toBe(3);
  });

  it('**entre dos**, en el receso de verano: la que terminó, que es la más reciente que empezó', () => {
    expect(temporadaVigente([DE_2026, DE_2027], dia('2027-01-20'))).toBe(1);
  });

  it('**antes de la primera**: la más próxima', () => {
    expect(temporadaVigente([DE_2027, DE_2026], dia('2025-11-01'))).toBe(1);
  });

  it('después de la última: la última', () => {
    expect(temporadaVigente([DE_2026, DE_2027], dia('2028-02-01'))).toBe(2);
  });

  it('sin temporadas, ninguna', () => {
    expect(temporadaVigente([], dia('2027-06-20'))).toBeNull();
  });

  it('dos que empiezan el mismo día: la de id mayor, para que la respuesta no dependa del orden', () => {
    const una = temporada(7, '2027-03-01', '2027-06-30');
    const otra = temporada(8, '2027-03-01', '2027-12-15');

    expect(temporadaVigente([otra, una], dia('2027-04-01'))).toBe(8);
    expect(temporadaVigente([una, otra], dia('2027-04-01'))).toBe(8);
    // Y lo mismo si las dos son futuras.
    expect(temporadaVigente([una, otra], dia('2026-11-01'))).toBe(8);
  });
});
