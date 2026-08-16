import { PrismaService } from '../src/prisma/prisma.service';
import { esViolacionDeUnicidad } from '../src/prisma/errores';

/**
 * Spike de T2. Prueba contra MariaDB real el mecanismo del que depende toda la
 * integridad de `reservas`: un constraint único más una transacción tienen que
 * dejar pasar exactamente una de dos inserciones simultáneas.
 *
 * Si este archivo falla, no sirve seguir construyendo `reservas` sobre esta base.
 */

/** Libera a los participantes recién cuando todos llegaron. */
function crearBarrera(participantes: number): () => Promise<void> {
  let llegaron = 0;
  let abrir!: () => void;
  const puerta = new Promise<void>((resolve) => {
    abrir = resolve;
  });

  return () => {
    llegaron += 1;
    if (llegaron >= participantes) {
      abrir();
    }
    return puerta;
  };
}

describe('Unicidad bajo concurrencia en MariaDB', () => {
  let prisma: PrismaService;

  const recursoId = 1;
  const inicio = new Date('2026-09-01T18:00:00.000Z');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.pruebaUnicidad.deleteMany();
  });

  it('deja pasar una sola de dos inserciones simultáneas del mismo par', async () => {
    const resultados = await Promise.allSettled([
      prisma.pruebaUnicidad.create({ data: { recursoId, inicio } }),
      prisma.pruebaUnicidad.create({ data: { recursoId, inicio } }),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await prisma.pruebaUnicidad.count()).toBe(1);
  });

  it('el rechazo se reconoce como violación de unicidad, no como un error genérico', async () => {
    await prisma.pruebaUnicidad.create({ data: { recursoId, inicio } });

    const error = await prisma.pruebaUnicidad
      .create({ data: { recursoId, inicio } })
      .then(() => null)
      .catch((e: unknown) => e);

    // Sin poder distinguir este error de una caída de red, `reservas` no puede
    // decirle al usuario "ese bloque lo tomaron recién" en vez de "error interno".
    expect(esViolacionDeUnicidad(error)).toBe(true);
  });

  it('dos transacciones que leen antes de escribir siguen dejando una sola fila', async () => {
    const barrera = crearBarrera(2);

    // La carrera real: los dos consultan disponibilidad, los dos la ven libre,
    // y recién entonces los dos insertan. Chequear antes de insertar no alcanza.
    const intentar = () =>
      prisma.$transaction(async (tx) => {
        const existente = await tx.pruebaUnicidad.findUnique({
          where: { recursoId_inicio: { recursoId, inicio } },
        });

        await barrera();

        if (existente) {
          throw new Error('visto como ocupado');
        }

        return tx.pruebaUnicidad.create({ data: { recursoId, inicio } });
      });

    const resultados = await Promise.allSettled([intentar(), intentar()]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.pruebaUnicidad.count()).toBe(1);

    const rechazo = resultados.find((r) => r.status === 'rejected');
    expect(esViolacionDeUnicidad(rechazo?.reason)).toBe(true);
  });
});
