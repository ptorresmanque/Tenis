import { esViolacionDeUnicidad } from '../src/prisma/errores';
import { PrismaService } from '../src/prisma/prisma.service';
import { DOMINIO_SEED, sembrar } from '../prisma/seed';

/**
 * T4. El seed de demo es lo que hace posible mostrar el sistema sin cargar datos a
 * mano, y se corre muchas veces mientras se desarrolla: si duplicara o reventara en
 * la segunda corrida, habría que borrar la base entera cada vez.
 *
 * Los índices únicos se prueban acá y no en el spike porque son los que sostienen la
 * vinculación de cuentas de T7: sin `email` único, dos filas para la misma persona.
 */
describe('Seed de identidad', () => {
  let prisma: PrismaService;

  // Este archivo trabaja sobre las cuentas del seed, reconocibles por su dominio.
  // Jest corre los archivos en paralelo: contar `usuario` entero haría fallar la
  // suite en cuanto otro test cree un usuario suyo.
  const cuentasDelSeed = { email: { endsWith: DOMINIO_SEED } };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    // El seed nunca borra: hace upsert. Sin limpiar antes, una ficha que el seed
    // dejó de crear sigue en la base de una corrida anterior y estos tests la
    // encuentran igual — pasarían describiendo un seed que ya no existe.
    await prisma.usuario.deleteMany({ where: cuentasDelSeed });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('deja las cinco cuentas de demo', async () => {
    await sembrar(prisma);

    expect(await prisma.usuario.count({ where: cuentasDelSeed })).toBe(5);
  });

  it('correrlo dos veces no duplica ni falla', async () => {
    await sembrar(prisma);
    const primera = await prisma.usuario.findMany({
      where: cuentasDelSeed,
      orderBy: { email: 'asc' },
      select: { id: true, email: true },
    });

    await sembrar(prisma);
    const segunda = await prisma.usuario.findMany({
      where: cuentasDelSeed,
      orderBy: { email: 'asc' },
      select: { id: true, email: true },
    });

    // Mismos ids, no solo misma cantidad: borrar y recrear también daría 5, pero
    // dejaría huérfano cualquier dato que otro módulo hubiera colgado del usuario.
    expect(segunda).toEqual(primera);
    expect(
      await prisma.socio.count({ where: { usuario: cuentasDelSeed } }),
    ).toBe(3);
    expect(
      await prisma.profesor.count({ where: { usuario: cuentasDelSeed } }),
    ).toBe(2);
  });

  it('deja un usuario que es socio y profesor a la vez', async () => {
    await sembrar(prisma);

    const usuario = await prisma.usuario.findFirst({
      where: {
        ...cuentasDelSeed,
        socio: { isNot: null },
        profesor: { isNot: null },
      },
    });

    // Sobre el usuario y no sobre sus fichas: si no hubiera ninguno, `usuario`
    // sería null y `usuario?.socio` daría undefined, que tampoco es null. El
    // test pasaría sin que exista la cuenta que dice estar probando.
    expect(usuario).not.toBeNull();
  });

  it('deja un socio al día y otro moroso', async () => {
    await sembrar(prisma);

    const socios = await prisma.socio.findMany({
      where: { usuario: cuentasDelSeed },
    });
    const hoy = new Date();

    // `reservas` decide con esta fecha si alguien puede reservar. Sin los dos casos
    // en la base, la demo solo puede mostrar el camino feliz.
    expect(socios.some((s) => s.alDiaHasta >= hoy)).toBe(true);
    expect(socios.some((s) => s.alDiaHasta < hoy)).toBe(true);
  });

  it('marca como admin exactamente a una cuenta', async () => {
    await sembrar(prisma);

    expect(
      await prisma.usuario.count({
        where: { ...cuentasDelSeed, esAdmin: true },
      }),
    ).toBe(1);
  });

  describe('índices únicos', () => {
    const email = 'duplicado.t4@ejemplo.test';
    const otroEmail = 'duplicado.t4.otro@ejemplo.test';

    beforeEach(async () => {
      await prisma.usuario.deleteMany({
        where: { email: { in: [email, otroEmail] } },
      });
    });

    it('rechaza un segundo usuario con el mismo email', async () => {
      await prisma.usuario.create({
        data: { email, nombre: 'Primera', apellido: 'Cuenta' },
      });

      const error = await prisma.usuario
        .create({ data: { email, nombre: 'Segunda', apellido: 'Cuenta' } })
        .then(() => null)
        .catch((e: unknown) => e);

      expect(esViolacionDeUnicidad(error)).toBe(true);
    });

    it('rechaza dos socios con el mismo número de socio', async () => {
      const ficha = {
        numeroSocio: 'T4-DUP',
        fechaIngreso: new Date('2026-01-01T00:00:00.000Z'),
        alDiaHasta: new Date('2026-12-31T00:00:00.000Z'),
      };

      await prisma.usuario.create({
        data: {
          email,
          nombre: 'Primera',
          apellido: 'Cuenta',
          socio: { create: ficha },
        },
      });

      // Persona distinta: si reusara el mismo usuario, el rechazo podría venir del
      // único sobre `usuario_id` y el test pasaría sin probar nada.
      const error = await prisma.usuario
        .create({
          data: {
            email: otroEmail,
            nombre: 'Segunda',
            apellido: 'Cuenta',
            socio: { create: ficha },
          },
        })
        .then(() => null)
        .catch((e: unknown) => e);

      expect(esViolacionDeUnicidad(error)).toBe(true);
    });
  });
});
