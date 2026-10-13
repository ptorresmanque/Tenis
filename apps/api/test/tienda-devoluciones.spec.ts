import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EnviadorCorreo } from '../src/identidad/correo';
import { hashear } from '../src/identidad/contrasena';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T174: cancelar y devolver (`SPEC-tienda.md` § Cancelaciones y devoluciones).
 *
 * **Cancelar** un pedido en línea pagado, antes de entregarlo o despacharlo, anula el pago
 * en Webpay, devuelve el stock y deja el pedido `CANCELADO` **en la misma operación**: si
 * Webpay no deja anular, no cambia nada y el panel ofrece devolver por transferencia.
 *
 * **Devolver** una parte —un retracto, una garantía— se registra con su medio, su monto y
 * su motivo. Repone stock solo si se marca, y no devuelve más de lo que se pagó.
 */
describe('Tienda: cancelar y devolver', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pasarela: PasarelaFake;
  let admin: string;
  let adminId: number;
  let raquetas: number;

  const DOMINIO = '@tienda-t174.test';
  const CONTRASENA = 'raqueta lluviosa 174';
  const MARCA = '[Prueba T174]';
  const COMPRADORA = `camila${DOMINIO}`;

  const enviados: { para: string; asunto: string; cuerpo: string }[] = [];
  const correo = {
    enviar: (mensaje: { para: string; asunto: string; cuerpo: string }) => {
      enviados.push(mensaje);
      return Promise.resolve();
    },
  };

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const producto = async (
    stock: number,
    precioClp = 10000,
    encargo = false,
  ) => {
    const { body } = (await request(servidor())
      .post('/api/admin/tienda/productos')
      .set('Cookie', admin)
      .send({
        nombre: `${MARCA} Pure Drive`,
        categoriaId: raquetas,
        precioClp,
        variantes: [{ etiqueta: 'Grip 2', stock }],
      })
      .expect(201)) as { body: { id: number; variantes: { id: number }[] } };
    await request(servidor())
      .patch(`/api/admin/tienda/productos/${body.id}`)
      .set('Cookie', admin)
      .send({
        publicado: true,
        ...(encargo ? { aceptaEncargo: true, diasEncargo: 7 } : {}),
      })
      .expect(200);

    return { id: body.id, varianteId: body.variantes[0].id };
  };

  /** Un pedido de retiro, pagado con la pasarela de prueba. Devuelve su id. */
  const pedidoPagado = async (varianteId: number, cantidad: number) => {
    const { body: pedido } = (await request(servidor())
      .post('/api/tienda/pedidos')
      .send({
        lineas: [{ varianteId, cantidad }],
        nombre: 'Camila Rojas',
        email: COMPRADORA,
        telefono: '+56 9 8765 4321',
        entrega: 'RETIRO',
      })
      .expect(201)) as { body: { token: string } };
    const { body: pago } = (await request(servidor())
      .post(`/api/tienda/pedidos/${pedido.token}/pagar`)
      .expect(201)) as { body: { tokenPasarela: string } };
    await request(servidor())
      .get(`/api/tienda/pedidos/retorno?token_ws=${pago.tokenPasarela}`)
      .expect(302);

    const { id } = await prisma.pedido.findUniqueOrThrow({
      where: { token: pedido.token },
    });
    enviados.length = 0;

    return id;
  };

  const cancelar = (
    pedidoId: number,
    cuerpo: object = { motivo: 'Lo pidió' },
  ) =>
    request(servidor())
      .post(`/api/admin/tienda/pedidos/${pedidoId}/cancelar`)
      .set('Cookie', admin)
      .send(cuerpo);

  const devolver = (pedidoId: number, cuerpo: object) =>
    request(servidor())
      .post(`/api/admin/tienda/pedidos/${pedidoId}/devoluciones`)
      .set('Cookie', admin)
      .send(cuerpo);

  const marcar = (pedidoId: number, accion: 'listo' | 'entregado') =>
    request(servidor())
      .post(`/api/admin/tienda/pedidos/${pedidoId}/${accion}`)
      .set('Cookie', admin)
      .send({})
      .expect(200);

  const lineaDe = async (pedidoId: number) =>
    prisma.lineaPedido.findFirstOrThrow({ where: { pedidoId } });

  const stock = async (varianteId: number) =>
    (await prisma.variante.findUniqueOrThrow({ where: { id: varianteId } }))
      .stock;

  const transaccionDe = (pedidoId: number) =>
    prisma.transaccion.findFirstOrThrow({
      where: { concepto: 'PEDIDO', conceptoId: pedidoId },
    });

  const limpiar = async () => {
    const pedidos = await prisma.pedido.findMany({
      where: { email: { endsWith: DOMINIO } },
      select: { id: true },
    });
    const idsPedidos = pedidos.map((p) => p.id);
    await prisma.transaccion.deleteMany({
      where: { concepto: 'PEDIDO', conceptoId: { in: idsPedidos } },
    });
    await prisma.devolucion.deleteMany({
      where: { pedidoId: { in: idsPedidos } },
    });
    await prisma.lineaPedido.deleteMany({
      where: { pedidoId: { in: idsPedidos } },
    });
    await prisma.pedido.deleteMany({ where: { id: { in: idsPedidos } } });

    const productos = await prisma.producto.findMany({
      where: { nombre: { startsWith: MARCA } },
      select: { id: true },
    });
    const ids = productos.map((p) => p.id);
    await prisma.movimientoStock.deleteMany({
      where: { variante: { productoId: { in: ids } } },
    });
    await prisma.variante.deleteMany({ where: { productoId: { in: ids } } });
    await prisma.producto.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .overrideProvider(EnviadorCorreo)
      .useValue(correo)
      .compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    pasarela = app.get(PasarelaPago);

    await limpiar();
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    process.env.TIENDA_HABILITADA = 'true';
    adminId = (
      await prisma.usuario.create({
        data: {
          email: `jefa${DOMINIO}`,
          nombre: 'Jefa',
          apellido: 'De Prueba',
          esAdmin: true,
          passwordHash: await hashear(CONTRASENA),
        },
      })
    ).id;
    const sesion = await request(servidor())
      .post('/api/auth/login')
      .send({ email: `jefa${DOMINIO}`, contrasena: CONTRASENA })
      .expect(204);
    admin = (sesion.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
    raquetas = (
      await prisma.categoriaProducto.findUniqueOrThrow({
        where: { nombre: 'Raquetas' },
      })
    ).id;
  });

  beforeEach(() => {
    process.env.TIENDA_HABILITADA = 'true';
    pasarela.reiniciar();
    pasarela.respuesta = 'AUTORIZADA';
    enviados.length = 0;
  });

  afterEach(limpiar);

  afterAll(async () => {
    delete process.env.TIENDA_HABILITADA;
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  describe('cancelar', () => {
    it('**anula el pago en Webpay, devuelve el stock y deja el pedido CANCELADO**', async () => {
      const raqueta = await producto(5);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 2);
      const { tokenPasarela } = await transaccionDe(pedidoId);

      await cancelar(pedidoId, { motivo: 'Se arrepintió' }).expect(200);

      expect(pasarela.anulaciones).toEqual([
        { tokenPasarela, montoClp: 20000 },
      ]);
      expect((await transaccionDe(pedidoId)).estado).toBe('ANULADA');
      expect(
        await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } }),
      ).toMatchObject({
        estado: 'CANCELADO',
        canceladoPorId: adminId,
        motivoCancelacion: 'Se arrepintió',
      });
      expect(await stock(raqueta.varianteId)).toBe(5);
      const anulacion = await prisma.movimientoStock.findFirstOrThrow({
        where: { varianteId: raqueta.varianteId, motivo: 'ANULACION' },
      });
      expect(anulacion.cantidad).toBe(2);

      const { body } = (await request(servidor())
        .get(`/api/admin/tienda/pedidos/${pedidoId}`)
        .set('Cookie', admin)
        .expect(200)) as { body: { devoluciones: object[] } };
      expect(body.devoluciones).toEqual([
        expect.objectContaining({
          montoClp: 20000,
          medio: 'WEBPAY',
          reponeStock: true,
          motivo: 'Se arrepintió',
        }),
      ]);
    });

    it('un pedido listo para retirar también se cancela', async () => {
      const raqueta = await producto(5);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 1);
      await marcar(pedidoId, 'listo');

      await cancelar(pedidoId).expect(200);

      expect(pasarela.anulaciones).toHaveLength(1);
    });

    it('al comprador le llega cuánto se devuelve y por qué medio', async () => {
      const raqueta = await producto(5, 249990);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 1);

      await cancelar(pedidoId).expect(200);

      const alComprador = enviados.filter((c) => c.para === COMPRADORA);
      expect(alComprador).toHaveLength(1);
      expect(alComprador[0].asunto).toBe(
        `Cancelamos tu pedido N.º ${pedidoId}`,
      );
      expect(alComprador[0].cuerpo).toContain('$249.990');
      expect(alComprador[0].cuerpo).toContain('Webpay');
    });

    it('**si Webpay no deja anular, no cambia nada y lo dice**', async () => {
      const raqueta = await producto(5);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 2);
      pasarela.fallarAlAnular = true;

      const { body } = (await cancelar(pedidoId).expect(502)) as {
        body: { message: string };
      };

      expect(body.message).toContain('transferencia');
      expect(
        (await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } }))
          .estado,
      ).toBe('PAGADO');
      expect((await transaccionDe(pedidoId)).estado).toBe('AUTORIZADA');
      expect(await stock(raqueta.varianteId)).toBe(3);
      expect(await prisma.devolucion.count({ where: { pedidoId } })).toBe(0);
      expect(enviados).toHaveLength(0);
    });

    it('**cancelar y devolver por transferencia**: el pago de Webpay queda como está', async () => {
      const raqueta = await producto(5);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 2);

      await cancelar(pedidoId, {
        motivo: 'Webpay no dejó anular',
        medio: 'TRANSFERENCIA',
      }).expect(200);

      expect(pasarela.anulaciones).toHaveLength(0);
      expect((await transaccionDe(pedidoId)).estado).toBe('AUTORIZADA');
      expect(
        (await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } }))
          .estado,
      ).toBe('CANCELADO');
      expect(await stock(raqueta.varianteId)).toBe(5);
      expect(
        await prisma.devolucion.findFirstOrThrow({ where: { pedidoId } }),
      ).toMatchObject({ medio: 'TRANSFERENCIA', montoClp: 20000 });
      expect(enviados.find((c) => c.para === COMPRADORA)?.cuerpo).toContain(
        'transferencia',
      );
    });

    it('**cancelar el pedido de un encargo revierte el stock negativo**', async () => {
      const zapatilla = await producto(0, 10000, true);
      const pedidoId = await pedidoPagado(zapatilla.varianteId, 1);
      expect(await stock(zapatilla.varianteId)).toBe(-1);

      await cancelar(pedidoId).expect(200);

      expect(await stock(zapatilla.varianteId)).toBe(0);
    });

    it('un pedido entregado no se cancela: se registra una devolución', async () => {
      const raqueta = await producto(5);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 1);
      await marcar(pedidoId, 'listo');
      await marcar(pedidoId, 'entregado');

      const { body } = (await cancelar(pedidoId).expect(409)) as {
        body: { message: string };
      };

      expect(body.message).toContain('devolución');
      expect(pasarela.anulaciones).toHaveLength(0);
    });

    it('**dos cancelaciones a la vez anulan una sola vez**', async () => {
      const raqueta = await producto(5);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 2);

      const respuestas = await Promise.all([
        cancelar(pedidoId),
        cancelar(pedidoId),
      ]);

      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(pasarela.anulaciones).toHaveLength(1);
      expect(await stock(raqueta.varianteId)).toBe(5);
      expect(await prisma.devolucion.count({ where: { pedidoId } })).toBe(1);
    });

    it('**con una devolución ya registrada no se cancela**: se devolvería dos veces', async () => {
      const raqueta = await producto(5);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 2);
      const linea = await lineaDe(pedidoId);
      await devolver(pedidoId, {
        lineas: [{ lineaId: linea.id, cantidad: 1 }],
        montoClp: 10000,
        medio: 'TRANSFERENCIA',
        reponeStock: true,
        motivo: 'Retracto de una',
      }).expect(201);

      await cancelar(pedidoId).expect(409);

      expect(pasarela.anulaciones).toHaveLength(0);
    });

    it('sin motivo no se cancela', async () => {
      const raqueta = await producto(5);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 1);

      await cancelar(pedidoId, { motivo: '  ' }).expect(400);
    });

    it('un pedido que no existe responde 404', async () => {
      await cancelar(999999999).expect(404);
    });
  });

  describe('devolver una parte', () => {
    it('**repone stock solo si se marca**', async () => {
      const raqueta = await producto(5);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 2);
      const linea = await lineaDe(pedidoId);
      const una = (reponeStock: boolean, motivo: string) =>
        devolver(pedidoId, {
          lineas: [{ lineaId: linea.id, cantidad: 1 }],
          montoClp: 10000,
          medio: 'EFECTIVO',
          reponeStock,
          motivo,
        }).expect(201);

      await una(false, 'Venía fallada');
      expect(await stock(raqueta.varianteId)).toBe(3);

      await una(true, 'Retracto');
      expect(await stock(raqueta.varianteId)).toBe(4);
      const devuelta = await prisma.movimientoStock.findFirstOrThrow({
        where: { varianteId: raqueta.varianteId, motivo: 'DEVOLUCION' },
      });
      expect(devuelta.cantidad).toBe(1);
      expect((await lineaDe(pedidoId)).cantidadDevuelta).toBe(2);
      expect(
        (await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } }))
          .estado,
      ).toBe('PAGADO');
    });

    it('**el monto no puede superar lo pagado por esas unidades**', async () => {
      const raqueta = await producto(5);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 2);
      const linea = await lineaDe(pedidoId);
      const conMonto = (montoClp: number) =>
        devolver(pedidoId, {
          lineas: [{ lineaId: linea.id, cantidad: 1 }],
          montoClp,
          medio: 'TRANSFERENCIA',
          reponeStock: true,
          motivo: 'Garantía',
        });

      const { body } = (await conMonto(10001).expect(400)) as {
        body: { message: string };
      };
      expect(body.message).toContain('$10.000');

      await conMonto(10000).expect(201);
    });

    it('una unidad no se devuelve dos veces', async () => {
      const raqueta = await producto(5);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 1);
      const linea = await lineaDe(pedidoId);
      const todo = () =>
        devolver(pedidoId, {
          lineas: [{ lineaId: linea.id, cantidad: 1 }],
          montoClp: 10000,
          medio: 'TRANSFERENCIA',
          reponeStock: true,
          motivo: 'Retracto',
        });

      await todo().expect(201);
      await todo().expect(409);
    });

    it('se devuelve también después de entregar, y le llega el correo', async () => {
      const raqueta = await producto(5, 249990);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 1);
      await marcar(pedidoId, 'listo');
      await marcar(pedidoId, 'entregado');
      enviados.length = 0;
      const linea = await lineaDe(pedidoId);

      await devolver(pedidoId, {
        lineas: [{ lineaId: linea.id, cantidad: 1 }],
        montoClp: 100000,
        medio: 'TRANSFERENCIA',
        reponeStock: false,
        motivo: 'Garantía: el marco llegó trizado',
      }).expect(201);

      const alComprador = enviados.filter((c) => c.para === COMPRADORA);
      expect(alComprador).toHaveLength(1);
      expect(alComprador[0].asunto).toBe(
        `Te devolvemos $100.000 del pedido N.º ${pedidoId}`,
      );
      expect(alComprador[0].cuerpo).toContain('transferencia');
    });

    it('lo que no se pagó no se devuelve', async () => {
      const raqueta = await producto(5);
      const { body: pedido } = (await request(servidor())
        .post('/api/tienda/pedidos')
        .send({
          lineas: [{ varianteId: raqueta.varianteId, cantidad: 1 }],
          nombre: 'Camila Rojas',
          email: COMPRADORA,
          telefono: '+56 9 8765 4321',
          entrega: 'RETIRO',
        })
        .expect(201)) as { body: { token: string } };
      const { id } = await prisma.pedido.findUniqueOrThrow({
        where: { token: pedido.token },
      });
      const linea = await lineaDe(id);

      await devolver(id, {
        lineas: [{ lineaId: linea.id, cantidad: 1 }],
        montoClp: 10000,
        medio: 'TRANSFERENCIA',
        reponeStock: true,
        motivo: 'Retracto',
      }).expect(409);
    });

    it.each([
      ['sin líneas', { lineas: [] }],
      ['una cantidad de cero', { lineas: [{ lineaId: 1, cantidad: 0 }] }],
      ['por Webpay', { medio: 'WEBPAY' }],
      ['sin motivo', { motivo: '' }],
      ['un monto de cero', { montoClp: 0 }],
      ['sin decir si repone stock', { reponeStock: undefined }],
    ])('%s responde 400', async (_caso, cambio) => {
      const raqueta = await producto(5);
      const pedidoId = await pedidoPagado(raqueta.varianteId, 1);
      const linea = await lineaDe(pedidoId);

      await devolver(pedidoId, {
        lineas: [{ lineaId: linea.id, cantidad: 1 }],
        montoClp: 10000,
        medio: 'TRANSFERENCIA',
        reponeStock: true,
        motivo: 'Retracto',
        ...cambio,
      }).expect(400);
    });
  });
});
