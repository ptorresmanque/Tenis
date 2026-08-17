import { claimsDe } from './google.oauth';

/** Arma un id_token de mentira: solo importa el payload del medio. */
function idTokenCon(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `cabecera.${payload}.firma`;
}

describe('claimsDe', () => {
  it('lee los claims que la vinculación necesita', () => {
    const claims = claimsDe(
      idTokenCon({
        sub: '108',
        email: 'socio@gmail.com',
        email_verified: true,
        given_name: 'Matías',
        family_name: 'Rojas',
      }),
    );

    expect(claims).toMatchObject({ sub: '108', email_verified: true });
  });

  it('no rompe los nombres con tildes ni con ñ', () => {
    // El payload viene en base64url sobre UTF-8: leerlo como latin1 dejaría
    // "MatÃ­as" en la ficha del socio para siempre.
    const claims = claimsDe(
      idTokenCon({ sub: '1', given_name: 'Begoña', family_name: 'Muñoz' }),
    );

    expect(claims?.given_name).toBe('Begoña');
    expect(claims?.family_name).toBe('Muñoz');
  });

  it('devuelve null si el token no tiene forma de JWT', () => {
    expect(claimsDe('esto-no-es-un-jwt')).toBeNull();
  });

  it('devuelve null si el payload no es JSON', () => {
    expect(claimsDe('cabecera.no-es-json.firma')).toBeNull();
  });
});
