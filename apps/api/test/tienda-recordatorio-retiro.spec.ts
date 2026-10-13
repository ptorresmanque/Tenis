import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import type { RecordatoriosDeCuota } from '../src/cuotas/recordatorios';
import { EnviadorCorreo } from '../src/identidad/correo';
import { PrismaService } from '../src/prisma/prisma.service';
import { correrRecordatorios } from '../src/recordatorios';
import { RecordatoriosDeRetiro } from '../src/tienda/recordatorio-retiro';

/**
 * T171: el recordatorio de retiro (`SPEC-tienda.md` § Retiro y despacho, 16b).
 *
 * A los 7 días de quedar listo, **un** recordatorio al comprador, en la misma corrida por
 * hora que los de cuota y **dentro del mismo tope**: el hosting limita los correos por
 * hora, y dos tandas con su propio tope lo pasarían. El pedido no se cancela solo.
 */
describe('Tienda: el recordatorio de retiro', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let retiros: RecordatoriosDeRetiro;

  const DOMINIO = '@tienda-t171.test';
  const DIA = 24 * 60 * 60_000;
  const AHORA = new Date();

  const enviados: { para: string; asunto: string; cuerpo: string }[] = [];
  const correo = {
    enviar: (mensaje: { para: string; asunto: string; cuerpo: string }) => {
      enviados.push(mensaje);
      return Promise.resolve();
    },
  };

  let n = 0;
  /** Un pedido de retiro en el estado que pida la prueba, listo hace tantos días. */
  const pedido = (
    datos: {
      estado?: 'LISTO_PARA_RETIRO' | 'DESPACHADO' | 'ENTREGADO';
      listoHaceDias?: number | null;
      email?: string;
      entrega?: 'RETIRO' | 'DESPACHO';
    } = {},
  ) => {
    n++;
    return prisma.pedido.create({
      data: {
        token: `t171-${Date.now()}-${n}`,
        canal: 'EN_LINEA',
        estado: datos.estado ?? 'LISTO_PARA_RETIRO',
        entrega: datos.entrega ?? 'RETIRO',
        nombre: 'Camila Rojas',
        email: datos.email ?? `camila${n}${DOMINIO}`,
        telefono: '56987654321',
        totalClp: 249990,
        medioPago: 'WEBPAY',
        documento: 'VOUCHER',
        pagadoEn: new Date(AHORA.getTime() - 10 * DIA),
        listoEn:
          datos.listoHaceDias === null
            ? null
            : new Date(AHORA.getTime() - (datos.listoHaceDias ?? 8) * DIA),
        lineas: {
          create: [
            {
              descripcion: 'Babolat Pure Drive · Grip 2',
              cantidad: 1,
              precioUnitarioClp: 249990,
            },
          ],
        },
      },
    });
  };

  const nuestros = () => enviados.filter((c) => c.para.endsWith(DOMINIO));

  const limpiar = async () => {
    const pedidos = await prisma.pedido.findMany({
      where: { email: { endsWith: DOMINIO } },
      select: { id: true },
    });
    const ids = pedidos.map((p) => p.id);
    await prisma.lineaPedido.deleteMany({ where: { pedidoId: { in: ids } } });
    await prisma.pedido.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnviadorCorreo)
      .useValue(correo)
      .compile();
    app = modulo.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    retiros = app.get(RecordatoriosDeRetiro);
    await limpiar();
  });

  beforeEach(async () => {
    enviados.length = 0;
    // Lo que quedó de otras corridas no cuenta en los topes de estas pruebas.
    await prisma.pedido.updateMany({
      where: {
        estado: 'LISTO_PARA_RETIRO',
        recordatorioRetiroEn: null,
        NOT: { email: { endsWith: DOMINIO } },
      },
      data: { recordatorioRetiroEn: AHORA },
    });
  });

  afterEach(limpiar);

  afterAll(async () => {
    await app.close();
  });

  it('**un pedido listo hace 7 días recibe un recordatorio, y uno solo**', async () => {
    const listo = await pedido({ listoHaceDias: 7 });

    expect(await retiros.correrTanda(AHORA, 50)).toEqual({
      enviados: 1,
      pendientes: 0,
    });
    expect(await retiros.correrTanda(AHORA, 50)).toEqual({
      enviados: 0,
      pendientes: 0,
    });

    expect(nuestros()).toHaveLength(1);
    expect(nuestros()[0]).toMatchObject({ para: listo.email });
    expect(nuestros()[0].asunto).toContain(`N.º ${listo.id}`);
    expect(
      (await prisma.pedido.findUniqueOrThrow({ where: { id: listo.id } }))
        .recordatorioRetiroEn,
    ).not.toBeNull();
  });

  it('listo hace 6 días, todavía no', async () => {
    await pedido({ listoHaceDias: 6 });

    expect(await retiros.correrTanda(AHORA, 50)).toEqual({
      enviados: 0,
      pendientes: 0,
    });
  });

  it('solo lo que espera en el club: ni lo despachado ni lo entregado', async () => {
    await pedido({
      estado: 'DESPACHADO',
      entrega: 'DESPACHO',
      listoHaceDias: null,
    });
    await pedido({ estado: 'ENTREGADO', listoHaceDias: 10 });

    expect(await retiros.correrTanda(AHORA, 50)).toEqual({
      enviados: 0,
      pendientes: 0,
    });
  });

  it('sin correo no hay a quién recordarle: una venta del mesón', async () => {
    await pedido({ email: '' });

    expect(await retiros.correrTanda(AHORA, 50)).toEqual({
      enviados: 0,
      pendientes: 0,
    });
  });

  describe('**el tope por hora es uno para los dos**', () => {
    const cuotasQueMandaron = (enviadas: number) =>
      ({
        correrTanda: jest
          .fn()
          .mockResolvedValue({ enviados: enviadas, pendientes: 0 }),
      }) as unknown as RecordatoriosDeCuota;

    it('lo que mandaron las cuotas se descuenta del tope de los retiros', async () => {
      await pedido();
      await pedido();
      await pedido();

      const corrida = await correrRecordatorios(
        cuotasQueMandaron(2),
        retiros,
        AHORA,
        3,
      );

      expect(corrida.retiro).toEqual({ enviados: 1, pendientes: 2 });
      expect(nuestros()).toHaveLength(1);
    });

    it('si las cuotas se llevaron el tope, los retiros esperan a la próxima corrida', async () => {
      await pedido();

      const corrida = await correrRecordatorios(
        cuotasQueMandaron(3),
        retiros,
        AHORA,
        3,
      );

      expect(corrida.retiro).toEqual({ enviados: 0, pendientes: 1 });
      expect(nuestros()).toHaveLength(0);
    });
  });
});
