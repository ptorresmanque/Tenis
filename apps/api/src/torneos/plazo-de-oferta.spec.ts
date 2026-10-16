import { vencimientoDeLaOferta } from './plazo-de-oferta';

/**
 * T325 (SPEC-torneos.md § Lista de espera sin cobro, E1, E3 y E7). Hasta cuándo se le guarda el
 * cupo a quien recibe la oferta: el plazo corre solo de 8:00 a 22:00 en el reloj del club, y
 * nunca pasa del fin del último día de inscripción.
 *
 * Octubre de 2026 en Santiago es UTC-3. El cambio de hora de abril de 2027 (la noche del sábado 3
 * al domingo 4 el reloj vuelve de 24:00 a 23:00) pasa a UTC-4.
 */
describe('vencimientoDeLaOferta', () => {
  /** Un instante leído en el reloj del club de octubre de 2026 (UTC-3). */
  const enOctubre = (fecha: string, hora: string) =>
    new Date(`${fecha}T${hora}:00-03:00`);
  const CIERRE_LEJANO = new Date('2026-10-30T00:00:00.000Z');

  it('**de día corre de corrido**: una oferta de las 10:00 vence a las 10:30', () => {
    expect(
      vencimientoDeLaOferta(
        enOctubre('2026-10-16', '10:00'),
        30,
        CIERRE_LEJANO,
      ),
    ).toEqual(enOctubre('2026-10-16', '10:30'));
  });

  it('**de noche no corre**: una de las 23:00 vence a las 8:30 del día siguiente (LE11)', () => {
    expect(
      vencimientoDeLaOferta(
        enOctubre('2026-10-16', '23:00'),
        30,
        CIERRE_LEJANO,
      ),
    ).toEqual(enOctubre('2026-10-17', '08:30'));
  });

  it('**una de las 21:50 corre 10 minutos hasta las 22:00 y 20 desde las 8:00** (LE11)', () => {
    expect(
      vencimientoDeLaOferta(
        enOctubre('2026-10-16', '21:50'),
        30,
        CIERRE_LEJANO,
      ),
    ).toEqual(enOctubre('2026-10-17', '08:20'));
  });

  it('una de la madrugada empieza a correr a las 8:00', () => {
    expect(
      vencimientoDeLaOferta(
        enOctubre('2026-10-16', '03:15'),
        30,
        CIERRE_LEJANO,
      ),
    ).toEqual(enOctubre('2026-10-16', '08:30'));
  });

  it('justo hasta las 22:00, todavía ese día', () => {
    expect(
      vencimientoDeLaOferta(
        enOctubre('2026-10-16', '21:30'),
        30,
        CIERRE_LEJANO,
      ),
    ).toEqual(enOctubre('2026-10-16', '22:00'));
  });

  it('un plazo largo cuenta solo las horas de día: 24 horas desde las 10:00 terminan a las 20:00 del día siguiente', () => {
    // 720 minutos el primer día (10:00 a 22:00) y los otros 720 desde las 8:00 del siguiente.
    expect(
      vencimientoDeLaOferta(
        enOctubre('2026-10-16', '10:00'),
        1440,
        CIERRE_LEJANO,
      ),
    ).toEqual(enOctubre('2026-10-17', '20:00'));
  });

  it('**nunca pasa del fin del último día de inscripción** (E3)', () => {
    // El cierre es el 16: la oferta de las 23:00 empezaría a correr el 17, pero se corta a las
    // 24:00 del 16, que es hasta cuando la API acepta inscripciones.
    expect(
      vencimientoDeLaOferta(
        enOctubre('2026-10-16', '23:00'),
        30,
        new Date('2026-10-16T00:00:00.000Z'),
      ),
    ).toEqual(enOctubre('2026-10-17', '00:00'));
  });

  it('**el domingo del cambio de hora** cuenta en el reloj del club: vence a las 8:20 de ese reloj', () => {
    // Sábado 3 de abril de 2027 a las 21:50 (UTC-3): 10 minutos hasta las 22:00. El domingo 4 ya
    // es UTC-4, así que las 8:20 del club son las 12:20Z.
    expect(
      vencimientoDeLaOferta(
        new Date('2027-04-03T21:50:00-03:00'),
        30,
        new Date('2027-04-30T00:00:00.000Z'),
      ),
    ).toEqual(new Date('2027-04-04T12:20:00.000Z'));
  });
});
