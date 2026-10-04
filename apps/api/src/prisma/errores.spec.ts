import { Prisma } from '../generated/prisma/client';
import { esViolacionDeUnicidad, reintentarSiHayDeadlock } from './errores';

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

describe('reintentarSiHayDeadlock', () => {
  // T76. El único `WITHOUT OVERLAPS` de `reserva` revisa el cruce con una lectura
  // que bloquea un tramo del índice, y dos escrituras simultáneas pueden quedar
  // esperándose: MariaDB aborta a una y Prisma la entrega como P2034. Bajo carga pasó
  // en un tercio de los intentos; el mensaje de Prisma pide reintentar.
  const deadlock = () =>
    new Prisma.PrismaClientKnownRequestError(
      'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
      { code: 'P2034', clientVersion: '7.9.1' },
    );

  it('reintenta ante un deadlock y devuelve lo que dé el intento que pasa', async () => {
    let intentos = 0;

    const resultado = await reintentarSiHayDeadlock(() => {
      intentos += 1;
      return intentos < 3
        ? Promise.reject(deadlock())
        : Promise.resolve('reservada');
    });

    expect(resultado).toBe('reservada');
    expect(intentos).toBe(3);
  });

  it('no reintenta otros errores: un 1062 es una respuesta, no un accidente', async () => {
    let intentos = 0;
    const duplicado = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: '7.9.1',
    });

    await expect(
      reintentarSiHayDeadlock(() => {
        intentos += 1;
        return Promise.reject(duplicado);
      }),
    ).rejects.toBe(duplicado);
    expect(intentos).toBe(1);
  });

  it('se rinde después de cinco intentos y deja pasar el último error', async () => {
    let intentos = 0;
    const ultimo = deadlock();

    await expect(
      reintentarSiHayDeadlock(() => {
        intentos += 1;
        return Promise.reject(intentos === 5 ? ultimo : deadlock());
      }),
    ).rejects.toBe(ultimo);
    expect(intentos).toBe(5);
  });
});
