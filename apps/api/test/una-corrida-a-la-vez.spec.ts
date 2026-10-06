import { PrismaService } from '../src/prisma/prisma.service';

/**
 * La suite corre con tenis_test tomada: una segunda corrida se detiene al empezar en
 * vez de borrarle los datos a esta. El candado lo toma `scripts/preparar-bd-test.mjs`
 * y lo suelta `scripts/soltar-bd-test.mjs`; acá se mira que esté puesto.
 */
describe('Una corrida de los tests a la vez', () => {
  it('tenis_test está tomada mientras corre la suite', async () => {
    const prisma = new PrismaService();

    try {
      const [{ quienLoTiene }] = await prisma.$queryRaw<
        { quienLoTiene: bigint | null }[]
      >`SELECT IS_USED_LOCK('tenis_test') AS quienLoTiene`;

      expect(quienLoTiene).not.toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });
});
