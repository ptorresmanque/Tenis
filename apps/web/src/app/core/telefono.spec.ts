import { describe, expect, it } from 'vitest';

import { EnlaceTelefonoPipe, TelefonoPipe } from './telefono';

/**
 * T120. Cómo se muestra un teléfono guardado (`56` y los 9 dígitos). La misma regla que
 * `mostrarTelefono` de la API, que firma los correos.
 */
describe('TelefonoPipe', () => {
  const pipe = new TelefonoPipe();

  it('**el móvil con el +56 y en grupos, como se dicta**', () => {
    expect(pipe.transform('56987654321')).toBe('+56 9 8765 4321');
  });

  it('el fijo de Santiago y el de región', () => {
    expect(pipe.transform('56223456789')).toBe('+56 2 2345 6789');
    expect(pipe.transform('56452123456')).toBe('+56 45 212 3456');
  });

  it('lo que no está en la forma guardada se muestra como vino', () => {
    expect(pipe.transform('+54 11 4321 8765')).toBe('+54 11 4321 8765');
    expect(pipe.transform(null)).toBe('');
  });
});

describe('EnlaceTelefonoPipe', () => {
  const pipe = new EnlaceTelefonoPipe();

  it('**el enlace lleva el +56 y ningún espacio**: el teléfono marca bien desde afuera', () => {
    expect(pipe.transform('56987654321')).toBe('tel:+56987654321');
  });

  it('un dato de antes se marca con lo que tenga', () => {
    expect(pipe.transform('+54 11 4321 8765')).toBe('tel:+541143218765');
  });
});
