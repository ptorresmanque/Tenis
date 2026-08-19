import { EstadoReserva, Superficie } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * MariaDB guarda DATETIME sin zona horaria y el driver serializa en la zona del
 * proceso. Si el proceso no corre en UTC, la columna guarda hora local: cualquier
 * consulta hecha fuera de la app ve horas corridas, y en el cambio de horario de
 * Chile dos instantes distintos caen en el mismo valor.
 *
 * Estos tests son los que hacen ruido si alguien saca TZ=UTC de los scripts. Corrían
 * sobre la tabla del spike de T2; desde T21 corren sobre `reserva`, que es donde los
 * instantes importan de verdad.
 */
const NOMBRE_CANCHA = 'Cancha zona horaria';

describe('Los instantes se guardan en UTC', () => {
  let prisma: PrismaService;
  let canchaId: number;

  const unaReserva = (inicio: Date) => ({
    folio: `TZ${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    canchaId,
    inicio,
    fin: new Date(inicio.getTime() + 60 * 60 * 1000),
    estado: EstadoReserva.CONFIRMADA,
    nombre: 'Instante de prueba',
    email: 'instante@ejemplo.cl',
    telefono: '+56900000000',
  });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({ where: { nombre: NOMBRE_CANCHA } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Borrar la cancha se lleva sus reservas en cascada.
    await prisma.cancha.deleteMany({ where: { nombre: NOMBRE_CANCHA } });
    const cancha = await prisma.cancha.create({
      data: { nombre: NOMBRE_CANCHA, superficie: Superficie.CEMENTO },
      select: { id: true },
    });
    canchaId = cancha.id;
  });

  it('el proceso corre en UTC', () => {
    expect(new Date().getTimezoneOffset()).toBe(0);
  });

  it('la columna guarda el mismo valor que el instante UTC, no la hora local', async () => {
    await prisma.reserva.create({
      data: unaReserva(new Date('2026-09-01T18:00:00.000Z')),
    });

    // Se lee como texto crudo a propósito: leerlo con el driver ocultaría el
    // problema, porque deshace su propia conversión al traer el dato.
    const filas = await prisma.$queryRaw<{ texto: string }[]>`
      SELECT CAST(inicio AS CHAR) AS texto
      FROM reserva
      WHERE cancha_id = ${canchaId}
    `;

    expect(filas[0].texto).toBe('2026-09-01 18:00:00.000');
  });

  it('dos instantes que comparten hora local en el cambio de horario no colisionan', async () => {
    // Chile atrasa el reloj el 4 de abril de 2026 a las 24:00, así que las 23:30
    // locales de ese día ocurren dos veces: una en UTC-3 y otra en UTC-4.
    const antesDelCambio = new Date('2026-04-05T02:30:00.000Z');
    const despuesDelCambio = new Date('2026-04-05T03:30:00.000Z');

    await prisma.reserva.create({ data: unaReserva(antesDelCambio) });
    await prisma.reserva.create({ data: unaReserva(despuesDelCambio) });

    const guardadas = await prisma.reserva.findMany({
      where: { canchaId },
      orderBy: { inicio: 'asc' },
    });

    // Y son dos filas, no una: con la hora guardada en local, el índice único del
    // bloque las vería como la misma y la segunda reserva fallaría — que es el bug
    // de marzo apareciendo por el peor lado posible.
    expect(guardadas.map((f) => f.inicio.toISOString())).toEqual([
      '2026-04-05T02:30:00.000Z',
      '2026-04-05T03:30:00.000Z',
    ]);
  });
});
