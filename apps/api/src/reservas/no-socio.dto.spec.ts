import { reservaDeNoSocioDeCuerpo } from './no-socio.dto';

/**
 * T105. Con quién juega el visitante: solo nombres escritos. No elige socios de una
 * lista, porque mostrarle el padrón a alguien sin cuenta sería exponer datos de los
 * socios (decisión del club, 2026-10-08).
 */
describe('reservaDeNoSocioDeCuerpo: con quién juega (T105)', () => {
  const base = {
    canchaId: 3,
    inicio: '2037-08-17T14:00:00.000Z',
    nombre: 'Camila Visitante',
    email: 'camila@ejemplo.cl',
    telefono: '+56955556666',
  };

  it('guarda los nombres que escribió, sin espacios de más', () => {
    expect(
      reservaDeNoSocioDeCuerpo({
        ...base,
        acompanantes: [{ nombre: '  Ana Pérez ' }, { nombre: 'Beto' }],
      }).acompanantes,
    ).toEqual([{ nombre: 'Ana Pérez' }, { nombre: 'Beto' }]);
  });

  it('cuatro responden 400', () => {
    const cuatro = ['Ana', 'Beto', 'Carla', 'Dani'].map((nombre) => ({
      nombre,
    }));

    expect(() =>
      reservaDeNoSocioDeCuerpo({ ...base, acompanantes: cuatro }),
    ).toThrow('Puedes declarar hasta 3 personas.');
  });

  it('un nombre en blanco responde 400', () => {
    expect(() =>
      reservaDeNoSocioDeCuerpo({ ...base, acompanantes: [{ nombre: '   ' }] }),
    ).toThrow('Escribe el nombre de cada persona con la que vas a jugar.');
  });

  it('no puede declarar a un socio por su número: solo nombres', () => {
    expect(() =>
      reservaDeNoSocioDeCuerpo({ ...base, acompanantes: [{ socioId: 5 }] }),
    ).toThrow('Escribe el nombre de cada persona con la que vas a jugar.');
  });

  it('por ahora puede no declarar a nadie: el mínimo llega en T107, con el formulario', () => {
    // Exigirlo antes rompería la reserva del visitante en QA hasta que la pantalla lo pida.
    expect(reservaDeNoSocioDeCuerpo(base).acompanantes).toEqual([]);
  });
});
