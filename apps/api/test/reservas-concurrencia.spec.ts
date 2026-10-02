import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { EstadoReserva, Superficie } from '../src/generated/prisma/client';
import { esViolacionDeUnicidad } from '../src/prisma/errores';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  BloqueTomado,
  ReservaRepository,
} from '../src/reservas/reserva.repository';

/**
 * T21. La integridad de `reservas`, impuesta por la base y no por el código.
 *
 * Reemplaza al spike de T2 —que probaba el mecanismo sobre una tabla de juguete— por
 * la tabla de verdad. Si este archivo falla, la demo se cae en vivo el día que dos
 * personas toquen el mismo bloque, que es exactamente cuando hay público mirando.
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

describe('Reserva: un bloque, una reserva', () => {
  let modulo: TestingModule;
  let reservas: ReservaRepository;
  let prisma: PrismaService;
  let canchaId: number;

  const NOMBRE_CANCHA = 'Cancha T21';
  /** Las cuentas que crea el test, para borrarlas por igualdad y no con un LIKE. */
  const correosCreados: string[] = [];
  const inicio = new Date('2026-09-01T18:00:00.000Z');
  const fin = new Date('2026-09-01T19:00:00.000Z');

  const unaReserva = (parche: Record<string, unknown> = {}) => ({
    canchaId,
    inicio,
    fin,
    esPico: false,
    estado: EstadoReserva.CONFIRMADA,
    nombre: 'Visitante de prueba',
    email: 'visitante@ejemplo.cl',
    telefono: '+56900000000',
    ...parche,
  });

  beforeAll(async () => {
    modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await modulo.init();

    reservas = modulo.get(ReservaRepository);
    prisma = modulo.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { in: correosCreados } },
    });
    await modulo.close();
  });

  beforeEach(async () => {
    // La cancha se recrea entera: al borrarla se van sus reservas en cascada, así que
    // cada caso arranca con el bloque libre sin depender del anterior.
    // Por prefijo: un caso crea una cancha auxiliar y, si su assert falla antes de
    // borrarla, la corrida siguiente choca con el único sobre el nombre.
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    const cancha = await prisma.cancha.create({
      data: { nombre: NOMBRE_CANCHA, superficie: Superficie.ARCILLA },
      select: { id: true },
    });
    canchaId = cancha.id;
  });

  it('dos reservas simultáneas del mismo bloque: una gana, la otra recibe un error de dominio', async () => {
    // **Test obligatorio** (`SPEC-reservas.md` § Success Criteria 6). Es el bug que
    // destruye la credibilidad del sistema: dos personas con la misma hora.
    const resultados = await Promise.allSettled([
      reservas.crear(unaReserva()),
      reservas.crear(unaReserva()),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const rechazo = resultados.find((r) => r.status === 'rejected');
    // Un error de dominio, no un P2002 crudo: es la diferencia entre "ese bloque lo
    // tomaron recién, elige otro" y un 500 en la cara del que iba a pagar.
    expect(rechazo?.reason).toBeInstanceOf(BloqueTomado);
    expect(esViolacionDeUnicidad(rechazo?.reason)).toBe(false);

    expect(await prisma.reserva.count({ where: { canchaId } })).toBe(1);
  });

  it('dos que consultan primero y ven el bloque libre siguen dejando una sola reserva', async () => {
    // La carrera real: los dos abren la grilla, los dos ven la hora libre, y recién
    // entonces los dos reservan. Chequear disponibilidad antes de insertar no alcanza;
    // lo probó T2 contra MariaDB y acá se confirma sobre la tabla de verdad.
    const barrera = crearBarrera(2);

    const intentar = async () => {
      const tomado = await prisma.reserva.findFirst({
        where: { canchaId, inicio, estado: EstadoReserva.CONFIRMADA },
      });

      await barrera();

      if (tomado) throw new Error('visto como ocupado');
      return reservas.crear(unaReserva());
    };

    const resultados = await Promise.allSettled([intentar(), intentar()]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.reserva.count({ where: { canchaId } })).toBe(1);
  });

  it('una reserva cancelada libera el bloque para una nueva', async () => {
    const primera = await reservas.crear(unaReserva());

    await reservas.cancelar(primera.id);
    const segunda = await reservas.crear(unaReserva());

    expect(segunda.id).not.toBe(primera.id);
    // Las dos filas conviven: la cancelada queda para el historial y la nueva ocupa
    // el bloque. Es lo que prueba que el único mira `inicio_activo` y no `inicio`.
    expect(await prisma.reserva.count({ where: { canchaId } })).toBe(2);
  });

  it('varias canceladas del mismo bloque conviven', async () => {
    // En MySQL dos NULL no chocan entre sí. Si el único fuera sobre `inicio` a secas,
    // la segunda cancelación del mismo bloque haría fallar la reserva siguiente.
    for (let vez = 0; vez < 3; vez++) {
      const reserva = await reservas.crear(unaReserva());
      await reservas.cancelar(reserva.id);
    }

    await expect(reservas.crear(unaReserva())).resolves.toBeDefined();
    expect(await prisma.reserva.count({ where: { canchaId } })).toBe(4);
  });

  it('una reserva esperando pago ocupa el bloque', async () => {
    // Mientras el no-socio está en Webpay esa hora no se le ofrece a nadie más.
    await reservas.crear(unaReserva({ estado: EstadoReserva.PENDIENTE_PAGO }));

    await expect(reservas.crear(unaReserva())).rejects.toBeInstanceOf(
      BloqueTomado,
    );
  });

  it('una reserva expirada libera el bloque', async () => {
    const abandonada = await reservas.crear(
      unaReserva({ estado: EstadoReserva.PENDIENTE_PAGO }),
    );

    await reservas.expirar(abandonada.id);

    // El pago no llegó a tiempo (T19): la hora vuelve a estar a la venta.
    await expect(reservas.crear(unaReserva())).resolves.toBeDefined();
  });

  it('el mismo bloque en otra cancha no choca', async () => {
    const otra = await prisma.cancha.create({
      data: { nombre: `${NOMBRE_CANCHA} bis`, superficie: Superficie.CEMENTO },
      select: { id: true },
    });

    await reservas.crear(unaReserva());

    await expect(
      reservas.crear(unaReserva({ canchaId: otra.id })),
    ).resolves.toBeDefined();

    await prisma.cancha.delete({ where: { id: otra.id } });
  });

  it('cada reserva trae un folio propio para mostrar en el mesón', async () => {
    const primera = await reservas.crear(unaReserva());
    await reservas.cancelar(primera.id);
    const segunda = await reservas.crear(unaReserva());

    expect(primera.folio).toBeTruthy();
    expect(segunda.folio).not.toBe(primera.folio);
  });

  it('guarda a los acompañantes declarados', async () => {
    // El socio se crea acá y no se toma de la base: `findFirst` dependía de que el
    // seed hubiera corrido antes, así que el test pasaba o fallaba según qué otra
    // suite se hubiera ejecutado primero.
    const socio = await socioDePrueba();

    const reserva = await reservas.crear(
      unaReserva({
        acompanantes: [{ socioId: socio.id }, { nombre: 'Ana Invitada' }],
      }),
    );

    const guardados = await prisma.acompananteReserva.findMany({
      where: { reservaId: reserva.id },
    });

    // Los dos tipos en la misma tabla: es la respuesta a "con quién juega", y en dos
    // tablas "sin invitados" y "sin declarar" se verían igual.
    expect(guardados).toHaveLength(2);
    expect(guardados.filter((a) => a.socioId !== null)).toHaveLength(1);
    expect(guardados.filter((a) => a.nombre !== null)).toHaveLength(1);
  });

  describe('un acompañante es socio o invitado, nunca las dos cosas ni ninguna', () => {
    // La regla que MariaDB no deja imponer con un CHECK, porque `socio_id` tiene
    // foreign key. Al mudarla al código queda sin la red de la base: si estos tests
    // no existen, borrar el guardia no rompe nada y una fila vacía pasa a contar como
    // "declaró con quién juega".
    it('rechaza un acompañante vacío', async () => {
      await expect(
        reservas.crear(unaReserva({ acompanantes: [{}] })),
      ).rejects.toThrow(/socio del club o un invitado/i);
    });

    it('rechaza un nombre en blanco, que es un vacío disfrazado', async () => {
      await expect(
        reservas.crear(unaReserva({ acompanantes: [{ nombre: '   ' }] })),
      ).rejects.toThrow();
    });

    it('rechaza al que es socio e invitado a la vez', async () => {
      const socio = await socioDePrueba();

      await expect(
        reservas.crear(
          unaReserva({
            acompanantes: [{ socioId: socio.id, nombre: 'Ana Invitada' }],
          }),
        ),
      ).rejects.toThrow();
    });

    it('el rechazo ocurre antes de escribir: no queda media reserva', async () => {
      await expect(
        reservas.crear(unaReserva({ acompanantes: [{}] })),
      ).rejects.toThrow();

      expect(await prisma.reserva.count({ where: { canchaId } })).toBe(0);
    });
  });

  it('la base rechaza una reserva que termina antes de empezar', async () => {
    // Igual que `Bloqueo` desde T14: el DTO lo va a atajar en T22, pero quien escriba
    // SQL directo también tiene que chocar contra algo.
    await expect(
      prisma.reserva.create({
        data: {
          folio: 'INVERT1',
          canchaId,
          inicio: fin,
          fin: inicio,
          estado: EstadoReserva.CONFIRMADA,
          nombre: 'Rango invertido',
          email: 'invertido@ejemplo.cl',
          telefono: '+56900000000',
        },
      }),
    ).rejects.toThrow();
  });

  /** Un socio propio del test, para no depender de lo que otra suite haya sembrado. */
  const socioDePrueba = async () => {
    const marca = `${Date.now()}-${correosCreados.length}`;
    const email = `t21-${marca}@ejemplo.cl`;
    correosCreados.push(email);

    const usuario = await prisma.usuario.create({
      data: {
        email,
        nombre: 'Socio',
        apellido: 'Acompañante',
        socio: {
          create: {
            numeroSocio: `T21-${marca}`,
            fechaIngreso: new Date('2026-01-01'),
            alDiaHasta: new Date('2027-01-01'),
          },
        },
      },
      select: { socio: { select: { id: true } } },
    });

    return usuario.socio!;
  };
});
