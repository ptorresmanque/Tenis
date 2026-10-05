import { BadRequestException } from '@nestjs/common';

import { destinoDeCuerpo } from './reservas.dto';

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
