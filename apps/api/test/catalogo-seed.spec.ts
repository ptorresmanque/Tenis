import { PrismaService } from '../src/prisma/prisma.service';
import { sembrarCatalogo } from '../prisma/seed-catalogo';

/**
 * T9. El modelo de `SPEC-catalogo-canchas.md` más la fila única de configuración.
 *
 * Los bloques horarios no están acá a propósito: se calculan (T10). Lo que se guarda
 * es de dónde salen — apertura, franjas y bloqueos.
 */
describe('Catálogo de canchas', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('ConfiguracionClub', () => {
    beforeAll(async () => {
      await sembrarCatalogo(prisma);
    });

    it('deja exactamente una fila', async () => {
      expect(await prisma.configuracionClub.count()).toBe(1);
    });

    it('la base rechaza una segunda fila con otro id', async () => {
      // El CHECK y no una regla de la aplicación: cualquiera con un cliente de SQL
      // puede insertar una segunda fila, y a partir de ahí "la configuración del
      // club" depende de qué fila lea cada consulta.
      const error = await prisma.configuracionClub
        .create({ data: { id: 2 } })
        .then(() => null)
        .catch((e: unknown) => e);

      expect(error).not.toBeNull();
      expect(await prisma.configuracionClub.count()).toBe(1);
    });

    it('la base rechaza una segunda fila con el mismo id', async () => {
      const error = await prisma.configuracionClub
        .create({ data: { id: 1 } })
        .then(() => null)
        .catch((e: unknown) => e);

      expect(error).not.toBeNull();
      expect(await prisma.configuracionClub.count()).toBe(1);
    });

    it('trae los valores por defecto de SPEC.md § Configuración', async () => {
      const config = await prisma.configuracionClub.findFirst();

      // `duracionBloqueMin` es la que convierte la grilla en 14 bloques o en 9:
      // si el default cambia sin querer, T10 falla lejos de acá.
      expect(config).toMatchObject({
        duracionBloqueMin: 60,
        cupoDiarioSocioHoras: 1,
        cupoPicoSemanalHoras: 2,
        invitadosPorMes: 4,
        horasMinModificacion: 6,
        horasReembolsoTotal: 24,
      });
    });
  });

  describe('seed', () => {
    beforeAll(async () => {
      await sembrarCatalogo(prisma);
    });

    it('correrlo dos veces no duplica ni falla', async () => {
      const antes = await prisma.cancha.findMany({ orderBy: { orden: 'asc' } });

      await sembrarCatalogo(prisma);

      // Mismos ids: si borrara y recreara, los bloqueos y franjas que cuelgan de
      // una cancha quedarían apuntando a canchas que ya no existen.
      expect(
        await prisma.cancha.findMany({ orderBy: { orden: 'asc' } }),
      ).toEqual(antes);
    });

    it('deja tres canchas de superficies distintas', async () => {
      const canchas = await prisma.cancha.findMany();

      expect(canchas).toHaveLength(3);
      expect(new Set(canchas.map((c) => c.superficie)).size).toBe(3);
    });

    it('deja horario de apertura para los siete días', async () => {
      const horarios = await prisma.horarioApertura.findMany();

      // Sin horario, un día no tiene bloques y la grilla sale vacía sin explicar
      // por qué. Los siete, para que la demo funcione cualquier día que se abra.
      expect(new Set(horarios.map((h) => h.diaSemana))).toEqual(
        new Set([0, 1, 2, 3, 4, 5, 6]),
      );
    });

    it('deja al menos una franja pico y una valle', async () => {
      const franjas = await prisma.franjaHoraria.findMany();

      // Las dos: con solo valle no hay nada que muestre el cupo pico del socio, y
      // con solo pico todo el día limita el cupo y la demo no tiene camino feliz.
      expect(franjas.some((f) => f.esPico)).toBe(true);
      expect(franjas.some((f) => !f.esPico)).toBe(true);
    });

    it('cobra más en pico que en valle', async () => {
      const franjas = await prisma.franjaHoraria.findMany();
      const pico = franjas.filter((f) => f.esPico);
      const valle = franjas.filter((f) => !f.esPico);

      expect(Math.min(...pico.map((f) => f.montoClp))).toBeGreaterThan(
        Math.max(...valle.map((f) => f.montoClp)),
      );
    });
  });
});
