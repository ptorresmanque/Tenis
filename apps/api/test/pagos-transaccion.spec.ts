import {
  ConceptoPago,
  EstadoTransaccion,
  Prisma,
} from '../src/generated/prisma/client';
import { esViolacionDeUnicidad } from '../src/prisma/errores';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T15. La tabla `Transaccion` de `SPEC-pagos.md` § Modelo de datos.
 *
 * Los dos únicos son el mecanismo de la idempotencia que T18 no puede negociar: sin
 * el de `tokenPasarela`, dos callbacks concurrentes de la pasarela confirman dos
 * veces el mismo pago.
 */
describe('Transaccion', () => {
  let prisma: PrismaService;

  // Prefijo propio: Jest corre los archivos en paralelo y otras suites van a crear
  // transacciones. Contar o borrar la tabla entera rompería esta suite lejos de acá.
  const referenciaDelTest = { startsWith: 'T15-' };

  // La cuenta del test de la baja de usuario. Se borra dentro del test; acá se
  // guarda solo para limpiarla si el test se corta antes de llegar a borrarla.
  //
  // Por igualdad y no por prefijo: un `deleteMany` con LIKE sobre `email` toma un
  // lock de rango en ese índice, y `identidad-seed` está insertando ahí al mismo
  // tiempo. Eso son dos suites en deadlock, y el error aparece en la otra.
  const emailDeLaBaja = `t15-baja-${Date.now()}@ejemplo.cl`;

  // Tipado con el input de Prisma y no con un objeto suelto: un campo renombrado en
  // el schema tiene que romper la compilación de este archivo, no aparecer como un
  // error de base a mitad de la corrida.
  const nueva = (
    parche: Partial<Prisma.TransaccionUncheckedCreateInput> = {},
  ): Prisma.TransaccionUncheckedCreateInput => ({
    referencia: `T15-${Math.random().toString(36).slice(2)}`,
    concepto: ConceptoPago.RESERVA,
    conceptoId: 1,
    montoClp: 12000,
    pasarela: 'doble',
    ...parche,
  });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { referencia: referenciaDelTest },
    });
    await prisma.usuario.deleteMany({ where: { email: emailDeLaBaja } });
    await prisma.$disconnect();
  });

  it('nace PENDIENTE, sin token ni confirmación', async () => {
    const transaccion = await prisma.transaccion.create({ data: nueva() });

    expect(transaccion).toMatchObject({
      estado: EstadoTransaccion.PENDIENTE,
      montoClp: 12000,
      tokenPasarela: null,
      codigoAutorizacion: null,
      confirmadaEn: null,
    });
  });

  it('la base rechaza dos transacciones con la misma referencia', async () => {
    const referencia = `T15-referencia-${Date.now()}`;
    await prisma.transaccion.create({ data: nueva({ referencia }) });

    const error = await prisma.transaccion
      .create({ data: nueva({ referencia }) })
      .then(() => null)
      .catch((e: unknown) => e);

    // Distinguible: es lo que deja responder "ese pago ya está iniciado" en vez de
    // un 500. La función es la misma que valida T2.
    expect(esViolacionDeUnicidad(error)).toBe(true);
  });

  it('la base rechaza dos transacciones con el mismo token de pasarela', async () => {
    const tokenPasarela = `T15-token-${Date.now()}`;
    await prisma.transaccion.create({ data: nueva({ tokenPasarela }) });

    const error = await prisma.transaccion
      .create({ data: nueva({ tokenPasarela }) })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(esViolacionDeUnicidad(error)).toBe(true);
  });

  it('dos transacciones sin token conviven', async () => {
    // Toda transacción nace sin token: si los nulos chocaran entre sí, el club no
    // podría tener dos pagos iniciados a la vez.
    await prisma.transaccion.create({ data: nueva() });

    await expect(
      prisma.transaccion.create({ data: nueva() }),
    ).resolves.toMatchObject({ tokenPasarela: null });
  });

  it('conserva el inicio del bloque que se compró', async () => {
    // El campo del que depende la ventana de reembolso después de un reagendamiento
    // (`SPEC-pagos.md` § Reembolso). Su primer consumidor es T24: hasta entonces,
    // este test es lo único que impide que desaparezca del schema sin que se note.
    const inicioBloqueOriginal = new Date('2026-09-01T14:00:00.000Z');

    const transaccion = await prisma.transaccion.create({
      data: nueva({ inicioBloqueOriginal }),
    });

    expect(transaccion.inicioBloqueOriginal).toEqual(inicioBloqueOriginal);
  });

  it('el pago sobrevive a la baja del usuario', async () => {
    const usuario = await prisma.usuario.create({
      data: {
        email: emailDeLaBaja,
        nombre: 'Cuenta',
        apellido: 'Dada de baja',
      },
      select: { id: true },
    });
    const { id } = await prisma.transaccion.create({
      data: nueva({ usuarioId: usuario.id }),
      select: { id: true },
    });

    await prisma.usuario.delete({ where: { id: usuario.id } });

    // Con `Cascade` —lo que hacen socio, profesor y sesión— borrar la cuenta borraría
    // el comprobante de que el club cobró. Acá el registro queda y lo único que se
    // pierde es a quién apuntaba.
    expect(
      await prisma.transaccion.findUnique({ where: { id } }),
    ).toMatchObject({ usuarioId: null, montoClp: 12000 });
  });

  it('no guarda centavos: la columna es entera', async () => {
    // El peso chileno no tiene centavos, y un monto con decimales guardado tal cual
    // es un monto que la pasarela redondea y que al confirmar ya no cuadra con el
    // guardado — para T18 eso es manipulación y manda la transacción a revisión
    // manual. Si alguien cambia la columna a Float, este test lo dice.
    const transaccion = await prisma.transaccion.create({
      data: nueva({ montoClp: 12000.5 }),
    });

    expect(transaccion.montoClp).toBe(12000);
  });
});
