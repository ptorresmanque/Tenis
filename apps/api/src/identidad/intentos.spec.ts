import { FALLOS_TOLERADOS, IntentosFallidos, VENTANA_MS } from './intentos';

/**
 * El freno a la fuerza bruta contra una contraseña.
 *
 * Cuenta fallos y no peticiones: el club sale a internet por una sola IP, así que
 * limitar peticiones dejaría afuera a los socios legítimos del mesón.
 */
describe('IntentosFallidos', () => {
  const AHORA = new Date('2026-08-20T12:00:00.000Z').getTime();
  const llave = 'socia@club.cl|10.0.0.1';

  let intentos: IntentosFallidos;

  beforeEach(() => {
    intentos = new IntentosFallidos();
  });

  it('deja pasar mientras no se agote la cuota', () => {
    for (let i = 0; i < FALLOS_TOLERADOS - 1; i++) {
      intentos.anotarFallo(llave, AHORA);
    }

    expect(intentos.bloqueado(llave, AHORA)).toBe(false);
  });

  it('bloquea al agotarla', () => {
    for (let i = 0; i < FALLOS_TOLERADOS; i++) {
      intentos.anotarFallo(llave, AHORA);
    }

    expect(intentos.bloqueado(llave, AHORA)).toBe(true);
  });

  it('la ventana corre: pasados los quince minutos vuelve a abrir', () => {
    // Sin esto, quien se equivocó cinco veces queda afuera hasta que alguien reinicie
    // el servidor, y el club termina abriendo la puerta a mano.
    for (let i = 0; i < FALLOS_TOLERADOS; i++) {
      intentos.anotarFallo(llave, AHORA);
    }

    expect(intentos.bloqueado(llave, AHORA + VENTANA_MS + 1)).toBe(false);
  });

  it('los fallos viejos no se suman a los nuevos', () => {
    // Cuatro fallos de hace media hora más uno de ahora no son cinco: si lo fueran,
    // quien se equivoca una vez por semana terminaría bloqueado sin haber hecho nada.
    for (let i = 0; i < FALLOS_TOLERADOS - 1; i++) {
      intentos.anotarFallo(llave, AHORA);
    }

    const despues = AHORA + VENTANA_MS + 1;
    intentos.anotarFallo(llave, despues);

    expect(intentos.bloqueado(llave, despues)).toBe(false);
  });

  it('entrar bien perdona lo anterior', () => {
    for (let i = 0; i < FALLOS_TOLERADOS - 1; i++) {
      intentos.anotarFallo(llave, AHORA);
    }

    intentos.perdonar(llave);
    intentos.anotarFallo(llave, AHORA);

    expect(intentos.bloqueado(llave, AHORA)).toBe(false);
  });

  it('no crece sin techo cuando alguien prueba miles de correos', () => {
    // La poda normal ocurre al mirar una llave, así que la que falla una vez y nunca
    // más se quedaría para siempre. Sin techo, probar contraseñas contra un millón de
    // correos distintos llena la memoria sin que nadie llegue a bloquearse.
    for (let i = 0; i < 20_000; i++) {
      intentos.anotarFallo(`victima-${i}@club.cl|10.0.0.1`, AHORA);
    }

    expect(intentos.cuantasRecuerda()).toBeLessThanOrEqual(10_000);
  });

  it('la poda no suelta a quien está bloqueado ahora mismo', () => {
    // Barrer memoria no puede abrirle la puerta a quien acaba de agotar sus intentos.
    for (let i = 0; i < FALLOS_TOLERADOS; i++) {
      intentos.anotarFallo(llave, AHORA);
    }

    for (let i = 0; i < 9_000; i++) {
      intentos.anotarFallo(`otra-${i}@club.cl|10.0.0.1`, AHORA);
    }

    expect(intentos.bloqueado(llave, AHORA)).toBe(true);
  });

  it('bloquear a una cuenta no bloquea a las demás', () => {
    // La llave junta correo e IP justamente para esto: machacar el correo de alguien
    // no puede dejar afuera al resto del club.
    for (let i = 0; i < FALLOS_TOLERADOS; i++) {
      intentos.anotarFallo(llave, AHORA);
    }

    expect(intentos.bloqueado('otro@club.cl|10.0.0.1', AHORA)).toBe(false);
    expect(intentos.bloqueado('socia@club.cl|10.0.0.9', AHORA)).toBe(false);
  });
});
