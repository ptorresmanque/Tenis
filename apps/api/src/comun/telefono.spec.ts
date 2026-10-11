import { leerTelefono, mostrarTelefono, normalizarTelefono } from './telefono';

/**
 * T120. Una sola regla de teléfono para todo el sitio: +56 y 9 dígitos (decisión 1 de la
 * sexta parte). Sigue siendo la llave con que torneos decide si dos inscripciones son la
 * misma persona (T64), así que este archivo también impide que el ranking parta a alguien
 * en dos.
 */
describe('normalizarTelefono', () => {
  it('**las formas en que la misma persona escribe su número caen en una**', () => {
    const formas = [
      '+56 9 8765 4321',
      '56987654321',
      '9 8765 4321',
      '987654321',
    ];

    expect(new Set(formas.map(normalizarTelefono)).size).toBe(1);
    expect(normalizarTelefono(formas[0])).toBe('56987654321');
  });

  it('acepta los separadores con que la gente escribe de verdad', () => {
    for (const escrito of [
      '+56-9-8765-4321',
      '(56) 9 8765 4321',
      '56.9.8765.4321',
    ]) {
      expect(normalizarTelefono(escrito)).toBe('56987654321');
    }
  });

  it('un fijo también tiene 9 dígitos y entra', () => {
    expect(normalizarTelefono('+56 2 2345 6789')).toBe('56223456789');
  });

  it('**un número extranjero ya no entra**: el sitio es de Chile (sexta parte, decisión 1)', () => {
    // Hasta T120 se dejaba como estaba, porque al torneo venían jugadores de afuera. El
    // club decidió +56 fijo en todo: el extranjero deja un número chileno o ninguno.
    expect(normalizarTelefono('+54 11 4321 8765')).toBeNull();
  });

  it('**8 dígitos ya no se completan con el 9**: el campo pide los 9', () => {
    expect(normalizarTelefono('8765 4321')).toBeNull();
  });

  it('lo que no son 9 dígitos, con o sin el 56, no es un teléfono', () => {
    for (const basura of [
      '123',
      '',
      '   ',
      'no tengo',
      '+56 9',
      '9876543210',
      '5698765432',
    ]) {
      expect(normalizarTelefono(basura)).toBeNull();
    }
  });

  it('lo que no es texto es nulo, sin reventar', () => {
    for (const raro of [null, undefined, 42, {}, [], true]) {
      expect(normalizarTelefono(raro)).toBeNull();
    }
  });

  it('normalizar dos veces da lo mismo que normalizar una', () => {
    const una = normalizarTelefono('+56 9 8765 4321');

    expect(normalizarTelefono(una)).toBe(una);
  });
});

describe('leerTelefono', () => {
  it('devuelve la forma guardada', () => {
    expect(leerTelefono('+56 9 8765 4321', { obligatorio: true })).toBe(
      '56987654321',
    );
  });

  it('**uno mal escrito responde 400 diciendo el formato**', () => {
    expect(() => leerTelefono('12345', { obligatorio: false })).toThrow(
      'El teléfono tiene que tener 9 dígitos, sin contar el +56.',
    );
  });

  it('vacío es nulo si es opcional, y 400 si es obligatorio', () => {
    expect(leerTelefono('', { obligatorio: false })).toBeNull();
    expect(leerTelefono(undefined, { obligatorio: false })).toBeNull();
    expect(() => leerTelefono('  ', { obligatorio: true })).toThrow(
      'El teléfono es obligatorio.',
    );
  });
});

describe('mostrarTelefono', () => {
  it('**el móvil con el +56 y en grupos, como se dicta**', () => {
    expect(mostrarTelefono('56987654321')).toBe('+56 9 8765 4321');
  });

  it('el fijo de Santiago, con su 2 aparte', () => {
    expect(mostrarTelefono('56223456789')).toBe('+56 2 2345 6789');
  });

  it('un fijo de región, con su área de dos dígitos', () => {
    expect(mostrarTelefono('56452123456')).toBe('+56 45 212 3456');
  });

  it('lo que no está en la forma guardada se muestra como vino, sin inventar', () => {
    // Un dato de antes que la migración no pudo leer: mejor verlo tal cual que perderlo.
    expect(mostrarTelefono('+54 11 4321 8765')).toBe('+54 11 4321 8765');
    expect(mostrarTelefono('')).toBe('');
  });
});
