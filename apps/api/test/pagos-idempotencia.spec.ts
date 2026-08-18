import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import {
  ConceptoPago,
  EstadoTransaccion,
} from '../src/generated/prisma/client';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { ConfirmacionService } from '../src/pagos/confirmacion.service';
import { PagosService } from '../src/pagos/pagos.service';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T18. El requisito que no se negocia (`SPEC-pagos.md` § Idempotencia).
 *
 * Las pasarelas reintentan el callback, la gente recarga la página de retorno y
 * cierra el navegador a medio camino. Si confirmar dos veces cobra dos veces o crea
 * dos reservas del mismo bloque, la demo se cae en vivo y el club pierde plata de
 * verdad el día que esto salga a producción.
 */
describe('ConfirmacionService', () => {
  let modulo: TestingModule;
  let confirmacion: ConfirmacionService;
  let pagos: PagosService;
  let pasarela: PasarelaFake;
  let prisma: PrismaService;

  const CONCEPTO_ID = 1518;

  /** Cuántas veces se ejecutó el efecto de negocio. Lo que no puede pasar de 1. */
  let efectos: number[];
  const efecto = () => {
    efectos.push(Date.now());
    return Promise.resolve();
  };

  const limpiar = () =>
    prisma.transaccion.deleteMany({
      where: { concepto: ConceptoPago.RESERVA, conceptoId: CONCEPTO_ID },
    });

  const unPagoPendiente = () =>
    pagos.iniciar({
      concepto: ConceptoPago.RESERVA,
      conceptoId: CONCEPTO_ID,
      montoClp: 12000,
      urlRetorno: 'https://club.local/pagos/retorno',
    });

  const tokenDe = async (transaccionId: number) =>
    (
      await prisma.transaccion.findUniqueOrThrow({
        where: { id: transaccionId },
      })
    ).tokenPasarela!;

  beforeAll(async () => {
    modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .compile();

    await modulo.init();

    confirmacion = modulo.get(ConfirmacionService);
    pagos = modulo.get(PagosService);
    pasarela = modulo.get(PasarelaPago);
    prisma = modulo.get(PrismaService);
  });

  afterAll(async () => {
    await limpiar();
    await modulo.close();
  });

  beforeEach(async () => {
    pasarela.reiniciar();
    efectos = [];
    await limpiar();
  });

  it('confirmar dos veces produce un solo efecto de negocio', async () => {
    // **Test obligatorio de SPEC-pagos.md § Success Criteria 3.**
    const { transaccionId } = await unPagoPendiente();
    const token = await tokenDe(transaccionId);

    const primera = await confirmacion.confirmar(token, efecto);
    const segunda = await confirmacion.confirmar(token, efecto);

    expect(primera.estado).toBe('AUTORIZADA');
    expect(segunda).toEqual(primera);
    expect(efectos).toHaveLength(1);
    // Y sin volver a preguntarle a la pasarela: la segunda vuelta se responde con lo
    // que ya está guardado. Contra Webpay, un segundo commit del mismo token es un
    // error, así que preguntar de nuevo convertiría una recarga en una falla.
    expect(pasarela.confirmaciones).toHaveLength(1);
  });

  it('dos confirmaciones concurrentes producen un solo efecto de negocio', async () => {
    // **Test obligatorio de SPEC-pagos.md § Success Criteria 4.** El caso real: la
    // pasarela reintenta el callback mientras la persona recarga la página.
    const { transaccionId } = await unPagoPendiente();
    const token = await tokenDe(transaccionId);

    const [una, otra] = await Promise.all([
      confirmacion.confirmar(token, efecto),
      confirmacion.confirmar(token, efecto),
    ]);

    expect(efectos).toHaveLength(1);
    expect(una.estado).toBe('AUTORIZADA');
    expect(otra.estado).toBe('AUTORIZADA');
    expect(una.codigoAutorizacion).toBe(otra.codigoAutorizacion);
  });

  it('si la pasarela rechaza la confirmación repetida, la perdedora igual responde bien', async () => {
    // Lo que hace Webpay de verdad: el segundo `commit` del mismo token responde 422
    // (`Transaction has an invalid finished state`), como se vio en T17 contra el
    // ambiente de integración. Las dos llamadas concurrentes alcanzan a preguntarle a
    // la pasarela, así que una recibe ese error — y quien recargó la página no puede
    // ver un 500 por un pago que sí se procesó.
    pasarela.fallarEnConfirmacionRepetida = true;
    const { transaccionId } = await unPagoPendiente();
    const token = await tokenDe(transaccionId);

    const [una, otra] = await Promise.all([
      confirmacion.confirmar(token, efecto),
      confirmacion.confirmar(token, efecto),
    ]);

    expect(efectos).toHaveLength(1);
    expect(una.estado).toBe('AUTORIZADA');
    expect(otra.estado).toBe('AUTORIZADA');
  });

  it('deja la transacción AUTORIZADA con su código y la tarjeta', async () => {
    const { transaccionId } = await unPagoPendiente();

    await confirmacion.confirmar(await tokenDe(transaccionId), efecto);

    expect(
      await prisma.transaccion.findUniqueOrThrow({
        where: { id: transaccionId },
      }),
    ).toMatchObject({
      estado: EstadoTransaccion.AUTORIZADA,
      ultimosDigitos: '4321',
      requiereRevision: false,
    });
  });

  it('un monto distinto al guardado no confirma el efecto y queda para revisión', async () => {
    // Criterio 6 del spec: es manipulación o un bug, y en los dos casos confirmar la
    // reserva sería regalar una cancha o cobrar de menos sin que nadie se entere.
    pasarela.montoReportado = 1;
    const { transaccionId } = await unPagoPendiente();

    const resultado = await confirmacion.confirmar(
      await tokenDe(transaccionId),
      efecto,
    );

    expect(efectos).toHaveLength(0);
    expect(resultado.requiereRevision).toBe(true);
    // Queda marcada en la base, no solo en un log: alguien tiene que poder
    // encontrarla mañana.
    expect(
      await prisma.transaccion.findUniqueOrThrow({
        where: { id: transaccionId },
      }),
    ).toMatchObject({ requiereRevision: true });
  });

  it('un pago rechazado no ejecuta el efecto y guarda el motivo', async () => {
    pasarela.respuesta = 'RECHAZADA';
    const { transaccionId } = await unPagoPendiente();

    const resultado = await confirmacion.confirmar(
      await tokenDe(transaccionId),
      efecto,
    );

    expect(resultado.estado).toBe('RECHAZADA');
    expect(resultado.motivoRechazo).toBeTruthy();
    expect(efectos).toHaveLength(0);
    expect(
      (
        await prisma.transaccion.findUniqueOrThrow({
          where: { id: transaccionId },
        })
      ).estado,
    ).toBe(EstadoTransaccion.RECHAZADA);
  });

  it('si el efecto de negocio falla, la transacción no queda confirmada', async () => {
    // "O ambas cosas, o ninguna" (§ Idempotencia, regla 2). Una transacción
    // AUTORIZADA sin su reserva es un cobro que nadie va a poder explicar.
    const { transaccionId } = await unPagoPendiente();

    await expect(
      confirmacion.confirmar(await tokenDe(transaccionId), () =>
        Promise.reject(new Error('el bloque lo tomaron recién')),
      ),
    ).rejects.toThrow();

    expect(
      (
        await prisma.transaccion.findUniqueOrThrow({
          where: { id: transaccionId },
        })
      ).estado,
    ).toBe(EstadoTransaccion.PENDIENTE);
  });

  it('una transacción ya expirada no se confirma ni pregunta a la pasarela', async () => {
    // Pasa de verdad: el barrido de los 15 minutos (T19) la expiró y el callback
    // llega después. El bloque ya se liberó, así que confirmar acá dejaría dos
    // reservas sobre la misma hora.
    const { transaccionId } = await unPagoPendiente();
    const token = await tokenDe(transaccionId);
    await prisma.transaccion.update({
      where: { id: transaccionId },
      data: { estado: EstadoTransaccion.EXPIRADA },
    });

    const resultado = await confirmacion.confirmar(token, efecto);

    expect(resultado.estado).toBe('EXPIRADA');
    expect(efectos).toHaveLength(0);
    expect(pasarela.confirmaciones).toHaveLength(0);
    // Para revisión: si la pasarela llegó a cobrar, hay plata que devolver.
    expect(resultado.requiereRevision).toBe(true);
  });

  it('un token que no es de ninguna transacción se rechaza', async () => {
    await expect(
      confirmacion.confirmar('token-fantasma', efecto),
    ).rejects.toThrow();
    expect(efectos).toHaveLength(0);
  });

  it('sin efecto de negocio igual confirma: no todo pago tiene reserva detrás', async () => {
    const { transaccionId } = await unPagoPendiente();

    const resultado = await confirmacion.confirmar(
      await tokenDe(transaccionId),
    );

    expect(resultado.estado).toBe('AUTORIZADA');
  });
});
