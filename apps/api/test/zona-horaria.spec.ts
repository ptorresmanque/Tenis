import { PrismaService } from '../src/prisma/prisma.service';

/**
 * MariaDB guarda DATETIME sin zona horaria y el driver serializa en la zona del
 * proceso. Si el proceso no corre en UTC, la columna guarda hora local: cualquier
 * consulta hecha fuera de la app ve horas corridas, y en el cambio de horario de
 * Chile dos instantes distintos caen en el mismo valor.
 *
 * Estos tests son los que hacen ruido si alguien saca TZ=UTC de los scripts.
 */

// Rango de recursoId propio de este archivo: Jest corre los archivos en paralelo
// y la limpieza de cada uno no debe borrar las filas de otro.
const RECURSO = 20;

describe('Los instantes se guardan en UTC', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.pruebaUnicidad.deleteMany({ where: { recursoId: RECURSO } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.pruebaUnicidad.deleteMany({ where: { recursoId: RECURSO } });
  });

  it('el proceso corre en UTC', () => {
    expect(new Date().getTimezoneOffset()).toBe(0);
  });

  it('la columna guarda el mismo valor que el instante UTC, no la hora local', async () => {
    await prisma.pruebaUnicidad.create({
      data: {
        recursoId: RECURSO,
        inicio: new Date('2026-09-01T18:00:00.000Z'),
      },
    });

    // Se lee como texto crudo a propósito: leerlo con el driver ocultaría el
    // problema, porque deshace su propia conversión al traer el dato.
    const filas = await prisma.$queryRaw<{ texto: string }[]>`
      SELECT CAST(inicio AS CHAR) AS texto
      FROM prueba_unicidad
      WHERE recurso_id = ${RECURSO}
    `;

    expect(filas[0].texto).toBe('2026-09-01 18:00:00.000');
  });

  it('dos instantes que comparten hora local en el cambio de horario no colisionan', async () => {
    // Chile atrasa el reloj el 4 de abril de 2026 a las 24:00, así que las 23:30
    // locales de ese día ocurren dos veces: una en UTC-3 y otra en UTC-4.
    const antesDelCambio = new Date('2026-04-05T02:30:00.000Z');
    const despuesDelCambio = new Date('2026-04-05T03:30:00.000Z');

    await prisma.pruebaUnicidad.create({
      data: { recursoId: RECURSO, inicio: antesDelCambio },
    });
    await prisma.pruebaUnicidad.create({
      data: { recursoId: RECURSO, inicio: despuesDelCambio },
    });

    const guardadas = await prisma.pruebaUnicidad.findMany({
      where: { recursoId: RECURSO },
      orderBy: { inicio: 'asc' },
    });

    expect(guardadas.map((f) => f.inicio.toISOString())).toEqual([
      '2026-04-05T02:30:00.000Z',
      '2026-04-05T03:30:00.000Z',
    ]);
  });
});
