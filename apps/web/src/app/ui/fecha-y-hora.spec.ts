import { describe, expect, it } from 'vitest';

import { fechaATexto, horaATexto, textoAFecha, textoAHora } from './fecha-y-hora';

/**
 * T244. Las fechas y las horas viven como `Date` dentro de cada componente, como las entrega
 * Material, y pasan a texto solo al hablar con la API (A5).
 */
describe('fecha y hora como texto', () => {
  it('**el día de un `Date` sale como lo espera la API**: AAAA-MM-DD', () => {
    expect(fechaATexto(new Date(2037, 11, 5))).toBe('2037-12-05');
  });

  it('**la hora sale en 24 horas**, con el cero adelante', () => {
    expect(horaATexto(new Date(2000, 0, 1, 9, 0))).toBe('09:00');
  });

  it('**un campo vacío o inválido sale vacío**, como en los campos de antes', () => {
    // El selector entrega nulo si el campo quedó vacío, y una fecha inválida si se escribió
    // una que no existe: ninguna de las dos es un día que se pueda mandar.
    expect(fechaATexto(null)).toBe('');
    expect(fechaATexto(new Date(Number.NaN))).toBe('');
    expect(horaATexto(null)).toBe('');
    expect(horaATexto(new Date(Number.NaN))).toBe('');
  });

  it('ida y vuelta: el texto de la API vuelve al mismo texto', () => {
    expect(fechaATexto(textoAFecha('2037-04-05'))).toBe('2037-04-05');
    expect(horaATexto(textoAHora('19:30'))).toBe('19:30');
  });
});
