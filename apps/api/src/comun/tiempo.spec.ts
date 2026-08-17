import { hoyEnElClub, instanteEnElClub } from './tiempo';

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

/**
 * El camino inverso: el admin configura "abre a las 08:00" y eso hay que volverlo
 * un instante. Es donde vive el bug de marzo — con un desfase fijo, medio año la
 * grilla aparece corrida una hora y nadie entiende por qué.
 */
describe('instanteEnElClub', () => {
  const instante = (fecha: string, hora: string) =>
    instanteEnElClub(fecha, hora).toISOString();

  it('en invierno el club está en UTC-4', () => {
    expect(instante('2026-08-17', '08:00')).toBe('2026-08-17T12:00:00.000Z');
  });

  it('en verano está en UTC-3, con la misma hora de reloj', () => {
    // Las mismas 08:00 del admin, un instante distinto. Un `-04:00` escrito a
    // mano acierta este test o el anterior, nunca los dos.
    expect(instante('2026-01-15', '08:00')).toBe('2026-01-15T11:00:00.000Z');
  });

  it('acepta minutos, no solo horas en punto', () => {
    expect(instante('2026-08-17', '08:30')).toBe('2026-08-17T12:30:00.000Z');
  });

  describe('los domingos en que Chile cambia la hora', () => {
    it('el domingo que atrasa el reloj ya está en UTC-4', () => {
      // El cambio ocurre a las 03:00Z de ese mismo domingo, antes de que el club
      // abra: a las 08:00 del reloj el desfase ya es el de invierno.
      expect(instante('2026-04-05', '08:00')).toBe('2026-04-05T12:00:00.000Z');
      // El día anterior, la misma hora de reloj es un instante distinto.
      expect(instante('2026-04-04', '08:00')).toBe('2026-04-04T11:00:00.000Z');
    });

    it('el domingo que adelanta el reloj ya está en UTC-3', () => {
      expect(instante('2026-09-06', '08:00')).toBe('2026-09-06T11:00:00.000Z');
      expect(instante('2026-09-05', '08:00')).toBe('2026-09-05T12:00:00.000Z');
    });

    it('una hora que no existe se corre lo que salta el reloj', () => {
      // El 6 de septiembre el reloj salta de 00:00 a 01:00: las 00:30 no existen.
      // No es un error que valga la pena propagar —ningún club abre a esa hora—,
      // pero tiene que dar un instante real, y el convencional es el de la misma
      // hora corrida el largo del salto: las 01:30.
      expect(instante('2026-09-06', '00:30')).toBe('2026-09-06T04:30:00.000Z');
    });

    it('la medianoche que el reloj se saltó al atrasar ocurre una sola vez', () => {
      // A las 03:00Z del 5 de abril el reloj iba a marcar 00:00 y se atrasó a las
      // 23:00 del sábado. Así que el domingo empieza recién a las 04:00Z: tomar la
      // "primera vuelta" acá daría un instante en que todavía es sábado.
      expect(instante('2026-04-05', '00:00')).toBe('2026-04-05T04:00:00.000Z');
    });

    it('una hora repetida se resuelve por la primera vuelta del reloj', () => {
      // El 4 de abril las 23:30 ocurren dos veces: en UTC-3 y una hora después en
      // UTC-4. Se toma la primera, que es la que el reloj marca primero.
      expect(instante('2026-04-04', '23:30')).toBe('2026-04-05T02:30:00.000Z');
    });
  });

  it('rechaza una hora que no tiene forma HH:MM', () => {
    // Viene de una columna de texto que el panel escribe. Un "8:00" o un "25:00"
    // convertido en silencio a un instante cualquiera corre la grilla entera.
    expect(() => instanteEnElClub('2026-08-17', '8:00')).toThrow();
    expect(() => instanteEnElClub('2026-08-17', '25:00')).toThrow();
    expect(() => instanteEnElClub('2026-08-17', '08:60')).toThrow();
    expect(() => instanteEnElClub('2026-08-17', '24:30')).toThrow();
  });

  it('rechaza un día que no existe, en vez de correrlo al mes siguiente', () => {
    // `new Date('2026-02-30T00:00:00Z')` no es inválida: se desborda en silencio
    // al 2 de marzo. En T12 la fecha llega por query string, así que alguien
    // pediría la disponibilidad del 30 de febrero y recibiría la del 2 de marzo.
    expect(() => instanteEnElClub('2026-02-30', '08:00')).toThrow();
    expect(() => instanteEnElClub('2026-13-01', '08:00')).toThrow();
    expect(() => instanteEnElClub('17-08-2026', '08:00')).toThrow();
    expect(() => instanteEnElClub('2026-8-17', '08:00')).toThrow();

    // Y el 29 de febrero de un año bisiesto sí existe. En verano, por eso 11:00Z.
    expect(instante('2028-02-29', '08:00')).toBe('2028-02-29T11:00:00.000Z');
  });
});
