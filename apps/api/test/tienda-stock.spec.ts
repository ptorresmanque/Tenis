import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';
import { moverStock } from '../src/tienda/stock';

/**
 * T160: entradas de mercadería, ajustes y la lista de movimientos de una variante.
 *
 * Desde el panel se registran **entradas y ajustes**, nada más: las ventas, las
 * devoluciones y las anulaciones llegan solas desde sus flujos. Un ajuste sin nota no
 * existe. Y lo que sostiene todo: **la suma de los movimientos de una variante es su
 * stock**, así que "no me cuadra" siempre se explica con la lista.
 */
describe('Tienda: entradas, ajustes y movimientos de stock', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let categoriaId: number;

  const DOMINIO = '@tienda-t160.test';
  const CONTRASENA = 'raqueta lluviosa 160';
  const MARCA = '[Prueba T160]';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  interface Movimiento {
    id: number;
    cantidad: number;
    motivo: string;
    nota: string | null;
    creadoEn: string;
    quien: string | null;
  }
  interface Historial {
    variante: { id: number; etiqueta: string; stock: number };
    movimientos: Movimiento[];
  }

  const registrar = (varianteId: number, cuerpo: Record<string, unknown>) =>
    request(servidor())
      .post(`/api/admin/tienda/variantes/${varianteId}/movimientos`)
      .set('Cookie', admin)
      .send(cuerpo);

  const historial = async (varianteId: number) =>
    (
      await request(servidor())
        .get(`/api/admin/tienda/variantes/${varianteId}/movimientos`)
        .set('Cookie', admin)
        .expect(200)
    ).body as Historial;

  /** Una variante nueva con su stock inicial, que entra como una ENTRADA. */
  const variante = async (stock: number) => {
    const { body } = (await request(servidor())
      .post('/api/admin/tienda/productos')
      .set('Cookie', admin)
      .send({
        nombre: `${MARCA} Tubo de pelotas`,
        categoriaId,
        precioClp: 6990,
        variantes: [{ etiqueta: 'Tubo', stock }],
      })
      .expect(201)) as { body: { variantes: { id: number }[] } };

    return body.variantes[0].id;
  };

  const sumaDeMovimientos = async (varianteId: number) =>
    (
      await prisma.movimientoStock.aggregate({
        where: { varianteId },
        _sum: { cantidad: true },
      })
    )._sum.cantidad ?? 0;

  const stockDe = async (varianteId: number) =>
    (await prisma.variante.findUniqueOrThrow({ where: { id: varianteId } }))
      .stock;

  const limpiar = async () => {
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
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);

    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await limpiar();

    const email = `jefa${DOMINIO}`;
    await prisma.usuario.create({
      data: {
        email,
        nombre: 'Marta',
        apellido: 'Bodega',
        esAdmin: true,
        passwordHash: await hashear(CONTRASENA),
      },
    });
    const sesion = await request(servidor())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);
    admin = (sesion.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];

    categoriaId = (
      await prisma.categoriaProducto.findUniqueOrThrow({
        where: { nombre: 'Pelotas' },
      })
    ).id;
  });

  beforeEach(() => {
    process.env.TIENDA_HABILITADA = 'true';
  });

  afterEach(limpiar);

  afterAll(async () => {
    delete process.env.TIENDA_HABILITADA;
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  describe('entradas de mercadería', () => {
    it('suma al stock y deja el movimiento con su autor', async () => {
      const id = await variante(2);

      const { body } = (await registrar(id, {
        motivo: 'ENTRADA',
        cantidad: 12,
      }).expect(201)) as { body: { stock: number } };

      expect(body.stock).toBe(14);
      const { movimientos } = await historial(id);
      expect(movimientos[0]).toMatchObject({
        motivo: 'ENTRADA',
        cantidad: 12,
        quien: 'Marta Bodega',
      });
    });

    it('una entrada de cero o negativa responde 400', async () => {
      const id = await variante(2);

      await registrar(id, { motivo: 'ENTRADA', cantidad: 0 }).expect(400);
      await registrar(id, { motivo: 'ENTRADA', cantidad: -3 }).expect(400);
      expect(await stockDe(id)).toBe(2);
    });
  });

  describe('ajustes', () => {
    it('un ajuste con nota puede restar', async () => {
      const id = await variante(5);

      const { body } = (await registrar(id, {
        motivo: 'AJUSTE',
        cantidad: -2,
        nota: 'Conteo del lunes: faltaban dos tubos',
      }).expect(201)) as { body: { stock: number } };

      expect(body.stock).toBe(3);
      const { movimientos } = await historial(id);
      expect(movimientos[0]).toMatchObject({
        motivo: 'AJUSTE',
        cantidad: -2,
        nota: 'Conteo del lunes: faltaban dos tubos',
      });
    });

    it('**un ajuste sin nota responde 400 y no cambia nada**', async () => {
      const id = await variante(5);

      await registrar(id, { motivo: 'AJUSTE', cantidad: -2 }).expect(400);
      await registrar(id, {
        motivo: 'AJUSTE',
        cantidad: -2,
        nota: '   ',
      }).expect(400);

      expect(await stockDe(id)).toBe(5);
      expect((await historial(id)).movimientos).toHaveLength(1);
    });
  });

  it('desde el panel no se registran ventas, devoluciones ni anulaciones', async () => {
    const id = await variante(5);

    for (const motivo of ['VENTA', 'DEVOLUCION', 'ANULACION', 'OTRO']) {
      await registrar(id, { motivo, cantidad: 1, nota: 'x' }).expect(400);
    }
    expect(await stockDe(id)).toBe(5);
  });

  it('una variante que no existe responde 404', async () => {
    await registrar(999999, { motivo: 'ENTRADA', cantidad: 1 }).expect(404);
    await request(servidor())
      .get('/api/admin/tienda/variantes/999999/movimientos')
      .set('Cookie', admin)
      .expect(404);
  });

  describe('la lista de movimientos', () => {
    it('**dice cuándo, cuánto, por qué y quién**, del más nuevo al más viejo', async () => {
      const id = await variante(4);
      await registrar(id, {
        motivo: 'AJUSTE',
        cantidad: -1,
        nota: 'Uno abierto',
      }).expect(201);
      // Una compra en línea no tiene autor.
      await prisma.$transaction((tx) =>
        moverStock(tx, { varianteId: id, cantidad: -1, motivo: 'VENTA' }),
      );

      const { variante: datos, movimientos } = await historial(id);

      expect(datos).toMatchObject({ id, etiqueta: 'Tubo', stock: 2 });
      expect(
        movimientos.map((m) => [m.motivo, m.cantidad, m.quien, m.nota]),
      ).toEqual([
        ['VENTA', -1, null, null],
        ['AJUSTE', -1, 'Marta Bodega', 'Uno abierto'],
        ['ENTRADA', 4, 'Marta Bodega', null],
      ]);
      expect(Number.isNaN(Date.parse(movimientos[0].creadoEn))).toBe(false);
    });

    it('**la suma de los movimientos de una variante es su stock**', async () => {
      const id = await variante(10);
      await registrar(id, { motivo: 'ENTRADA', cantidad: 6 }).expect(201);
      await registrar(id, {
        motivo: 'AJUSTE',
        cantidad: -3,
        nota: 'Merma',
      }).expect(201);
      await prisma.$transaction((tx) =>
        moverStock(tx, { varianteId: id, cantidad: -15, motivo: 'VENTA' }),
      );

      expect(await stockDe(id)).toBe(-2);
      expect(await sumaDeMovimientos(id)).toBe(await stockDe(id));
    });
  });
});
