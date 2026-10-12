import { textoDeTalla } from './tallas';

/**
 * T161: cómo se muestra la talla de una variante. En una categoría con tabla de tallas,
 * la etiqueta es la talla chilena y se muestra con su US y su EU, de la tabla de la marca.
 * **Nunca se inventa una conversión**: si falta la tabla o la fila, va la etiqueta sola.
 */
describe('El texto de una talla', () => {
  const ASICS = [
    { tallaCl: '40', tallaUs: '8', tallaEu: '41' },
    { tallaCl: 'XL', tallaUs: 'XL', tallaEu: '44' },
  ];

  it('con tabla y la fila, muestra los tres sistemas', () => {
    expect(textoDeTalla('40', true, ASICS)).toBe('CL 40 · US 8 · EU 41');
  });

  it('busca la fila sin distinguir mayúsculas ni espacios, como el único de la base', () => {
    expect(textoDeTalla(' xl ', true, ASICS)).toBe('CL xl · US XL · EU 44');
  });

  it('si la marca no trae esa talla, muestra solo la etiqueta', () => {
    expect(textoDeTalla('41', true, ASICS)).toBe('41');
  });

  it('si la marca no tiene tabla, muestra solo la etiqueta', () => {
    expect(textoDeTalla('40', true, [])).toBe('40');
  });

  it('si la categoría no usa tabla, la etiqueta va tal cual aunque calce con una fila', () => {
    expect(textoDeTalla('40', false, ASICS)).toBe('40');
  });
});
