import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import {
  ConceptoPago,
  EstadoTransaccion,
} from '../src/generated/prisma/client';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { AnulacionService } from '../src/pagos/anulacion.service';
import { ConfirmacionService } from '../src/pagos/confirmacion.service';
import { MINUTOS_PARA_EXPIRAR } from '../src/pagos/expiracion';
import { ExpiracionService } from '../src/pagos/expiracion.service';
import { PagosService } from '../src/pagos/pagos.service';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T19. Lo que pasa con los pagos que nadie termina, y con los que hay que devolver.
 *
 * Sin expiración, quien abandona el pago deja la cancha tomada para siempre: el
 * bloque no vuelve a ofrecerse y nadie entiende por qué esa hora nunca está libre.
 */
describe('Expiración y anulación', () => {
  let modulo: TestingModule;
  let expiracion: ExpiracionService;
  let anulacion: AnulacionService;
  let confirmacion: ConfirmacionService;
  let pagos: PagosService;
  let pasarela: PasarelaFake;
  let prisma: PrismaService;

  const CONCEPTO_ID = 1519;

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

  /** Corre el reloj hacia atrás: la transacción se creó hace tantos minutos. */
  const creadaHace = (transaccionId: number, minutos: number) =>
    prisma.transaccion.update({
      where: { id: transaccionId },
      data: { creadaEn: new Date(Date.now() - minutos * 60_000) },
    });

  const estadoDe = async (id: number) =>
    (await prisma.transaccion.findUniqueOrThrow({ where: { id } })).estado;

  beforeAll(async () => {
    modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .compile();

    await modulo.init();

    expiracion = modulo.get(ExpiracionService);
    anulacion = modulo.get(AnulacionService);
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
    await limpiar();
  });

  describe('expiración', () => {
    it('una pendiente de más de 15 minutos queda EXPIRADA', async () => {
      const { transaccionId } = await unPagoPendiente();
      await creadaHace(transaccionId, MINUTOS_PARA_EXPIRAR + 1);

      await expiracion.barrer();

      expect(await estadoDe(transaccionId)).toBe(EstadoTransaccion.EXPIRADA);
    });

    it('una pendiente recién creada sobrevive el barrido', async () => {
      // El borde importa: expirar a alguien que está tecleando su tarjeta le quita el
      // bloque en la mitad del pago.
      const { transaccionId } = await unPagoPendiente();

      await expiracion.barrer();

      expect(await estadoDe(transaccionId)).toBe(EstadoTransaccion.PENDIENTE);
    });

    it('justo en el minuto 15 todavía no expira', async () => {
      // El instante se fija de los dos lados: con `new Date()` adentro del servicio,
      // los milisegundos que pasan entre una línea y otra ya corren el borde y el test
      // pasaría o fallaría según lo rápido que ande la máquina.
      const ahora = new Date();
      const { transaccionId } = await unPagoPendiente();
      await prisma.transaccion.update({
        where: { id: transaccionId },
        data: {
          creadaEn: new Date(ahora.getTime() - MINUTOS_PARA_EXPIRAR * 60_000),
        },
      });

      await expiracion.barrer(ahora);

      // Con `<=` en vez de `<`, quien empezó a pagar hace exactamente 15 minutos
      // pierde el bloque en el segundo justo. La ventana se cuenta entera.
      expect(await estadoDe(transaccionId)).toBe(EstadoTransaccion.PENDIENTE);
    });

    it('no toca una transacción ya autorizada, por vieja que sea', async () => {
      const { transaccionId } = await unPagoPendiente();
      const { tokenPasarela } = await prisma.transaccion.findUniqueOrThrow({
        where: { id: transaccionId },
      });
      await confirmacion.confirmar(tokenPasarela!);
      await creadaHace(transaccionId, 60 * 24);

      await expiracion.barrer();

      // Expirar un pago cobrado sería declarar libre un bloque que alguien pagó.
      expect(await estadoDe(transaccionId)).toBe(EstadoTransaccion.AUTORIZADA);
    });

    it('dice cuántas expiró, para que el llamador pueda registrarlo', async () => {
      const uno = await unPagoPendiente();
      const otro = await unPagoPendiente();
      await creadaHace(uno.transaccionId, MINUTOS_PARA_EXPIRAR + 1);
      await creadaHace(otro.transaccionId, MINUTOS_PARA_EXPIRAR + 1);

      expect(await expiracion.barrer()).toBeGreaterThanOrEqual(2);
    });
  });

  describe('anulación', () => {
    const unPagoAutorizado = async () => {
      const { transaccionId } = await unPagoPendiente();
      const { tokenPasarela } = await prisma.transaccion.findUniqueOrThrow({
        where: { id: transaccionId },
      });
      await confirmacion.confirmar(tokenPasarela!);
      return { transaccionId, tokenPasarela: tokenPasarela! };
    };

    it('deja ANULADA la transacción y devuelve el monto completo', async () => {
      const { transaccionId, tokenPasarela } = await unPagoAutorizado();

      await anulacion.anular(transaccionId);

      expect(await estadoDe(transaccionId)).toBe(EstadoTransaccion.ANULADA);
      // El monto entero: solo existe la devolución total (`SPEC-pagos.md` §
      // Reembolso). Devolver de menos es una discusión con el socio.
      expect(pasarela.anulaciones).toEqual([
        { tokenPasarela, montoClp: 12000 },
      ]);
    });

    it('anular dos veces no devuelve la plata dos veces', async () => {
      const { transaccionId } = await unPagoAutorizado();

      await anulacion.anular(transaccionId);
      await anulacion.anular(transaccionId);

      expect(pasarela.anulaciones).toHaveLength(1);
    });

    it('dos anulaciones a la vez devuelven la plata una sola vez', async () => {
      // El chequeo de estado previo no alcanza: las dos leen AUTORIZADA antes de que
      // ninguna escriba, y las dos le piden la devolución a la pasarela. Es el mismo
      // agujero que T18 cerró para la confirmación, y acá sale plata del club.
      // Pasa de verdad con un doble clic en "cancelar reserva".
      const { transaccionId } = await unPagoAutorizado();

      await Promise.all([
        anulacion.anular(transaccionId),
        anulacion.anular(transaccionId),
      ]);

      expect(pasarela.anulaciones).toHaveLength(1);
      expect(await estadoDe(transaccionId)).toBe(EstadoTransaccion.ANULADA);
    });

    it('no se anula un pago que no llegó a autorizarse', async () => {
      // No hay nada que devolver, y pedírselo a la pasarela es un error de verdad.
      const { transaccionId } = await unPagoPendiente();

      await expect(anulacion.anular(transaccionId)).rejects.toThrow();
      expect(pasarela.anulaciones).toHaveLength(0);
    });

    it('si la pasarela no devuelve la plata, la transacción no queda ANULADA', async () => {
      // Marcarla anulada sin que la devolución ocurriera es decirle a alguien que le
      // devolvieron su dinero cuando no fue así.
      const { transaccionId } = await unPagoAutorizado();
      pasarela.fallarAlAnular = true;

      await expect(anulacion.anular(transaccionId)).rejects.toThrow();

      expect(await estadoDe(transaccionId)).toBe(EstadoTransaccion.AUTORIZADA);
    });
  });
});
