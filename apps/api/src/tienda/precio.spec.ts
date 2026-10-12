import { descuentoUnitario, precioDeSocio } from './precio';

/**
 * T161: el descuento de socio, **por unidad y redondeado al peso**, a medias hacia arriba
 * (`SPEC-tienda.md` § Precio y descuento de socio).
 *
 * Por unidad para que la devolución de una línea devuelva exactamente lo que se pagó por
 * ella. Con aritmética entera, para que un .5 no dependa de cómo el punto flotante
 * represente un precio.
 */
describe('El precio de socio', () => {
  it.each([
    // precio, %, descuento, precio de socio
    [10000, 15, 1500, 8500],
    [9990, 15, 1499, 8491], // 1.498,5 sube a 1.499
    [9995, 15, 1499, 8496], // 1.499,25 baja a 1.499
    [249990, 15, 37499, 212491], // 37.498,5 sube
    [6990, 15, 1049, 5941], // 1.048,5 sube
    [15, 15, 2, 13], // 2,25 baja
    [10, 15, 2, 8], // 1,5 sube
  ])(
    '%i con %i%% descuenta %i y queda en %i',
    (precio, porcentaje, descuento, final) => {
      expect(descuentoUnitario(precio, porcentaje)).toBe(descuento);
      expect(precioDeSocio(precio, porcentaje)).toBe(final);
    },
  );

  it('con 0% no descuenta nada', () => {
    expect(precioDeSocio(9990, 0)).toBe(9990);
  });

  it('el descuento nunca deja un precio en cero o negativo', () => {
    expect(precioDeSocio(1, 50)).toBe(1);
  });
});
