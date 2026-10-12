import { normalizarRut } from './rut';

/**
 * T164: el RUT de una factura. Se guarda en una sola forma —`76123456-7`, sin puntos y con
 * la K en mayúscula— y solo si el dígito verificador cuadra (módulo 11): una factura a un
 * RUT con un dígito cambiado es una factura a otra empresa.
 */
describe('El RUT de una factura', () => {
  it.each([
    ['76.123.456-0', '76123456-0'],
    ['76123456-0', '76123456-0'],
    [' 76123456 0 ', '76123456-0'],
    ['11.111.111-1', '11111111-1'],
    ['12.345.678-5', '12345678-5'],
    ['10.000.013-k', '10000013-K'],
    ['1-9', '1-9'],
  ])('%s queda como %s', (escrito, guardado) => {
    expect(normalizarRut(escrito)).toBe(guardado);
  });

  it.each([
    ['un dígito verificador que no cuadra', '76.123.456-7'],
    ['sin dígito verificador', '76123456'],
    ['letras', 'abc'],
    ['vacío', ''],
    ['demasiado largo', '1234567890-1'],
  ])('%s no es un RUT', (_caso, escrito) => {
    expect(normalizarRut(escrito)).toBeNull();
  });
});
