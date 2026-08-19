import { mesDelClub } from './invitados';

/**
 * T25. El mes calendario contra el que se cuentan los invitados.
 *
 * El cupo se renueva el día 1, y ese borde es todo el contenido de esta función: si el
 * día 1 cayera en el mes anterior, el socio arrancaría el mes con invitados ya
 * gastados; si el último día cayera en el siguiente, tendría cinco.
 */
describe('mesDelClub', () => {
  it('devuelve el primer día del mes y el primero del siguiente', () => {
    expect(mesDelClub('2026-08-17')).toEqual({
      desde: '2026-08-01',
      hasta: '2026-09-01',
    });
  });

  it('el día 1 pertenece a su propio mes, no al anterior', () => {
    expect(mesDelClub('2026-08-01')).toEqual({
      desde: '2026-08-01',
      hasta: '2026-09-01',
    });
  });

  it('el último día del mes todavía es de ese mes', () => {
    expect(mesDelClub('2026-01-31')).toEqual({
      desde: '2026-01-01',
      hasta: '2026-02-01',
    });
  });

  it('diciembre sigue en enero del año siguiente', () => {
    // Sumar un mes a mano —mes + 1— daría el mes 13, que no existe.
    expect(mesDelClub('2026-12-15')).toEqual({
      desde: '2026-12-01',
      hasta: '2027-01-01',
    });
  });

  it('febrero de un año bisiesto termina donde corresponde', () => {
    expect(mesDelClub('2028-02-29')).toEqual({
      desde: '2028-02-01',
      hasta: '2028-03-01',
    });
  });
});
