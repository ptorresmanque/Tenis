import { MotivoBloqueo, Superficie } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  CANCHAS,
  EN_MANTENCION,
  sembrarCatalogo,
} from '../prisma/seed-catalogo';

/**
 * T9. El modelo de `SPEC-catalogo-canchas.md` más la fila única de configuración.
 *
 * Los bloques horarios no están acá a propósito: se calculan (T10). Lo que se guarda
 * es de dónde salen — apertura, franjas y bloqueos.
 */
describe('Catálogo de canchas', () => {
  let prisma: PrismaService;

  // Las consultas del seed van filtradas a lo que el seed siembra. Jest corre los
  // archivos en paralelo y T13 va a crear canchas de prueba: contar la tabla entera
  // haría fallar esta suite el día que eso pase, lejos de donde está la causa.
  const canchasDelSeed = { nombre: { in: CANCHAS.map((c) => c.nombre) } };
  const paraTodaCancha = { canchaId: null };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await sembrarCatalogo(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('ConfiguracionClub', () => {
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

  describe('Bloqueo', () => {
    const nombre = 'Cancha de prueba T9';

    beforeEach(async () => {
      await prisma.cancha.deleteMany({ where: { nombre } });
    });

    afterAll(async () => {
      await prisma.cancha.deleteMany({ where: { nombre } });
    });

    const conBloqueo = () =>
      prisma.cancha.create({
        data: {
          nombre,
          superficie: Superficie.CEMENTO,
          bloqueos: {
            create: {
              inicio: new Date('2026-03-10T13:00:00.000Z'),
              fin: new Date('2026-03-10T15:00:00.000Z'),
              motivo: MotivoBloqueo.MANTENCION,
              descripcion: 'Resiembra de la superficie',
            },
          },
        },
        select: { id: true },
      });

    it('guarda un rango de una cancha con su motivo', async () => {
      const cancha = await conBloqueo();

      const bloqueo = await prisma.bloqueo.findFirst({
        where: { canchaId: cancha.id },
      });

      expect(bloqueo).toMatchObject({
        motivo: MotivoBloqueo.MANTENCION,
        inicio: new Date('2026-03-10T13:00:00.000Z'),
        fin: new Date('2026-03-10T15:00:00.000Z'),
      });
    });

    it('se borra junto con su cancha', async () => {
      const cancha = await conBloqueo();

      await prisma.cancha.delete({ where: { id: cancha.id } });

      // Sin el cascade, borrar una cancha deja bloqueos apuntando a una cancha que
      // no existe, y la consulta de disponibilidad de T12 se cae al resolverlos.
      expect(
        await prisma.bloqueo.count({ where: { canchaId: cancha.id } }),
      ).toBe(0);
    });
  });

  describe('seed', () => {
    it('correrlo dos veces no duplica ni falla', async () => {
      const antes = await prisma.cancha.findMany({
        where: canchasDelSeed,
        orderBy: { orden: 'asc' },
      });

      await sembrarCatalogo(prisma);

      // Mismos ids: si borrara y recreara, los bloqueos y franjas que cuelgan de
      // una cancha quedarían apuntando a canchas que ya no existen.
      expect(
        await prisma.cancha.findMany({
          where: canchasDelSeed,
          orderBy: { orden: 'asc' },
        }),
      ).toEqual(antes);

      expect(
        await prisma.horarioApertura.count({ where: paraTodaCancha }),
      ).toBe(7);
    });

    it('deja ocho canchas de cemento iluminadas, cuatro de ellas techadas', async () => {
      const canchas = await prisma.cancha.findMany({ where: canchasDelSeed });

      expect(canchas).toHaveLength(8);
      expect(canchas.every((c) => c.superficie === Superficie.CEMENTO)).toBe(
        true,
      );
      expect(canchas.every((c) => c.iluminacion)).toBe(true);
      expect(canchas.filter((c) => c.techada)).toHaveLength(4);
    });

    it('deja en mantención hasta diciembre a dos de las techadas', async () => {
      const enMantencion = await prisma.cancha.findMany({
        where: { nombre: { in: EN_MANTENCION } },
        include: { bloqueos: true },
      });

      expect(enMantencion).toHaveLength(2);

      for (const cancha of enMantencion) {
        // Techadas y no cualquiera: la demo de un día de lluvia se apoya en que
        // queden dos techadas disponibles, no cero.
        expect(cancha.techada).toBe(true);
        expect(cancha.bloqueos).toHaveLength(1);
        expect(cancha.bloqueos[0]).toMatchObject({
          motivo: MotivoBloqueo.MANTENCION,
          fin: instanteEnElClub('2026-12-01', '00:00'),
        });
      }
    });

    it('deja horario de apertura para los siete días', async () => {
      const horarios = await prisma.horarioApertura.findMany({
        where: paraTodaCancha,
      });

      // Sin horario, un día no tiene bloques y la grilla sale vacía sin explicar
      // por qué. Los siete, para que la demo funcione cualquier día que se abra.
      expect(new Set(horarios.map((h) => h.diaSemana))).toEqual(
        new Set([0, 1, 2, 3, 4, 5, 6]),
      );
    });

    it('deja al menos una franja pico y una valle', async () => {
      const franjas = await prisma.franjaHoraria.findMany({
        where: paraTodaCancha,
      });

      // Las dos: con solo valle no hay nada que muestre el cupo pico del socio, y
      // con solo pico todo el día limita el cupo y la demo no tiene camino feliz.
      expect(franjas.some((f) => f.esPico)).toBe(true);
      expect(franjas.some((f) => !f.esPico)).toBe(true);
    });

    it('cobra más en pico que en valle', async () => {
      const franjas = await prisma.franjaHoraria.findMany({
        where: paraTodaCancha,
      });
      const pico = franjas.filter((f) => f.esPico);
      const valle = franjas.filter((f) => !f.esPico);

      expect(Math.min(...pico.map((f) => f.montoClp))).toBeGreaterThan(
        Math.max(...valle.map((f) => f.montoClp)),
      );
    });

    it('cubre con franjas todo el horario de apertura', async () => {
      const horarios = await prisma.horarioApertura.findMany({
        where: paraTodaCancha,
      });
      const franjas = await prisma.franjaHoraria.findMany({
        where: paraTodaCancha,
      });

      // Un bloque sin franja que lo cubra vale 0 y no es pico (T11). Legal, pero en
      // los datos de demo significa que el club regala una hora de cancha.
      //
      // Las horas son "HH:MM" de ancho fijo, así que se comparan como texto. La
      // cadena tiene que ser continua: un hueco entre dos franjas es tan invisible
      // como que falte la última.
      const enOrden = [...franjas].sort((a, b) =>
        a.horaDesde.localeCompare(b.horaDesde),
      );

      for (const [i, franja] of enOrden.entries()) {
        if (i > 0) {
          expect(franja.horaDesde).toBe(enOrden[i - 1].horaHasta);
        }
      }

      for (const horario of horarios) {
        expect(horario.horaApertura >= enOrden[0].horaDesde).toBe(true);
        expect(
          horario.horaCierre <= enOrden[enOrden.length - 1].horaHasta,
        ).toBe(true);
      }
    });
  });
});
