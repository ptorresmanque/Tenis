import { Prisma } from '../generated/prisma/client';
import { esViolacionDeUnicidad } from './errores';

describe('esViolacionDeUnicidad', () => {
  it('reconoce el código P2002 de Prisma', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.9.1',
      },
    );

    expect(esViolacionDeUnicidad(error)).toBe(true);
  });

  it('no confunde otros errores de Prisma con una colisión', () => {
    // P2025 es "registro no encontrado". Si esto diera true, `reservas` le diría
    // al usuario "ese bloque ya está tomado" ante cualquier falla de base.
    const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '7.9.1',
    });

    expect(esViolacionDeUnicidad(error)).toBe(false);
  });

  it('no revienta con valores que no son errores', () => {
    expect(esViolacionDeUnicidad(new Error('caída de red'))).toBe(false);
    expect(esViolacionDeUnicidad(undefined)).toBe(false);
    expect(esViolacionDeUnicidad(null)).toBe(false);
    expect(esViolacionDeUnicidad('P2002')).toBe(false);
  });
});
