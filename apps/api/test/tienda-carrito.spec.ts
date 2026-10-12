import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoSocio } from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';
import { moverStock } from '../src/tienda/stock';

/**
 * T163: cotizar el carrito.
 *
 * El carrito vive en el navegador y guarda solo ids y cantidades. **El precio, el
 * descuento, lo disponible y el total los calcula siempre el servidor**, y un precio que
 * llegue del cliente se ignora (`SPEC-tienda.md` § Precio y descuento de socio).
 */
describe('Tienda: cotizar el carrito', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let socioAlDia: string;
  let zapatillas: number;
  let raquetas: number;

  const DOMINIO = '@tienda-t163.test';
  const CONTRASENA = 'raqueta lluviosa 163';
  const MARCA = '[Prueba T163]';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  interface LineaCotizada {
    varianteId: number;
    cantidad: number;
    producto: {
      id: number;
      nombre: string;
      marca: string | null;
      foto: string | null;
    } | null;
    talla: string | null;
    precioUnitarioClp: number | null;
    descuentoUnitarioClp: number;
    subtotalClp: number;
    disponible: number;
    estado: 'ok' | 'sin-stock' | 'no-disponible';
  }
  interface Cotizacion {
    lineas: LineaCotizada[];
    subtotalClp: number;
    descuentoClp: number;
    totalClp: number;
    sePuedePagar: boolean;
  }

  const cotizar = async (lineas: unknown, cookie?: string, status = 200) => {
    const peticion = request(servidor())
      .post('/api/tienda/carrito/cotizar')
      .send({ lineas });
    if (cookie) peticion.set('Cookie', cookie);

    return (await peticion.expect(status)).body as Cotizacion;
  };

  const iniciarSesion = async (quien: string, socio?: { alDiaHasta: Date }) => {
    const email = `${quien}${DOMINIO}`;
    const usuario = await prisma.usuario.create({
      data: {
        email,
        nombre: quien,
        apellido: 'De Prueba',
        esAdmin: quien === 'jefa',
        passwordHash: await hashear(CONTRASENA),
      },
    });
    if (socio) {
      await prisma.socio.create({
        data: {
          usuarioId: usuario.id,
          numeroSocio: `T163-${quien}`,
          estado: EstadoSocio.ACTIVO,
          fechaIngreso: new Date('2020-01-01T00:00:00.000Z'),
          alDiaHasta: socio.alDiaHasta,
        },
      });
    }
    const sesion = await request(servidor())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);

    return (sesion.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  };

  /** Un producto armado con la API del panel; publicado salvo que se diga otra cosa. */
  const producto = async (
    nombre: string,
    datos: {
      categoriaId?: number;
      marcaId?: number | null;
      precioClp?: number;
      variantes?: { etiqueta: string; stock?: number }[];
      publicar?: boolean;
    } = {},
  ) => {
    const { body } = (await request(servidor())
      .post('/api/admin/tienda/productos')
      .set('Cookie', admin)
      .send({
        nombre: `${MARCA} ${nombre}`,
        categoriaId: datos.categoriaId ?? raquetas,
        marcaId: datos.marcaId ?? null,
        precioClp: datos.precioClp ?? 10000,
        variantes: datos.variantes ?? [{ etiqueta: 'Única', stock: 3 }],
      })
      .expect(201)) as { body: { id: number; variantes: { id: number }[] } };

    if (datos.publicar !== false) {
      await request(servidor())
        .patch(`/api/admin/tienda/productos/${body.id}`)
        .set('Cookie', admin)
        .send({ publicado: true })
        .expect(200);
    }

    return body;
  };

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
    await prisma.marca.deleteMany({ where: { nombre: { startsWith: MARCA } } });
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);

    await prisma.socio.deleteMany({
      where: { usuario: { email: { endsWith: DOMINIO } } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await limpiar();

    process.env.TIENDA_HABILITADA = 'true';
    admin = await iniciarSesion('jefa');
    socioAlDia = await iniciarSesion('aldia', {
      alDiaHasta: new Date('2099-12-31T00:00:00.000Z'),
    });

    zapatillas = (
      await prisma.categoriaProducto.findUniqueOrThrow({
        where: { nombre: 'Zapatillas' },
      })
    ).id;
    raquetas = (
      await prisma.categoriaProducto.findUniqueOrThrow({
        where: { nombre: 'Raquetas' },
      })
    ).id;
  });

  beforeEach(() => {
    process.env.TIENDA_HABILITADA = 'true';
  });

  afterEach(limpiar);

  afterAll(async () => {
    delete process.env.TIENDA_HABILITADA;
    await prisma.socio.deleteMany({
      where: { usuario: { email: { endsWith: DOMINIO } } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  it('con la tienda apagada, responde 404', async () => {
    process.env.TIENDA_HABILITADA = 'false';

    await request(servidor())
      .post('/api/tienda/carrito/cotizar')
      .send({ lineas: [] })
      .expect(404);
  });

  describe('el precio', () => {
    it('cada línea con su precio, su subtotal y el total; sin sesión, sin descuento', async () => {
      const raqueta = await producto('Pure Drive', { precioClp: 249990 });
      const tubo = await producto('Tubo', {
        precioClp: 6990,
        variantes: [{ etiqueta: 'Única', stock: 10 }],
      });

      const cotizacion = await cotizar([
        { varianteId: raqueta.variantes[0].id, cantidad: 1 },
        { varianteId: tubo.variantes[0].id, cantidad: 3 },
      ]);

      expect(
        cotizacion.lineas.map((l) => [
          l.precioUnitarioClp,
          l.descuentoUnitarioClp,
          l.subtotalClp,
        ]),
      ).toEqual([
        [249990, 0, 249990],
        [6990, 0, 20970],
      ]);
      expect(cotizacion).toMatchObject({
        subtotalClp: 270960,
        descuentoClp: 0,
        totalClp: 270960,
        sePuedePagar: true,
      });
    });

    it('**al socio al día le descuenta por unidad**, redondeado como el spec', async () => {
      const tubo = await producto('Tubo', {
        precioClp: 6990,
        variantes: [{ etiqueta: 'Única', stock: 10 }],
      });

      const cotizacion = await cotizar(
        [{ varianteId: tubo.variantes[0].id, cantidad: 3 }],
        socioAlDia,
      );

      // 6.990 × 15% = 1.048,5, que sube a 1.049 por unidad; tres unidades descuentan 3.147.
      expect(cotizacion.lineas[0]).toMatchObject({
        precioUnitarioClp: 6990,
        descuentoUnitarioClp: 1049,
        subtotalClp: 17823,
      });
      expect(cotizacion).toMatchObject({
        subtotalClp: 20970,
        descuentoClp: 3147,
        totalClp: 17823,
      });
    });

    it('**un precio que manda el navegador se ignora**', async () => {
      const raqueta = await producto('Pure Drive', { precioClp: 249990 });

      const cotizacion = await cotizar([
        {
          varianteId: raqueta.variantes[0].id,
          cantidad: 1,
          precioClp: 1,
          subtotalClp: 1,
        },
      ]);

      expect(cotizacion.lineas[0].precioUnitarioClp).toBe(249990);
      expect(cotizacion.totalClp).toBe(249990);
    });
  });

  describe('lo que se muestra de cada línea', () => {
    it('el producto, su marca, su foto y la talla en los tres sistemas', async () => {
      const { body: asics } = (await request(servidor())
        .post('/api/admin/tienda/marcas')
        .set('Cookie', admin)
        .send({ nombre: `${MARCA} Asics` })
        .expect(201)) as { body: { id: number } };
      await request(servidor())
        .put(`/api/admin/tienda/marcas/${asics.id}/tallas`)
        .set('Cookie', admin)
        .send({ tallas: [{ tallaCl: '40', tallaUs: '8', tallaEu: '41' }] })
        .expect(200);
      const zapatilla = await producto('Gel Resolution', {
        categoriaId: zapatillas,
        marcaId: asics.id,
        variantes: [{ etiqueta: '40', stock: 2 }],
      });

      const [linea] = (
        await cotizar([{ varianteId: zapatilla.variantes[0].id, cantidad: 1 }])
      ).lineas;

      expect(linea).toMatchObject({
        varianteId: zapatilla.variantes[0].id,
        cantidad: 1,
        producto: {
          id: zapatilla.id,
          nombre: `${MARCA} Gel Resolution`,
          marca: `${MARCA} Asics`,
          foto: null,
        },
        talla: 'CL 40 · US 8 · EU 41',
        disponible: 2,
        estado: 'ok',
      });
    });
  });

  describe('lo que no se puede comprar', () => {
    it('**más de lo que queda**: la línea lo dice, con cuánto queda, y no se puede pagar', async () => {
      const raqueta = await producto('Pure Drive', {
        variantes: [{ etiqueta: 'Grip 2', stock: 2 }],
      });

      const cotizacion = await cotizar([
        { varianteId: raqueta.variantes[0].id, cantidad: 3 },
      ]);

      expect(cotizacion.lineas[0]).toMatchObject({
        estado: 'sin-stock',
        disponible: 2,
      });
      expect(cotizacion.sePuedePagar).toBe(false);
    });

    it('un stock negativo se ve como cero disponible', async () => {
      const raqueta = await producto('Pure Drive', {
        variantes: [{ etiqueta: 'Grip 2', stock: 1 }],
      });
      await prisma.$transaction((tx) =>
        moverStock(tx, {
          varianteId: raqueta.variantes[0].id,
          cantidad: -3,
          motivo: 'VENTA',
        }),
      );

      const [linea] = (
        await cotizar([{ varianteId: raqueta.variantes[0].id, cantidad: 1 }])
      ).lineas;

      expect(linea).toMatchObject({ estado: 'sin-stock', disponible: 0 });
    });

    it('**lo que dejó de venderse**: borrador, variante inactiva o un id que no existe', async () => {
      const borrador = await producto('Borrador', { publicar: false });
      const conInactiva = await producto('Con inactiva', {
        variantes: [
          { etiqueta: 'Grip 2', stock: 1 },
          { etiqueta: 'Grip 3', stock: 1 },
        ],
      });
      await request(servidor())
        .patch(`/api/admin/tienda/variantes/${conInactiva.variantes[1].id}`)
        .set('Cookie', admin)
        .send({ activa: false })
        .expect(200);
      const visible = await producto('Visible');

      const cotizacion = await cotizar([
        { varianteId: borrador.variantes[0].id, cantidad: 1 },
        { varianteId: conInactiva.variantes[1].id, cantidad: 1 },
        { varianteId: 999999999, cantidad: 1 },
        { varianteId: visible.variantes[0].id, cantidad: 1 },
      ]);

      expect(cotizacion.lineas.map((l) => l.estado)).toEqual([
        'no-disponible',
        'no-disponible',
        'no-disponible',
        'ok',
      ]);
      // De lo que ya no se vende no se cobra nada; de lo que no existe, ni el nombre.
      expect(cotizacion.lineas[0]).toMatchObject({
        producto: { nombre: `${MARCA} Borrador` },
        precioUnitarioClp: null,
        subtotalClp: 0,
      });
      expect(cotizacion.lineas[2].producto).toBeNull();
      expect(cotizacion.totalClp).toBe(10000);
      expect(cotizacion.sePuedePagar).toBe(false);
    });

    it('un carrito vacío no se puede pagar', async () => {
      expect(await cotizar([])).toMatchObject({
        lineas: [],
        totalClp: 0,
        sePuedePagar: false,
      });
    });
  });

  describe('lo que no se entiende', () => {
    it.each([
      ['sin lista', undefined],
      ['una cantidad en cero', [{ varianteId: 1, cantidad: 0 }]],
      ['una cantidad con decimales', [{ varianteId: 1, cantidad: 1.5 }]],
      ['más de 99 de una vez', [{ varianteId: 1, cantidad: 100 }]],
      ['un id que no es número', [{ varianteId: 'uno', cantidad: 1 }]],
      [
        'la misma variante dos veces',
        [
          { varianteId: 1, cantidad: 1 },
          { varianteId: 1, cantidad: 2 },
        ],
      ],
      [
        'más de 50 líneas',
        Array.from({ length: 51 }, (_, i) => ({
          varianteId: i + 1,
          cantidad: 1,
        })),
      ],
    ])('%s responde 400', async (_caso, lineas) => {
      await cotizar(lineas, undefined, 400);
    });
  });
});
