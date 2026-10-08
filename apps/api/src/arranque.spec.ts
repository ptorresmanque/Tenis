import { asegurarConfiguracionClub } from './arranque';
import { hoyEnElClub } from './comun/tiempo';
import { PrismaClient } from './generated/prisma/client';

describe('asegurarConfiguracionClub', () => {
  it('**el corte de la incorporación es el día del club, no el de la base**', async () => {
    // Las 22:30 del 7 de octubre en Santiago son las 01:30 del 8 en UTC. Si el corte
    // se lo dejaba al DEFAULT CURRENT_TIMESTAMP de la columna, una base en UTC lo
    // ponía en el 8, y el socio dado de alta esa noche —que entra con fecha 7— no
    // debía la incorporación nunca. Así falló el CI de los PR #30 y #31.
    const ahora = new Date('2026-10-08T01:30:00.000Z');
    const upsert = jest.fn();
    const prisma = { configuracionClub: { upsert } } as unknown as PrismaClient;

    await asegurarConfiguracionClub(prisma, ahora);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { id: 1, cobraIncorporacionDesde: hoyEnElClub(ahora) },
        update: {},
      }),
    );
    expect(hoyEnElClub(ahora).toISOString()).toBe('2026-10-07T00:00:00.000Z');
  });
});
