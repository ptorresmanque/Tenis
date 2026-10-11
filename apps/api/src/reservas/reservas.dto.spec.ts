import { BadRequestException } from '@nestjs/common';

import { destinoDeCuerpo, reservaDeSocioDeCuerpo } from './reservas.dto';

describe('destinoDeCuerpo (T87)', () => {
  const base = { canchaId: 3, inicio: '2037-08-17T14:00:00.000Z' };

  it('sin duración, o nula, no la inventa: mover conserva la que la reserva ya tiene', () => {
    expect(destinoDeCuerpo(base).duracionMin).toBeUndefined();
    expect(
      destinoDeCuerpo({ ...base, duracionMin: null }).duracionMin,
    ).toBeUndefined();
  });

  it('lee 60 o 90', () => {
    expect(destinoDeCuerpo({ ...base, duracionMin: 90 }).duracionMin).toBe(90);
    expect(destinoDeCuerpo({ ...base, duracionMin: '60' }).duracionMin).toBe(
      60,
    );
  });

  it('cualquier otra es 400', () => {
    expect(() => destinoDeCuerpo({ ...base, duracionMin: 45 })).toThrow(
      BadRequestException,
    );
    expect(() => destinoDeCuerpo({ ...base, duracionMin: '90abc' })).toThrow(
      BadRequestException,
    );
  });
});

/** T105. Con quién se juega: de 1 a 3 personas. El mínimo lo pide el cupo (`SIN_ACOMPANANTE`). */
describe('reservaDeSocioDeCuerpo: con quién juega (T105)', () => {
  const base = { canchaId: 3, inicio: '2037-08-17T14:00:00.000Z' };
  const nombres = (cuantos: number) =>
    Array.from({ length: cuantos }, (_, i) => ({
      nombre: `Invitado ${i + 1}`,
    }));

  it('acepta hasta tres: un dobles con tres invitados', () => {
    expect(
      reservaDeSocioDeCuerpo({ ...base, acompanantes: nombres(3) })
        .acompanantes,
    ).toHaveLength(3);
  });

  it('**cuatro responden 400**: en una cancha juegan cuatro, y el titular es uno', () => {
    expect(() =>
      reservaDeSocioDeCuerpo({ ...base, acompanantes: nombres(4) }),
    ).toThrow('Puedes declarar hasta 3 personas.');
  });
});
