import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T75. La prueba de `WITHOUT OVERLAPS` antes de construir nada encima.
 *
 * Con reservas de 60 y 90 minutos que empiezan cada media hora, el único sobre
 * `(cancha_id, inicio_activo)` deja pasar 08:00–09:30 contra 09:00–10:00. La spec
 * (`SPEC-reservas.md` § Por rango) propone el período de MariaDB con un único que
 * prohíbe que se crucen, conservando el truco del `NULL` para las canceladas. La
 * documentación confirma `WITHOUT OVERLAPS`; lo que no dice, y esto prueba, es si
 * acepta una columna generada nula en la clave y cómo se comporta bajo carrera.
 *
 * Es el T2 de esta parte: una tabla propia en `tenis_test` y no `reserva`, que
 * cambia recién en T76. No es `TEMPORARY` porque Prisma reparte las consultas en un
 * pool, y una tabla temporal solo existe en la conexión que la creó.
 */

const TABLA = 'spike_t75_sin_cruce';

/** La tabla como es hoy `reserva`, en lo que importa: sin período ni único. */
const CREAR_COMO_HOY = `
  CREATE TABLE ${TABLA} (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cancha_id INT NOT NULL,
    inicio DATETIME(3) NOT NULL,
    fin DATETIME(3) NOT NULL,
    estado ENUM('PENDIENTE_PAGO','CONFIRMADA','CANCELADA','EXPIRADA') NOT NULL
  )`;

/** La migración de la spec, en su orden y con los datos ya adentro. */
const MIGRACION = [
  `ALTER TABLE ${TABLA} ADD COLUMN cancha_activa INT
     AS (IF(estado IN ('PENDIENTE_PAGO','CONFIRMADA'), cancha_id, NULL)) VIRTUAL`,
  `ALTER TABLE ${TABLA} ADD PERIOD FOR periodo (inicio, fin)`,
  `ALTER TABLE ${TABLA} ADD UNIQUE ${TABLA}_sin_cruce (cancha_activa, periodo WITHOUT OVERLAPS)`,
];

const CANCHA = 1;
const OTRA_CANCHA = 2;

/** `08:00` → el instante de ese día de prueba. UTC, como guarda la aplicación. */
const a = (hora: string) => new Date(`2026-11-02T${hora}:00.000Z`);

describe('T75: WITHOUT OVERLAPS sobre MariaDB', () => {
  const prisma = new PrismaService();

  const insertar = (
    desde: string,
    hasta: string,
    estado = 'CONFIRMADA',
    cancha = CANCHA,
    db: Pick<PrismaService, '$executeRawUnsafe'> = prisma,
  ) =>
    db.$executeRawUnsafe(
      `INSERT INTO ${TABLA} (cancha_id, inicio, fin, estado) VALUES (?, ?, ?, ?)`,
      cancha,
      a(desde),
      a(hasta),
      estado,
    );

  /** El código de error de MariaDB, venga como venga envuelto por Prisma. */
  const codigoDe = (error: unknown): string =>
    /\b(1062|1213|1205)\b/.exec(
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
    )?.[1] ?? 'otro';

  /** El error con que falló, o `null` si no falló. */
  const fallaDe = (promesa: Promise<unknown>) =>
    promesa.then(
      () => null,
      (error: unknown) => error,
    );

  const filas = async () =>
    Number(
      (
        await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT COUNT(*) AS n FROM ${TABLA}`,
        )
      )[0].n,
    );

  let filasTrasMigrar = 0;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${TABLA}`);
    await prisma.$executeRawUnsafe(CREAR_COMO_HOY);

    // Punto 3: la migración sobre las DATETIME(3) que ya existen, con datos adentro.
    // Una activa y una cancelada que se pisan, como puede haber hoy en `reserva`.
    await insertar('08:00', '09:00');
    await insertar('08:00', '09:00', 'CANCELADA');

    for (const paso of MIGRACION) {
      await prisma.$executeRawUnsafe(paso);
    }

    filasTrasMigrar = await filas();
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${TABLA}`);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM ${TABLA}`);
  });

  it('la migración corre sobre una tabla que ya tiene reservas y no pierde ninguna', () => {
    expect(filasTrasMigrar).toBe(2);
  });

  it('dos activas que se cruzan sin empezar a la misma hora: la segunda no entra', async () => {
    await insertar('08:00', '09:30');

    const falla = await fallaDe(insertar('09:00', '10:00'));

    expect(codigoDe(falla)).toBe('1062');
    // El adaptador lo clasifica como violación de unicidad, igual que el único de hoy.
    // Por SQL crudo Prisma lo envuelve en P2010; por `reserva.create` esa misma
    // clasificación es el P2002 que `ReservaRepository` traduce a `BloqueTomado`. Ese
    // camino lo prueba T76 sobre la tabla de verdad, en `reservas-concurrencia.spec.ts`.
    expect(
      String(
        (falla as { meta?: { driverAdapterError?: unknown } }).meta
          ?.driverAdapterError,
      ),
    ).toContain('UniqueConstraintViolation');
    expect(await filas()).toBe(1);
  });

  it('dos seguidas que solo se tocan en el borde conviven', async () => {
    // Cerrado abajo y abierto arriba: 09:00 es el fin de una y el inicio de la otra.
    await insertar('08:00', '09:00');
    await insertar('09:00', '10:00');

    expect(await filas()).toBe(2);
  });

  it('las canceladas que se pisan conviven entre ellas y con una activa', async () => {
    // Punto 1: `cancha_activa` en NULL no choca con otro NULL.
    await insertar('08:00', '09:30', 'CANCELADA');
    await insertar('08:30', '10:00', 'EXPIRADA');
    await insertar('08:00', '09:00', 'CANCELADA');
    await insertar('08:30', '09:30');

    expect(await filas()).toBe(4);
  });

  it('cancelar una activa libera su rango para otra que lo pisa en parte', async () => {
    await insertar('08:00', '09:30');
    await prisma.$executeRawUnsafe(
      `UPDATE ${TABLA} SET estado = 'CANCELADA' WHERE inicio = ?`,
      a('08:00'),
    );

    await insertar('09:00', '10:00');

    expect(await filas()).toBe(2);
  });

  it('un PENDIENTE_PAGO ocupa igual que una confirmada', async () => {
    await insertar('08:00', '09:00', 'PENDIENTE_PAGO');

    expect(codigoDe(await fallaDe(insertar('08:30', '09:30')))).toBe('1062');
  });

  it('la misma hora en otra cancha no choca', async () => {
    await insertar('08:00', '09:30', 'CONFIRMADA', CANCHA);
    await insertar('08:00', '09:30', 'CONFIRMADA', OTRA_CANCHA);

    expect(await filas()).toBe(2);
  });

  it('mover una activa sobre otra se rechaza igual que insertarla', async () => {
    // Reagendar es un UPDATE de la misma fila: el único también tiene que mirarlo.
    await insertar('08:00', '09:00');
    await insertar('10:00', '11:00');

    const mover = prisma.$executeRawUnsafe(
      `UPDATE ${TABLA} SET inicio = ?, fin = ? WHERE inicio = ?`,
      a('08:30'),
      a('10:00'),
      a('10:00'),
    );

    expect(codigoDe(await fallaDe(mover))).toBe('1062');
  });

  it('alargar una reserva sobre su propio rango no choca consigo misma', async () => {
    // El cambio más común de la parte: 08:00–09:00 a 08:00–09:30.
    await insertar('08:00', '09:00');

    await prisma.$executeRawUnsafe(
      `UPDATE ${TABLA} SET fin = ? WHERE inicio = ?`,
      a('09:30'),
      a('08:00'),
    );

    expect(await filas()).toBe(1);
  });

  it('dos inserciones simultáneas que se cruzan dejan una sola fila', async () => {
    // Punto 4, el camino de `reserva.create`: dos INSERT en autocommit a la vez.
    const resultados = await Promise.allSettled([
      insertar('08:00', '09:00'),
      insertar('08:30', '09:30'),
    ]);

    const rechazos = resultados.filter((r) => r.status === 'rejected');
    expect(rechazos).toHaveLength(1);
    expect(codigoDe(rechazos[0].reason)).toBe('1062');
    expect(await filas()).toBe(1);
  });

  it('dos transacciones que ven libre el rango antes de escribir dejan una sola fila', async () => {
    // Punto 4, la carrera de verdad: las dos consultan, las dos ven libre y recién
    // entonces escriben. Es la que T2 probó para el único por inicio.
    let llegaron = 0;
    let abrir!: () => void;
    const puerta = new Promise<void>((resolve) => (abrir = resolve));
    const barrera = () => {
      if (++llegaron >= 2) abrir();
      return puerta;
    };

    const intentar = (desde: string, hasta: string) =>
      prisma.$transaction(async (tx) => {
        const cruzadas = await tx.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT COUNT(*) AS n FROM ${TABLA}
             WHERE cancha_activa = ? AND inicio < ? AND fin > ?`,
          CANCHA,
          a(hasta),
          a(desde),
        );
        await barrera();
        if (Number(cruzadas[0].n) > 0) throw new Error('visto como ocupado');
        await insertar(desde, hasta, 'CONFIRMADA', CANCHA, tx);
      });

    const resultados = await Promise.allSettled([
      intentar('08:00', '09:30'),
      intentar('09:00', '10:00'),
    ]);

    const rechazos = resultados.filter((r) => r.status === 'rejected');
    expect(rechazos).toHaveLength(1);
    expect(codigoDe(rechazos[0].reason)).toBe('1062');
    expect(await filas()).toBe(1);
  });
});
