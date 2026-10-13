import { instanteEnElClub } from '../comun/tiempo';
import { parteLimitada, peorInstante, TopeDeLuz } from './tope-de-luz';

/**
 * T203. El barrido del tope de canchas con luz, sin base (`SPEC-reservas.md` § Tope de
 * canchas con luz). Un lunes de agosto de 2037: el club en UTC-4, sin cambio de hora.
 */
const a = (hora: string) => instanteEnElClub('2037-08-17', hora);

const ocupa = (canchaId: number, desde: string, hasta: string) => ({
  canchaId,
  nombre: `Cancha ${canchaId}`,
  inicio: a(desde),
  fin: a(hasta),
});

describe('parteLimitada', () => {
  it('mide solo desde la hora del tope una reserva que la cruza', () => {
    expect(parteLimitada(a('18:30'), a('20:00'), '19:00')).toEqual({
      desde: a('19:00'),
      hasta: a('20:00'),
    });
  });

  it('una reserva que termina justo cuando el tope empieza no se mide', () => {
    expect(parteLimitada(a('17:30'), a('19:00'), '19:00')).toBeNull();
  });

  it('una reserva entera después de la hora se mide entera', () => {
    expect(parteLimitada(a('20:00'), a('21:30'), '19:00')).toEqual({
      desde: a('20:00'),
      hasta: a('21:30'),
    });
  });

  it('la hora es la del reloj del club también el día que cambia el horario', () => {
    // Domingo 4 de abril de 2027: Chile atrasa la hora a la medianoche y pasa a UTC-4.
    // Con el desfase de la víspera (UTC-3), las 19:00 caerían a las 22:00Z y la reserva
    // de 18:30 se mediría entera.
    const inicio = instanteEnElClub('2027-04-04', '18:30');
    const fin = instanteEnElClub('2027-04-04', '19:30');

    expect(parteLimitada(inicio, fin, '19:00')?.desde.toISOString()).toBe(
      '2027-04-04T23:00:00.000Z',
    );
  });
});

describe('peorInstante', () => {
  it('sin nada que ocupe las otras canchas no hay peor instante', () => {
    expect(peorInstante([], a('19:00'), a('20:00'))).toBeNull();
  });

  it('cuenta las canchas ocupadas a la vez y dice cuáles', () => {
    const peor = peorInstante(
      [ocupa(1, '19:00', '20:00'), ocupa(2, '19:30', '21:00')],
      a('19:00'),
      a('20:00'),
    );

    expect(peor).toEqual({
      instante: a('19:30'),
      canchas: [
        { canchaId: 1, nombre: 'Cancha 1' },
        { canchaId: 2, nombre: 'Cancha 2' },
      ],
    });
  });

  it('una cancha cuenta una vez aunque tenga dos cosas seguidas', () => {
    const peor = peorInstante(
      [
        ocupa(1, '19:00', '20:00'),
        ocupa(1, '20:00', '21:00'),
        ocupa(2, '19:30', '20:30'),
      ],
      a('19:00'),
      a('21:00'),
    );

    expect(peor?.canchas.map((c) => c.canchaId)).toEqual([1, 2]);
  });

  it('lo que termina justo cuando empieza el rango no lo ocupa', () => {
    expect(
      peorInstante([ocupa(1, '18:00', '19:00')], a('19:00'), a('20:00')),
    ).toBeNull();
  });

  it('lo que empieza justo cuando termina el rango tampoco', () => {
    expect(
      peorInstante([ocupa(1, '20:00', '21:00')], a('19:00'), a('20:00')),
    ).toBeNull();
  });

  it('un partido que termina a las 21:15 ocupa hasta ese minuto', () => {
    const peor = peorInstante(
      [ocupa(1, '20:00', '21:15'), ocupa(2, '21:00', '22:00')],
      a('21:00'),
      a('22:00'),
    );

    expect(peor).toMatchObject({ instante: a('21:00') });
    expect(peor?.canchas).toHaveLength(2);
  });

  it('dos canchas que no se cruzan nunca están las dos a la vez', () => {
    const peor = peorInstante(
      [ocupa(1, '19:00', '20:00'), ocupa(2, '20:00', '21:00')],
      a('19:00'),
      a('21:00'),
    );

    expect(peor?.canchas).toHaveLength(1);
  });
});

describe('TopeDeLuz', () => {
  const lleno = new TopeDeLuz(
    a('20:00'),
    [
      { canchaId: 1, nombre: 'Cancha 1' },
      { canchaId: 3, nombre: 'Cancha 3' },
    ],
    2,
  );

  it('al público no le nombra las canchas', () => {
    expect(lleno.message).toBe(
      'A esa hora ya están ocupadas todas las canchas con luz que el club puede encender. Elige otra hora.',
    );
  });

  it('al admin le dice la hora, las canchas y el tope', () => {
    expect(lleno.paraElAdmin).toBe(
      'A las 20:00 ya están ocupadas Cancha 1 y Cancha 3, y el tope de canchas con luz es 2.',
    );
  });

  it('con una sola cancha la nombra en singular', () => {
    const uno = new TopeDeLuz(
      a('19:30'),
      [{ canchaId: 1, nombre: 'Basilea' }],
      1,
    );

    expect(uno.paraElAdmin).toBe(
      'A las 19:30 ya está ocupada Basilea, y el tope de canchas con luz es 1.',
    );
  });
});
