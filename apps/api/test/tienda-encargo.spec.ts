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
 * T170: la venta por encargo (`SPEC-tienda.md` § Retiro y despacho, decisiones 34 y 35).
 *
 * El producto que acepta encargo se vende sin stock, con "llega en N días" y **solo con
 * retiro**. El pago deja la variante en −1 —"le debemos uno a alguien"— sin mandar el pedido
 * a revisión, y la entrada que llega lo deja en 0: la unidad es de quien la encargó, no
 * vuelve a la venta.
 */
describe('Tienda: la venta por encargo', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pasarela: PasarelaFake;
  let admin: string;
  let raquetas: number;

  const DOMINIO = '@tienda-t170.test';
  const CONTRASENA = 'raqueta lluviosa 170';
  const MARCA = '[Prueba T170]';

  const enviados: { para: string; asunto: string }[] = [];
  const correo = {
    enviar: (mensaje: { para: string; asunto: string }) => {
      enviados.push(mensaje);
      return Promise.resolve();
    },
  };

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  /** Un producto publicado sin stock, con o sin encargo. */
  const producto = async (encargo: { dias: number } | null, stock = 0) => {
    const { body } = (await request(servidor())
      .post('/api/admin/tienda/productos')
      .set('Cookie', admin)
      .send({
        nombre: `${MARCA} Gel Resolution`,
        categoriaId: raquetas,
        precioClp: 129990,
        variantes: [{ etiqueta: '40', stock }],
      })
      .expect(201)) as { body: { id: number; variantes: { id: number }[] } };
    await request(servidor())
      .patch(`/api/admin/tienda/productos/${body.id}`)
      .set('Cookie', admin)
      .send({
        publicado: true,
        ...(encargo ? { aceptaEncargo: true, diasEncargo: encargo.dias } : {}),
      })
      .expect(200);

    return { id: body.id, varianteId: body.variantes[0].id };
  };

  const cotizar = async (varianteId: number, cantidad = 1) =>
    (
      (await request(servidor())
        .post('/api/tienda/carrito/cotizar')
        .send({ lineas: [{ varianteId, cantidad }] })
        .expect(200)) as {
        body: {
          lineas: {
            estado: string;
            porEncargo: boolean;
            diasEncargo: number | null;
            disponible: number;
          }[];
          sePuedePagar: boolean;
          sePuedeDespachar: boolean;
        };
      }
    ).body;

  const crearPedido = (varianteId: number, entrega: 'RETIRO' | 'DESPACHO') =>
    request(servidor())
      .post('/api/tienda/pedidos')
      .send({
        lineas: [{ varianteId, cantidad: 1 }],
        nombre: 'Camila Rojas',
        email: `camila${DOMINIO}`,
        telefono: '+56 9 8765 4321',
        entrega,
        despacho:
          entrega === 'DESPACHO'
            ? {
                region: 'La Araucanía',
                comuna: 'Temuco',
                direccion: 'Los Aromos 345',
              }
            : undefined,
      });

  /** Crea el pedido con retiro y lo paga con el doble de la pasarela. */
  const comprarYPagar = async (varianteId: number) => {
    const { body } = (await crearPedido(varianteId, 'RETIRO').expect(201)) as {
      body: { token: string };
    };
    const { body: pago } = (await request(servidor())
      .post(`/api/tienda/pedidos/${body.token}/pagar`)
      .expect(201)) as { body: { tokenPasarela: string } };
    await request(servidor())
      .get(`/api/tienda/pedidos/retorno?token_ws=${pago.tokenPasarela}`)
      .expect(302);

    return prisma.pedido.findUniqueOrThrow({
      where: { token: body.token },
      include: { lineas: true },
    });
  };

  const stock = async (varianteId: number) =>
    (await prisma.variante.findUniqueOrThrow({ where: { id: varianteId } }))
      .stock;

  const limpiar = async () => {
    const pedidos = await prisma.pedido.findMany({
      where: { email: { endsWith: DOMINIO } },
      select: { id: true },
    });
    const idsPedidos = pedidos.map((p) => p.id);
    await prisma.transaccion.deleteMany({
      where: { concepto: 'PEDIDO', conceptoId: { in: idsPedidos } },
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
    await prisma.usuario.create({
      data: {
        email: `jefa${DOMINIO}`,
        nombre: 'Jefa',
        apellido: 'De Prueba',
        esAdmin: true,
        passwordHash: await hashear(CONTRASENA),
      },
    });
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

  describe('en el panel', () => {
    it('**aceptar encargo exige decir en cuántos días llega**', async () => {
      const { id } = await producto(null);

      await request(servidor())
        .patch(`/api/admin/tienda/productos/${id}`)
        .set('Cookie', admin)
        .send({ aceptaEncargo: true })
        .expect(400);
      await request(servidor())
        .patch(`/api/admin/tienda/productos/${id}`)
        .set('Cookie', admin)
        .send({ aceptaEncargo: true, diasEncargo: 0 })
        .expect(400);
      await request(servidor())
        .patch(`/api/admin/tienda/productos/${id}`)
        .set('Cookie', admin)
        .send({ aceptaEncargo: true, diasEncargo: 7 })
        .expect(200);

      expect(
        await prisma.producto.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({
        aceptaEncargo: true,
        diasEncargo: 7,
      });
    });

    it('dejar de aceptar encargo borra los días', async () => {
      const { id } = await producto({ dias: 7 });

      await request(servidor())
        .patch(`/api/admin/tienda/productos/${id}`)
        .set('Cookie', admin)
        .send({ aceptaEncargo: false })
        .expect(200);

      expect(
        await prisma.producto.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({
        aceptaEncargo: false,
        diasEncargo: null,
      });
    });
  });

  describe('en la tienda', () => {
    it('**sin stock y con encargo, la ficha dice en cuántos días llega**', async () => {
      const { id } = await producto({ dias: 7 });

      const { body } = (await request(servidor())
        .get(`/api/tienda/productos/${id}`)
        .expect(200)) as {
        body: { aceptaEncargo: boolean; diasEncargo: number };
      };

      expect(body).toMatchObject({ aceptaEncargo: true, diasEncargo: 7 });
    });

    it('en la lista, lo que se vende por encargo no está agotado', async () => {
      const conEncargo = await producto({ dias: 7 });
      const sinEncargo = await producto(null);

      const { body } = (await request(servidor())
        .get('/api/tienda/productos')
        .expect(200)) as {
        body: { id: number; agotado: boolean; porEncargo: boolean }[];
      };

      expect(body.find((p) => p.id === conEncargo.id)).toMatchObject({
        agotado: false,
        porEncargo: true,
      });
      expect(body.find((p) => p.id === sinEncargo.id)).toMatchObject({
        agotado: true,
        porEncargo: false,
      });
    });

    it('**el carrito lo cotiza por encargo y no ofrece despacho**', async () => {
      const { varianteId } = await producto({ dias: 7 });

      const cotizacion = await cotizar(varianteId);

      expect(cotizacion.lineas[0]).toMatchObject({
        estado: 'ok',
        porEncargo: true,
        diasEncargo: 7,
      });
      expect(cotizacion.sePuedePagar).toBe(true);
      expect(cotizacion.sePuedeDespachar).toBe(false);
    });

    it('sin encargo, lo que no queda sigue sin poder pedirse', async () => {
      const { varianteId } = await producto(null);

      const cotizacion = await cotizar(varianteId);

      expect(cotizacion.lineas[0]).toMatchObject({
        estado: 'sin-stock',
        porEncargo: false,
      });
      expect(cotizacion.sePuedeDespachar).toBe(true);
    });
  });

  describe('el pedido', () => {
    it('**con algo por encargo, el despacho responde 409**: se retira en el club', async () => {
      const { varianteId } = await producto({ dias: 7 });

      const { body } = (await crearPedido(varianteId, 'DESPACHO').expect(
        409,
      )) as {
        body: { message: string };
      };

      expect(body.message).toContain('se retira en el club');
    });

    it('**pagado, deja la variante en −1 y no va a revisión**', async () => {
      const { varianteId } = await producto({ dias: 7 });

      const pedido = await comprarYPagar(varianteId);

      expect(pedido).toMatchObject({
        estado: 'PAGADO',
        requiereRevision: false,
      });
      expect(pedido.lineas[0].esEncargo).toBe(true);
      expect(await stock(varianteId)).toBe(-1);
    });

    it('**la entrada que llega lo deja en 0 y la unidad no vuelve a la venta**; listo, sale el correo', async () => {
      const { id, varianteId } = await producto({ dias: 7 });
      const pedido = await comprarYPagar(varianteId);

      await request(servidor())
        .post(`/api/admin/tienda/variantes/${varianteId}/movimientos`)
        .set('Cookie', admin)
        .send({ motivo: 'ENTRADA', cantidad: 1 })
        .expect(201);

      expect(await stock(varianteId)).toBe(0);
      const { body } = (await request(servidor())
        .get(`/api/tienda/productos/${id}`)
        .expect(200)) as { body: { variantes: { disponible: number }[] } };
      expect(body.variantes[0].disponible).toBe(0);

      enviados.length = 0;
      await request(servidor())
        .post(`/api/admin/tienda/pedidos/${pedido.id}/listo`)
        .set('Cookie', admin)
        .expect(200);
      expect(enviados.map((c) => c.asunto)).toEqual([
        `Tu pedido N.º ${pedido.id} está listo para retirar`,
      ]);
    });

    it('con stock, aunque acepte encargo, se vende del stock: no es encargo', async () => {
      const { varianteId } = await producto({ dias: 7 }, 3);

      const pedido = await comprarYPagar(varianteId);

      expect(pedido.lineas[0].esEncargo).toBe(false);
      expect(await stock(varianteId)).toBe(2);
    });
  });
});
