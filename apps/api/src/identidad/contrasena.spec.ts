import { verify } from '@node-rs/argon2';

import { hashear, problemaDeContrasena } from './contrasena';

describe('problemaDeContrasena', () => {
  it('acepta una contraseña larga que no está en la lista de filtradas', () => {
    expect(problemaDeContrasena('raqueta lluviosa 44')).toBeNull();
  });

  it('rechaza menos de 10 caracteres diciendo cuántos faltan', () => {
    const problema = problemaDeContrasena('corta123');

    expect(problema).toContain('10');
  });

  it('acepta exactamente 10 caracteres: el mínimo está incluido', () => {
    expect(problemaDeContrasena('k9mzqrtvwx')).toBeNull();
    expect(problemaDeContrasena('k9mzqrtvw')).not.toBeNull();
  });

  it('no cuenta los espacios de relleno como largo', () => {
    // Diez espacios miden diez caracteres y no protegen nada.
    expect(problemaDeContrasena(' '.repeat(12))).not.toBeNull();
    expect(problemaDeContrasena('  hola  ')).not.toBeNull();
  });

  it('rechaza una contraseña filtrada aunque sea larga', () => {
    // Cumple el largo mínimo y aun así es de las primeras que prueba cualquiera.
    expect(problemaDeContrasena('password123')).not.toBeNull();
  });

  it('reconoce la contraseña filtrada sin importar mayúsculas ni espacios al borde', () => {
    expect(problemaDeContrasena('  Password123 ')).not.toBeNull();
  });

  it('no revela la contraseña en el mensaje de rechazo', () => {
    // El mensaje viaja al cliente y puede terminar en un log de errores.
    const contrasena = 'password123';

    expect(problemaDeContrasena(contrasena)).not.toContain(contrasena);
  });

  it('rechaza la vacía', () => {
    expect(problemaDeContrasena('')).not.toBeNull();
  });
});

describe('hashear', () => {
  it('usa argon2id y no otra variante', async () => {
    const hash = await hashear('raqueta lluviosa 44');

    // argon2i es débil contra GPU y argon2d contra side-channels; el spec pide id.
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('produce un hash verificable que no contiene la contraseña', async () => {
    const contrasena = 'raqueta lluviosa 44';
    const hash = await hashear(contrasena);

    expect(await verify(hash, contrasena)).toBe(true);
    expect(hash).not.toContain(contrasena);
  });

  it('da hashes distintos para la misma contraseña', async () => {
    // Sin sal por hash, dos socios con la misma contraseña se delatan entre sí.
    const [uno, otro] = await Promise.all([
      hashear('raqueta lluviosa 44'),
      hashear('raqueta lluviosa 44'),
    ]);

    expect(uno).not.toBe(otro);
  });
});
