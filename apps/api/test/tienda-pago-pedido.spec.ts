import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EnviadorCorreo } from '../src/identidad/correo';
import { hashear } from '../src/identidad/contrasena';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { MINUTOS_PARA_EXPIRAR } from '../src/pagos/expiracion';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T165: pagar el pedido con Webpay y confirmarlo.
 *
 * La vuelta confirma con el efecto, **una sola vez**: el pedido pasa a `PAGADO` y cada
 * línea deja su venta en el stock. Un pago rechazado o anulado **suelta el pedido** y sus
 * unidades al tiro, sin esperar los 15 minutos. Un pago que llega tarde, con la unidad
 * ya vendida, se confirma igual —la plata ya se cobró—, deja el pedido en revisión y le
 * avisa al club (`SPEC-tienda.md` § Disponibilidad).
 */
describe('Tienda: pagar el pedido', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pasarela: PasarelaFake;
  let admin: string;
  let raquetas: number;
  let correoDelClubAntes: string;

  const DOMINIO = '@tienda-t165.test';
  const CONTRASENA = 'raqueta lluviosa 165';
  const MARCA = '[Prueba T165]';
  const CORREO_DEL_CLUB = `club${DOMINIO}`;

  const enviados: { para: string; asunto: string; cuerpo: string }[] = [];
  const correo = {
    enviar: (mensaje: { para: string; asunto: string; cuerpo: string }) => {
      enviados.push(mensaje);
      return Promise.resolve();
    },
  };

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  /** Un producto publicado con una variante. */
  const producto = async (nombre: string, stock: number, precioClp = 10000) => {
    const { body } = (await request(servidor())
      .post('/api/admin/tienda/productos')
      .set('Cookie', admin)
      .send({
        nombre: `${MARCA} ${nombre}`,
        categoriaId: raquetas,
        precioClp,
        variantes: [{ etiqueta: 'Grip 2', stock }],
      })
      .expect(201)) as { body: { id: number; variantes: { id: number }[] } };
    await request(servidor())
      .patch(`/api/admin/tienda/productos/${body.id}`)
      .set('Cookie', admin)
      .send({ publicado: true })
      .expect(200);

    return { id: body.id, varianteId: body.variantes[0].id };
  };

  const crearPedido = async (varianteId: number, cantidad = 1) => {
    const { body } = (await request(servidor())
      .post('/api/tienda/pedidos')
      .send({
        lineas: [{ varianteId, cantidad }],
        nombre: 'Camila Rojas',
        email: `camila${DOMINIO}`,
        telefono: '+56 9 8765 4321',
        entrega: 'RETIRO',
      })
      .expect(201)) as { body: { token: string; totalClp: number } };

    return body;
  };

  const pagar = async (token: string) => {
    const { body } = (await request(servidor())
      .post(`/api/tienda/pedidos/${token}/pagar`)
      .expect(201)) as {
      body: { totalClp: number; urlRedireccion: string; tokenPasarela: string };
    };

    return body;
  };

  const volver = (consulta: string) =>
    request(servidor())
      .get(`/api/tienda/pedidos/retorno?${consulta}`)
      .expect(302);

  /** La `referencia` que Webpay devuelve como `TBK_ORDEN_COMPRA`. */
  const ordenDeCompra = async (tokenPasarela: string) =>
    (await prisma.transaccion.findUniqueOrThrow({ where: { tokenPasarela } }))
      .referencia;

  const pedido = (token: string) =>
    prisma.pedido.findUniqueOrThrow({ where: { token } });

  const stock = async (varianteId: number) =>
    (await prisma.variante.findUniqueOrThrow({ where: { id: varianteId } }))
      .stock;

  const disponible = async (productoId: number) => {
    const { body } = (await request(servidor())
      .get(`/api/tienda/productos/${productoId}`)
      .expect(200)) as { body: { variantes: { disponible: number }[] } };

    return body.variantes[0].disponible;
  };

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
    await prisma.transaccion.deleteMany({
      where: { tokenPasarela: `ajeno${DOMINIO}` },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    // Los avisos al club van al correo de "Datos del club" (SPEC-tienda.md § Correos).
    const club = await prisma.configuracionClub.findFirstOrThrow();
    correoDelClubAntes = club.email;
    await prisma.configuracionClub.update({
      where: { id: club.id },
      data: { email: CORREO_DEL_CLUB },
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
    await prisma.transaccion.deleteMany({
      where: { tokenPasarela: `ajeno${DOMINIO}` },
    });
    await prisma.configuracionClub.updateMany({
      data: { email: correoDelClubAntes },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  describe('iniciar el pago', () => {
    it('**cobra el total del pedido**, que calculó el servidor', async () => {
      const raqueta = await producto('Pure Drive', 3, 249990);
      const { token } = await crearPedido(raqueta.varianteId);

      const pago = await pagar(token);

      expect(pago.totalClp).toBe(249990);
      expect(pago.urlRedireccion).toContain('pasarela.local');
      expect(pasarela.ordenes.at(-1)?.montoClp).toBe(249990);
    });

    it('un pedido vencido no se paga: hay que volver al carrito', async () => {
      const raqueta = await producto('Pure Drive', 3);
      const { token } = await crearPedido(raqueta.varianteId);
      await prisma.pedido.update({
        where: { token },
        data: {
          creadoEn: new Date(Date.now() - (MINUTOS_PARA_EXPIRAR + 1) * 60_000),
        },
      });

      const { body } = (await request(servidor())
        .post(`/api/tienda/pedidos/${token}/pagar`)
        .expect(409)) as { body: { message: string } };

      expect(body.message).toContain('vuelve al carrito');
    });

    it('un enlace que no es de ningún pedido responde 404', async () => {
      await request(servidor())
        .post('/api/tienda/pedidos/00000000-0000-4000-8000-000000000000/pagar')
        .expect(404);
    });

    it('con la tienda apagada, responde 404', async () => {
      process.env.TIENDA_HABILITADA = 'false';

      await request(servidor())
        .post('/api/tienda/pedidos/00000000-0000-4000-8000-000000000000/pagar')
        .expect(404);
    });
  });

  describe('la vuelta con el pago autorizado', () => {
    it('**el pedido queda pagado y el stock baja con su movimiento de venta**', async () => {
      const raqueta = await producto('Pure Drive', 3);
      const { token } = await crearPedido(raqueta.varianteId, 2);
      const pago = await pagar(token);

      const vuelta = await volver(`token_ws=${pago.tokenPasarela}`);

      expect(vuelta.headers.location).toMatch(
        new RegExp(`/tienda/pedido/${token}\\?pago=listo$`),
      );
      expect(await pedido(token)).toMatchObject({
        estado: 'PAGADO',
        requiereRevision: false,
      });
      expect((await pedido(token)).pagadoEn).not.toBeNull();
      expect(await stock(raqueta.varianteId)).toBe(1);
      const movimientos = await prisma.movimientoStock.findMany({
        where: { varianteId: raqueta.varianteId, motivo: 'VENTA' },
      });
      expect(movimientos.map((m) => m.cantidad)).toEqual([-2]);
    });

    it('**el comprador recibe el detalle y las condiciones de venta; el club, el aviso**', async () => {
      const raqueta = await producto('Pure Drive', 3);
      const { token } = await crearPedido(raqueta.varianteId);
      const pago = await pagar(token);

      await volver(`token_ws=${pago.tokenPasarela}`);

      const alComprador = enviados.filter((c) => c.para === `camila${DOMINIO}`);
      const alClub = enviados.filter((c) => c.para === CORREO_DEL_CLUB);
      expect(alComprador).toHaveLength(1);
      expect(alComprador[0].cuerpo).toContain('Condiciones de venta');
      expect(alComprador[0].cuerpo).toContain(`/tienda/pedido/${token}`);
      expect(alClub).toHaveLength(1);
      expect(alClub[0].asunto).toContain('Pedido nuevo');
    });

    it('**el callback duplicado no descuenta dos veces ni repite los correos**', async () => {
      const raqueta = await producto('Pure Drive', 3);
      const { token } = await crearPedido(raqueta.varianteId);
      const pago = await pagar(token);

      await Promise.all([
        volver(`token_ws=${pago.tokenPasarela}`),
        volver(`token_ws=${pago.tokenPasarela}`),
      ]);
      await volver(`token_ws=${pago.tokenPasarela}`);

      expect(await stock(raqueta.varianteId)).toBe(2);
      expect(
        enviados.filter((c) => c.para === `camila${DOMINIO}`),
      ).toHaveLength(1);
    });

    it('**un pago que llega tarde, con la unidad ya vendida, se confirma y queda en revisión**', async () => {
      const raqueta = await producto('Pure Drive', 1);
      const tarde = await crearPedido(raqueta.varianteId);
      const pagoTarde = await pagar(tarde.token);
      // Pasan los 15 minutos: la unidad vuelve a estar disponible y otro la compra.
      await prisma.pedido.update({
        where: { token: tarde.token },
        data: {
          creadoEn: new Date(Date.now() - (MINUTOS_PARA_EXPIRAR + 1) * 60_000),
        },
      });
      const otro = await crearPedido(raqueta.varianteId);
      await volver(`token_ws=${(await pagar(otro.token)).tokenPasarela}`);
      enviados.length = 0;

      const vuelta = await volver(`token_ws=${pagoTarde.tokenPasarela}`);

      expect(vuelta.headers.location).toContain('pago=listo');
      expect(await pedido(tarde.token)).toMatchObject({
        estado: 'PAGADO',
        requiereRevision: true,
      });
      expect(await stock(raqueta.varianteId)).toBe(-1);
      const alClub = enviados.filter((c) => c.para === CORREO_DEL_CLUB);
      expect(alClub).toHaveLength(1);
      expect(alClub[0].asunto).toContain('Pedido en revisión');
      expect(alClub[0].cuerpo).toContain('quedó en −1');
    });
  });

  describe('la vuelta sin pagar', () => {
    it('**rechazado: suelta el pedido y sus unidades al tiro**', async () => {
      const raqueta = await producto('Pure Drive', 1);
      const { token } = await crearPedido(raqueta.varianteId);
      const pago = await pagar(token);
      expect(await disponible(raqueta.id)).toBe(0);
      pasarela.respuesta = 'RECHAZADA';

      const vuelta = await volver(`token_ws=${pago.tokenPasarela}`);

      expect(vuelta.headers.location).toMatch(
        /\/tienda\/carrito\?pago=rechazado$/,
      );
      expect((await pedido(token)).estado).toBe('EXPIRADO');
      expect(await disponible(raqueta.id)).toBe(1);
      expect(await stock(raqueta.varianteId)).toBe(1);
      expect(enviados).toHaveLength(0);
    });

    it('**anulado en Webpay: también suelta el pedido**, y quien reintenta no choca consigo mismo', async () => {
      const raqueta = await producto('Pure Drive', 1);
      const { token } = await crearPedido(raqueta.varianteId);
      const pago = await pagar(token);

      const vuelta = await volver(
        `TBK_TOKEN=${pago.tokenPasarela}&TBK_ORDEN_COMPRA=${await ordenDeCompra(pago.tokenPasarela)}`,
      );

      expect(vuelta.headers.location).toMatch(
        /\/tienda\/carrito\?pago=anulado$/,
      );
      expect((await pedido(token)).estado).toBe('EXPIRADO');
      await crearPedido(raqueta.varianteId);
    });

    it('un pedido suelto ya no se puede pagar', async () => {
      const raqueta = await producto('Pure Drive', 1);
      const { token } = await crearPedido(raqueta.varianteId);
      const pago = await pagar(token);
      await volver(
        `TBK_TOKEN=${pago.tokenPasarela}&TBK_ORDEN_COMPRA=${await ordenDeCompra(pago.tokenPasarela)}`,
      );

      await request(servidor())
        .post(`/api/tienda/pedidos/${token}/pagar`)
        .expect(409);
    });

    it('**el formulario de Webpay vencido**, que vuelve sin token, también lo suelta', async () => {
      const raqueta = await producto('Pure Drive', 1);
      const { token } = await crearPedido(raqueta.varianteId);
      const pago = await pagar(token);

      await volver(
        `TBK_ORDEN_COMPRA=${await ordenDeCompra(pago.tokenPasarela)}&TBK_ID_SESION=x`,
      );

      expect((await pedido(token)).estado).toBe('EXPIRADO');
    });

    it('**el token de un pago que no es de la tienda no toca nada**', async () => {
      const ajena = await prisma.transaccion.create({
        data: {
          referencia: `ajena${Date.now()}`.slice(0, 26),
          concepto: 'CUOTA',
          conceptoId: 1,
          montoClp: 25000,
          pasarela: 'doble',
          tokenPasarela: `ajeno${DOMINIO}`,
        },
      });

      const vuelta = await volver(`token_ws=${ajena.tokenPasarela}`);

      expect(vuelta.headers.location).toMatch(
        /\/tienda\/carrito\?pago=invalido$/,
      );
      expect(
        (
          await prisma.transaccion.findUniqueOrThrow({
            where: { id: ajena.id },
          })
        ).estado,
      ).toBe('PENDIENTE');
    });
  });
});
