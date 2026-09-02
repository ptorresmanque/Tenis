import { normalizarTelefono } from './telefono';

/**
 * T64. El teléfono es la llave con que se decide si dos inscripciones son la misma
 * persona, así que este archivo es el que impide que el ranking parta a alguien en dos.
 */
describe('normalizarTelefono', () => {
  it('**las tres formas en que la misma persona escribe su número caen en una**', () => {
    // Es el criterio obligatorio de T64, con los tres strings escritos: si esto se
    // rompe, el mismo jugador entra dos veces al ranking y su tabla queda mal a la
    // vista del club.
    const formas = ['+56 9 8765 4321', '56987654321', '9 8765 4321'];

    expect(new Set(formas.map(normalizarTelefono)).size).toBe(1);
    expect(normalizarTelefono(formas[0])).toBe('56987654321');
  });

  it('el móvil sin su 9, como todavía lo dicta media generación', () => {
    expect(normalizarTelefono('8765 4321')).toBe('56987654321');
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

  it('**un número extranjero se deja como está**', () => {
    // Al torneo vienen jugadores de otros clubes y de otros países. Ponerle `56` a un
    // número argentino lo convertiría en otro número, y el club llamaría a un
    // desconocido.
    expect(normalizarTelefono('+54 11 4321 8765')).toBe('541143218765');
  });

  it('lo que no alcanza a ser un número no lo es', () => {
    for (const basura of ['123', '', '   ', 'no tengo', '+56 9']) {
      expect(normalizarTelefono(basura)).toBeNull();
    }
  });

  it('más de quince dígitos tampoco: E.164 no da para más', () => {
    expect(normalizarTelefono('1234567890123456')).toBeNull();
  });

  it('lo que no es texto es nulo, sin reventar', () => {
    // Llega de un cuerpo JSON sin autenticar: puede ser cualquier cosa.
    for (const raro of [null, undefined, 42, {}, [], true]) {
      expect(normalizarTelefono(raro)).toBeNull();
    }
  });

  it('normalizar dos veces da lo mismo que normalizar una', () => {
    // El valor guardado vuelve a pasar por acá cuando alguien lo edita. Si no fuera
    // idempotente, un `56987654321` guardado se convertiría en otro número al releerlo.
    const una = normalizarTelefono('+56 9 8765 4321');

    expect(normalizarTelefono(una)).toBe(una);
  });
});
