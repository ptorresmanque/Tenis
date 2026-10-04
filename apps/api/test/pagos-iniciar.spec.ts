import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { DisponibilidadService } from '../src/catalogo-canchas/disponibilidad.service';
import { ConceptoPago } from '../src/generated/prisma/client';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PagosService } from '../src/pagos/pagos.service';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';
import { sembrarCatalogo } from '../prisma/seed-catalogo';

/**
 * T16. Iniciar un pago: crear la `Transaccion` en `PENDIENTE` y mandar a la persona
 * a pagar. Contra el doble, que es lo que deja construir `reservas` sin depender del
 * ambiente de integración de Transbank.
 */
describe('PagosService.iniciar', () => {
  let modulo: TestingModule;
  let pagos: PagosService;
  let pasarela: PasarelaFake;
  let disponibilidad: DisponibilidadService;
  let prisma: PrismaService;

  // Id de concepto propio del test, para limpiar sin tocar lo de otras suites. Por
  // igualdad y no por prefijo: un LIKE toma lock de rango y traba a las demás.
  const CONCEPTO_ID = 1516;
  const LUNES = '2026-08-17';

  const solicitud = {
    concepto: ConceptoPago.RESERVA,
    conceptoId: CONCEPTO_ID,
    montoClp: 12000,
    urlRetorno: 'https://club.local/pagos/retorno',
  };

  const limpiar = () =>
    prisma.transaccion.deleteMany({
      where: { concepto: ConceptoPago.RESERVA, conceptoId: CONCEPTO_ID },
    });

  beforeAll(async () => {
    // El doble se pide explícitamente, como `registro.spec` con `EnviadorCorreo`: si
    // se tomara el que cablea `PagosModule`, en T17 —cuando ahí quede el adaptador de
    // Webpay— esta suite empezaría a hablar con Transbank y el fallo aparecería como
    // "reiniciar is not a function", lejos de la causa.
    modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .compile();

    await modulo.init();

    pagos = modulo.get(PagosService);
    pasarela = modulo.get(PasarelaPago);
    disponibilidad = modulo.get(DisponibilidadService);
    prisma = modulo.get(PrismaService);

    await sembrarCatalogo(prisma);
  });

  afterAll(async () => {
    await limpiar();
    await modulo.close();
  });

  beforeEach(async () => {
    pasarela.reiniciar();
    await limpiar();
  });

  it('crea la transacción PENDIENTE y devuelve a dónde ir a pagar', async () => {
    const inicio = await pagos.iniciar(solicitud);

    const transaccion = await prisma.transaccion.findUniqueOrThrow({
      where: { id: inicio.transaccionId },
    });

    expect(transaccion).toMatchObject({
      estado: 'PENDIENTE',
      montoClp: 12000,
      pasarela: pasarela.nombre,
      confirmadaEn: null,
    });
    // El token se guarda al iniciar: es la única forma de reconocer la transacción
    // cuando la pasarela devuelva el callback, que no trae nuestra referencia.
    expect(transaccion.tokenPasarela).toBeTruthy();
    expect(inicio.urlRedireccion).toContain(transaccion.tokenPasarela!);
  });

  it('la referencia que viaja a la pasarela es la de la transacción', async () => {
    const inicio = await pagos.iniciar(solicitud);

    expect(pasarela.ordenes).toHaveLength(1);
    expect(pasarela.ordenes[0]).toMatchObject({
      referencia: inicio.referencia,
      montoClp: 12000,
      urlRetorno: solicitud.urlRetorno,
    });
  });

  it('dos pagos del mismo concepto no chocan entre sí', async () => {
    // Pasa de verdad: alguien abre el pago, vuelve atrás y lo intenta de nuevo. Con
    // una referencia derivada del concepto, el segundo intento moriría contra el
    // único y la persona no podría pagar nunca.
    const uno = await pagos.iniciar(solicitud);
    const otro = await pagos.iniciar(solicitud);

    expect(uno.referencia).not.toBe(otro.referencia);
  });

  it('la referencia cabe en la orden de compra de la pasarela', async () => {
    // Webpay acepta 26 caracteres en `buyOrder` (T17). Un UUID con guiones mide 36:
    // con ese formato, el primer pago real muere con un error de validación del SDK
    // y parece un problema de Transbank.
    const { referencia } = await pagos.iniciar(solicitud);

    expect(referencia.length).toBeLessThanOrEqual(26);
  });

  it('rechaza un monto con decimales y no deja transacción', async () => {
    // La deuda que T15 dejó anotada: la columna `Int` no rechaza un decimal, lo
    // trunca en silencio. El guardia va acá, antes de escribir.
    await expect(
      pagos.iniciar({ ...solicitud, montoClp: 12000.5 }),
    ).rejects.toThrow(/entero/i);

    expect(
      await prisma.transaccion.count({ where: { conceptoId: CONCEPTO_ID } }),
    ).toBe(0);
  });

  it('rechaza un monto de cero o negativo', async () => {
    // Un pago de $0 es un socio que no paga: `reservas` no debe crear transacción,
    // no crearla de cero. Uno negativo es una devolución encubierta.
    await expect(
      pagos.iniciar({ ...solicitud, montoClp: 0 }),
    ).rejects.toThrow();
    await expect(
      pagos.iniciar({ ...solicitud, montoClp: -12000 }),
    ).rejects.toThrow();
  });

  it('cobra el monto que salió del catálogo, sin tocarlo', async () => {
    // La cadena que va a armar T23: el precio sale de `franjaPara()` a través de la
    // disponibilidad y llega intacto a la orden. Lo que este test **no** prueba es
    // que un monto del cliente se rechace: ese borde es el endpoint de T23, donde el
    // DTO directamente no acepta el campo. Acá no hay cliente todavía.
    const bloques = await disponibilidad.de(await primeraCanchaId(), LUNES);
    const bloque = bloques.find((b) => !b.bloqueado && (b.montoClp ?? 0) > 0);

    // Nulo no llega con 1 hora (T79), pero el tipo lo admite y `iniciar` pide un número.
    if (!bloque || bloque.montoClp === null) {
      throw new Error('El catálogo del seed no dejó ningún bloque con tarifa.');
    }

    await pagos.iniciar({
      ...solicitud,
      montoClp: bloque.montoClp,
      inicioBloqueOriginal: bloque.inicio,
    });

    // Contra el valor del catálogo y no contra una constante del test: una tarifa
    // distinta en el seed no puede hacer pasar esto por casualidad.
    expect(pasarela.ordenes[0].montoClp).toBe(bloque.montoClp);
    expect(bloque.montoClp).toBeGreaterThan(0);
  });

  it('guarda el inicio del bloque comprado para la ventana de reembolso', async () => {
    const inicioBloqueOriginal = new Date('2026-09-01T14:00:00.000Z');

    const inicio = await pagos.iniciar({ ...solicitud, inicioBloqueOriginal });

    expect(
      (
        await prisma.transaccion.findUniqueOrThrow({
          where: { id: inicio.transaccionId },
        })
      ).inicioBloqueOriginal,
    ).toEqual(inicioBloqueOriginal);
  });

  it('si la pasarela falla, la transacción queda PENDIENTE y sin token', async () => {
    pasarela.fallarAlIniciar = true;

    await expect(pagos.iniciar(solicitud)).rejects.toThrow();

    // Queda escrita y sin token: la expiración de T19 la barre a los 15 minutos.
    // Borrarla acá sería perder el rastro de que alguien intentó pagar.
    const [transaccion] = await prisma.transaccion.findMany({
      where: { conceptoId: CONCEPTO_ID },
    });

    expect(transaccion).toMatchObject({
      estado: 'PENDIENTE',
      tokenPasarela: null,
    });
  });

  const primeraCanchaId = async () =>
    (await prisma.cancha.findFirstOrThrow({ where: { activa: true } })).id;
});
