import { hoyEnElClub } from './tiempo';

/**
 * La fecha civil del club decide si un socio está al día. Si se calcula en UTC, a
 * partir de las 20:00 o 21:00 de Santiago —según la época del año— el sistema ya
 * cree que es mañana y deja morosos a socios que pagaron hasta hoy.
 */
describe('hoyEnElClub', () => {
  const dia = (iso: string) => hoyEnElClub(new Date(iso)).toISOString();

  it('al mediodía devuelve el día en curso', () => {
    expect(dia('2026-08-17T12:00:00Z')).toBe('2026-08-17T00:00:00.000Z');
  });

  it('a las 22:00 de Santiago todavía es hoy, aunque en UTC ya sea mañana', () => {
    // 2026-08-18T02:00Z son las 22:00 del 17 en Santiago. Este es el caso que
    // rompería a un socio que reserva de noche el día que le vence la cuota.
    expect(dia('2026-08-18T02:00:00Z')).toBe('2026-08-17T00:00:00.000Z');
  });

  it('en verano, con el desfase de tres horas, sigue acertando', () => {
    // En enero Chile está en UTC-3, no en UTC-4: un desfase fijo escrito a mano
    // acierta medio año y falla el otro medio.
    expect(dia('2026-01-15T02:30:00Z')).toBe('2026-01-14T00:00:00.000Z');
  });

  describe('los domingos en que Chile cambia la hora', () => {
    it('el domingo que atrasa el reloj', () => {
      // 5 de abril de 2026: a las 02:00Z todavía es el sábado 4 en Santiago...
      expect(dia('2026-04-05T02:00:00Z')).toBe('2026-04-04T00:00:00.000Z');
      // ...y dos horas y media después ya es domingo 5.
      expect(dia('2026-04-05T04:30:00Z')).toBe('2026-04-05T00:00:00.000Z');
    });

    it('el domingo que adelanta el reloj', () => {
      // 6 de septiembre de 2026: a las 03:30Z son las 23:30 del sábado 5.
      expect(dia('2026-09-06T03:30:00Z')).toBe('2026-09-05T00:00:00.000Z');
    });
  });

  it('devuelve medianoche exacta, para comparar con las columnas DATE', () => {
    const hoy = hoyEnElClub(new Date('2026-08-17T18:45:12.345Z'));

    expect(hoy.getUTCHours()).toBe(0);
    expect(hoy.getUTCMinutes()).toBe(0);
    expect(hoy.getUTCMilliseconds()).toBe(0);
  });
});
