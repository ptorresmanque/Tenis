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
 * T173: el aviso de stock bajo (`SPEC-tienda.md` § Correos y criterio 12).
 *
 * Cuando un movimiento deja una variante en el umbral o menos, el club recibe **un**
 * aviso: qué variante y cuánto queda. La venta siguiente no manda otro. Lo rearma un
 * movimiento que la deja sobre el umbral, como una entrada de mercadería.
 */
describe('Tienda: el aviso de stock bajo', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let raquetas: number;
  let antes: { email: string; umbralStockBajo: number };

  const DOMINIO = '@tienda-t173.test';
  const CONTRASENA = 'raqueta lluviosa 173';
  const MARCA = '[Prueba T173]';
  const CORREO_DEL_CLUB = `club${DOMINIO}`;

  const enviados: { para: string; asunto: string; cuerpo: string }[] = [];
  const correo = {
    enviar: (mensaje: { para: string; asunto: string; cuerpo: string }) => {
      enviados.push(mensaje);
      return Promise.resolve();
    },
  };
  const avisos = () =>
    enviados.filter(
      (c) => c.para === CORREO_DEL_CLUB && c.asunto.startsWith('Stock bajo'),
    );

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const producto = async (stock: number) => {
    const { body } = (await request(servidor())
      .post('/api/admin/tienda/productos')
      .set('Cookie', admin)
      .send({
        nombre: `${MARCA} Pure Drive`,
        categoriaId: raquetas,
        precioClp: 10000,
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

  /** Una compra en línea, pagada de punta a punta con la pasarela de prueba. */
  const vender = async (varianteId: number, cantidad: number) => {
    const { body: pedido } = (await request(servidor())
      .post('/api/tienda/pedidos')
      .send({
        lineas: [{ varianteId, cantidad }],
        nombre: 'Camila Rojas',
        email: `camila${DOMINIO}`,
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
  };

  /** Una entrada o un ajuste desde el panel. */
  const mover = (varianteId: number, cantidad: number) =>
    request(servidor())
      .post(`/api/admin/tienda/variantes/${varianteId}/movimientos`)
      .set('Cookie', admin)
      .send(
        cantidad > 0
          ? { motivo: 'ENTRADA', cantidad }
          : { motivo: 'AJUSTE', cantidad, nota: 'Conteo' },
      )
      .expect(201);

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

    await limpiar();
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    antes = await prisma.configuracionClub.findFirstOrThrow({
      select: { email: true, umbralStockBajo: true },
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

  beforeEach(async () => {
    process.env.TIENDA_HABILITADA = 'true';
    await prisma.configuracionClub.updateMany({
      data: { email: CORREO_DEL_CLUB, umbralStockBajo: 2 },
    });
    enviados.length = 0;
  });

  afterEach(limpiar);

  afterAll(async () => {
    delete process.env.TIENDA_HABILITADA;
    await prisma.configuracionClub.updateMany({ data: antes });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  it('**una venta que cruza el umbral avisa al club, y la siguiente no**', async () => {
    const raqueta = await producto(4);

    await vender(raqueta.varianteId, 2);
    expect(avisos()).toHaveLength(1);

    await vender(raqueta.varianteId, 1);
    expect(avisos()).toHaveLength(1);
  });

  it('el aviso dice qué variante, cuánto queda y dónde verla en el panel', async () => {
    const raqueta = await producto(4);

    await vender(raqueta.varianteId, 3);

    const [aviso] = avisos();
    expect(aviso.asunto).toBe(`Stock bajo: ${MARCA} Pure Drive · Grip 2`);
    expect(aviso.cuerpo).toContain(`${MARCA} Pure Drive · Grip 2: 1 en stock`);
    expect(aviso.cuerpo).toContain(
      `/administracion/tienda/productos/${raqueta.id}`,
    );
  });

  it('una venta que deja la variante sobre el umbral no avisa', async () => {
    const raqueta = await producto(5);

    await vender(raqueta.varianteId, 2);

    expect(avisos()).toHaveLength(0);
  });

  it('**una entrada que la deja sobre el umbral rearma el aviso**', async () => {
    const raqueta = await producto(3);

    await mover(raqueta.varianteId, -1);
    expect(avisos()).toHaveLength(1);

    await mover(raqueta.varianteId, 5);
    await mover(raqueta.varianteId, -5);
    expect(avisos()).toHaveLength(2);
  });

  it('una entrada que la deja todavía en el umbral no lo rearma', async () => {
    const raqueta = await producto(3);

    await mover(raqueta.varianteId, -2);
    await mover(raqueta.varianteId, 1);
    await mover(raqueta.varianteId, -1);

    expect(avisos()).toHaveLength(1);
  });

  it('una variante que nace con poco stock no avisa: la cargó el club', async () => {
    await producto(1);

    expect(avisos()).toHaveLength(0);
  });
});
