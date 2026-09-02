import {
  chocaConAlguna,
  enPalabras,
  leerFranja,
  leerFranjas,
} from './restricciones';

/**
 * T65. Cuándo **no** puede jugar un inscrito.
 *
 * Es lo que T67 consulta para no programarle un partido a una hora imposible, así que
 * un error acá se paga con un walkover que el club no vio venir.
 */
describe('leerFranja', () => {
  const martesDeTarde = {
    diaSemana: 2,
    horaDesde: '18:00',
    horaHasta: '21:00',
  };

  it('acepta de lunes a viernes', () => {
    for (const diaSemana of [1, 2, 3, 4, 5]) {
      expect(leerFranja({ ...martesDeTarde, diaSemana }).diaSemana).toBe(
        diaSemana,
      );
    }
  });

  it('**rechaza el sábado y el domingo**', () => {
    // El torneo se juega el fin de semana: permitir bloquearlo es permitir inscribirse
    // a un torneo que uno no puede jugar, y el club se enteraría con la inscripción ya
    // cerrada.
    for (const diaSemana of [0, 6]) {
      expect(() => leerFranja({ ...martesDeTarde, diaSemana })).toThrow();
    }
  });

  it('rechaza un día que ni siquiera es un día', () => {
    for (const diaSemana of [-1, 7, 2.5, 'martes', null, undefined]) {
      expect(() => leerFranja({ ...martesDeTarde, diaSemana })).toThrow();
    }
  });

  it('**rechaza una franja que termina antes de empezar**', () => {
    expect(() =>
      leerFranja({ diaSemana: 2, horaDesde: '21:00', horaHasta: '18:00' }),
    ).toThrow();
  });

  it('rechaza una franja de largo cero, que no bloquea nada', () => {
    expect(() =>
      leerFranja({ diaSemana: 2, horaDesde: '18:00', horaHasta: '18:00' }),
    ).toThrow();
  });

  it('rechaza horas que no son horas', () => {
    for (const horaDesde of ['25:00', '18:60', '8:00', '1800', '', null, 18]) {
      expect(() => leerFranja({ ...martesDeTarde, horaDesde })).toThrow();
    }
  });
});

describe('leerFranjas', () => {
  const una = { diaSemana: 3, horaDesde: '09:00', horaHasta: '12:00' };

  it('ninguna franja es una respuesta válida: no todos tienen restricciones', () => {
    expect(leerFranjas(undefined)).toEqual([]);
    expect(leerFranjas(null)).toEqual([]);
    expect(leerFranjas([])).toEqual([]);
  });

  it('**acepta franjas superpuestas sin protestar**', () => {
    // Dos que se pisan responden lo mismo que una fusionada, así que validarlo sería
    // código que no cambia ninguna respuesta.
    const pisadas = [
      { diaSemana: 2, horaDesde: '18:00', horaHasta: '21:00' },
      { diaSemana: 2, horaDesde: '20:00', horaHasta: '23:00' },
    ];

    expect(leerFranjas(pisadas)).toHaveLength(2);
  });

  it('rechaza lo que no es una lista', () => {
    expect(() => leerFranjas({ diaSemana: 2 })).toThrow();
    expect(() => leerFranjas('lunes')).toThrow();
  });

  it('**pone un tope**: es un cuerpo sin autenticar', () => {
    expect(() => leerFranjas(Array.from({ length: 26 }, () => una))).toThrow();
  });

  it('una franja mala hace fallar la lista entera', () => {
    expect(() => leerFranjas([una, { ...una, diaSemana: 6 }])).toThrow();
  });
});

describe('chocaConAlguna', () => {
  const martesDeTarde = [
    { diaSemana: 2, horaDesde: '18:00', horaHasta: '21:00' },
  ];

  it('**basta con que se solapen, no hace falta que lo contenga**', () => {
    // Un partido de 20:00 a 22:00 contra "no puedo de 21:00 a 23:00" es un partido que
    // esa persona no va a terminar: programarlo es programar un walkover.
    const partido = { diaSemana: 2, horaDesde: '20:00', horaHasta: '22:00' };

    expect(chocaConAlguna(martesDeTarde, partido)).not.toBeNull();
  });

  it('un partido dentro de la franja choca', () => {
    expect(
      chocaConAlguna(martesDeTarde, {
        diaSemana: 2,
        horaDesde: '19:00',
        horaHasta: '20:00',
      }),
    ).not.toBeNull();
  });

  it('otro día no choca, aunque sea la misma hora', () => {
    expect(
      chocaConAlguna(martesDeTarde, {
        diaSemana: 3,
        horaDesde: '19:00',
        horaHasta: '20:00',
      }),
    ).toBeNull();
  });

  it('**los extremos son abiertos**: quien no puede hasta las 21:00 juega a las 21:00', () => {
    // Si no, dos franjas contiguas dejarían un hueco imposible de expresar.
    expect(
      chocaConAlguna(martesDeTarde, {
        diaSemana: 2,
        horaDesde: '21:00',
        horaHasta: '22:00',
      }),
    ).toBeNull();

    expect(
      chocaConAlguna(martesDeTarde, {
        diaSemana: 2,
        horaDesde: '16:00',
        horaHasta: '18:00',
      }),
    ).toBeNull();
  });

  it('sin restricciones nunca choca', () => {
    expect(
      chocaConAlguna([], {
        diaSemana: 2,
        horaDesde: '19:00',
        horaHasta: '20:00',
      }),
    ).toBeNull();
  });

  it('devuelve **cuál** franja chocó, para poder nombrarla en el error', () => {
    const cual = chocaConAlguna(martesDeTarde, {
      diaSemana: 2,
      horaDesde: '19:00',
      horaHasta: '20:00',
    });

    expect(enPalabras(cual!)).toBe('los martes de 18:00 a 21:00');
  });
});
