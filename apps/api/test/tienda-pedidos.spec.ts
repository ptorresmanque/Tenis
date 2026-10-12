import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoSocio } from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { MINUTOS_PARA_EXPIRAR } from '../src/pagos/expiracion';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T164: crear el pedido y apartar las unidades.
 *
 * El pedido nace en `PENDIENTE_PAGO`, **con el precio y el descuento congelados**, y aparta
 * sus unidades durante `MINUTOS_PARA_EXPIRAR` sin que corra ningún job. Dos compradores por
 * la última unidad: el segundo espera el cerrojo, ve cero disponible y recibe "se agotó
 * mientras comprabas" **antes** de ir a Webpay (`SPEC-tienda.md` § Disponibilidad).
 *
 * El stock no baja acá: baja cuando el pago se confirma (T165).
 */
describe('Tienda: crear el pedido', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let socioAlDia: string;
  let raquetas: number;

  const DOMINIO = '@tienda-t164.test';
  const CONTRASENA = 'raqueta lluviosa 164';
  const MARCA = '[Prueba T164]';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const comprador = {
    nombre: 'Camila Rojas',
    email: `camila${DOMINIO}`,
    telefono: '+56 9 8765 4321',
    entrega: 'RETIRO',
  };

  const crear = (cuerpo: object, cookie?: string) => {
    const peticion = request(servidor())
      .post('/api/tienda/pedidos')
      .send({ ...comprador, ...cuerpo });
    if (cookie) peticion.set('Cookie', cookie);

    return peticion;
  };

  const guardado = (token: string) =>
    prisma.pedido.findUniqueOrThrow({
      where: { token },
      include: { lineas: { orderBy: { id: 'asc' } } },
    });

  const disponible = async (productoId: number) => {
    const { body } = (await request(servidor())
      .get(`/api/tienda/productos/${productoId}`)
      .expect(200)) as { body: { variantes: { disponible: number }[] } };

    return body.variantes[0].disponible;
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
          numeroSocio: `T164-${quien}`,
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

  /** Un producto publicado, armado con la API del panel. */
  const producto = async (
    nombre: string,
    datos: {
      precioClp?: number;
      stock?: number;
      etiqueta?: string;
      marcaId?: number;
    } = {},
  ) => {
    const { body } = (await request(servidor())
      .post('/api/admin/tienda/productos')
      .set('Cookie', admin)
      .send({
        nombre: `${MARCA} ${nombre}`,
        categoriaId: raquetas,
        marcaId: datos.marcaId ?? null,
        precioClp: datos.precioClp ?? 10000,
        variantes: [
          { etiqueta: datos.etiqueta ?? 'Única', stock: datos.stock ?? 3 },
        ],
      })
      .expect(201)) as { body: { id: number; variantes: { id: number }[] } };
    await request(servidor())
      .patch(`/api/admin/tienda/productos/${body.id}`)
      .set('Cookie', admin)
      .send({ publicado: true })
      .expect(200);

    return { id: body.id, varianteId: body.variantes[0].id };
  };

  const limpiar = async () => {
    const pedidos = await prisma.pedido.findMany({
      where: { email: { endsWith: DOMINIO } },
      select: { id: true },
    });
    await prisma.lineaPedido.deleteMany({
      where: { pedidoId: { in: pedidos.map((p) => p.id) } },
    });
    await prisma.pedido.deleteMany({ where: { email: { endsWith: DOMINIO } } });

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

    await limpiar();
    await prisma.socio.deleteMany({
      where: { usuario: { email: { endsWith: DOMINIO } } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    process.env.TIENDA_HABILITADA = 'true';
    admin = await iniciarSesion('jefa');
    socioAlDia = await iniciarSesion('aldia', {
      alDiaHasta: new Date('2099-12-31T00:00:00.000Z'),
    });
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

    await crear({ lineas: [] }).expect(404);
  });

  describe('el pedido', () => {
    it('**nace pendiente de pago, con el precio y la descripción congelados**', async () => {
      const { body: babolat } = (await request(servidor())
        .post('/api/admin/tienda/marcas')
        .set('Cookie', admin)
        .send({ nombre: `${MARCA} Babolat` })
        .expect(201)) as { body: { id: number } };
      const raqueta = await producto('Pure Drive', {
        precioClp: 249990,
        etiqueta: 'Grip 2',
        marcaId: babolat.id,
      });

      const { body } = (await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 1 }],
      }).expect(201)) as { body: { token: string; totalClp: number } };

      expect(body.totalClp).toBe(249990);
      const pedido = await guardado(body.token);
      expect(pedido).toMatchObject({
        canal: 'EN_LINEA',
        estado: 'PENDIENTE_PAGO',
        entrega: 'RETIRO',
        medioPago: 'WEBPAY',
        documento: 'VOUCHER',
        nombre: 'Camila Rojas',
        email: `camila${DOMINIO}`,
        telefono: '56987654321',
        totalClp: 249990,
        descuentoSocioClp: 0,
        usuarioId: null,
        socioId: null,
      });
      expect(pedido.lineas).toEqual([
        expect.objectContaining({
          tipo: 'PRODUCTO',
          varianteId: raqueta.varianteId,
          descripcion: `${MARCA} Babolat ${MARCA} Pure Drive · Grip 2`,
          cantidad: 1,
          precioUnitarioClp: 249990,
          descuentoUnitarioClp: 0,
          esEncargo: false,
        }),
      ]);
    });

    it('**el stock no baja al crearlo**: baja cuando se confirma el pago (T165)', async () => {
      const raqueta = await producto('Pure Drive', { stock: 3 });

      await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 2 }],
      }).expect(201);

      const variante = await prisma.variante.findUniqueOrThrow({
        where: { id: raqueta.varianteId },
      });
      expect(variante.stock).toBe(3);
    });

    it('al socio al día le congela su descuento, y el pedido queda a su nombre', async () => {
      const tubo = await producto('Tubo', { precioClp: 6990, stock: 10 });

      const { body } = (await crear(
        { lineas: [{ varianteId: tubo.varianteId, cantidad: 3 }] },
        socioAlDia,
      ).expect(201)) as { body: { token: string; totalClp: number } };

      const pedido = await guardado(body.token);
      expect(pedido.totalClp).toBe(17823);
      expect(pedido.descuentoSocioClp).toBe(3147);
      expect(pedido.lineas[0]).toMatchObject({
        precioUnitarioClp: 6990,
        descuentoUnitarioClp: 1049,
      });
      expect(pedido.usuarioId).not.toBeNull();
      expect(pedido.socioId).not.toBeNull();
    });

    it('**un precio que manda el cliente se ignora**', async () => {
      const raqueta = await producto('Pure Drive', { precioClp: 249990 });

      const { body } = (await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 1, precioClp: 1 }],
        totalClp: 1,
      }).expect(201)) as { body: { token: string; totalClp: number } };

      expect(body.totalClp).toBe(249990);
      expect((await guardado(body.token)).lineas[0].precioUnitarioClp).toBe(
        249990,
      );
    });
  });

  describe('retiro y despacho', () => {
    const despacho = {
      region: 'Metropolitana de Santiago',
      comuna: 'Ñuñoa',
      direccion: 'Av. Irarrázaval 1234, depto. 56',
      referencia: 'Timbre malo, llamar',
    };

    it('**el despacho guarda la dirección, y el total no lo incluye**', async () => {
      const raqueta = await producto('Pure Drive', { precioClp: 249990 });

      const { body } = (await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 1 }],
        entrega: 'DESPACHO',
        despacho,
      }).expect(201)) as { body: { token: string; totalClp: number } };

      expect(body.totalClp).toBe(249990);
      expect(await guardado(body.token)).toMatchObject({
        entrega: 'DESPACHO',
        ...despacho,
      });
    });

    it.each([
      ['una región que no es de la lista', { ...despacho, region: 'Mendoza' }],
      ['sin comuna', { ...despacho, comuna: '' }],
      ['sin dirección', { ...despacho, direccion: ' ' }],
      ['sin los datos', undefined],
    ])('el despacho %s responde 400', async (_caso, datos) => {
      const raqueta = await producto('Pure Drive');

      await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 1 }],
        entrega: 'DESPACHO',
        despacho: datos,
      }).expect(400);
    });

    it('con retiro, una dirección que venga se descarta', async () => {
      const raqueta = await producto('Pure Drive');

      const { body } = (await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 1 }],
        despacho,
      }).expect(201)) as { body: { token: string } };

      expect(await guardado(body.token)).toMatchObject({
        entrega: 'RETIRO',
        region: null,
        direccion: null,
      });
    });
  });

  describe('la factura', () => {
    const factura = {
      rut: '76.123.456-0',
      razonSocial: 'Comercial Los Aromos SpA',
      giro: 'Venta de artículos deportivos',
      direccion: 'Los Aromos 345, Temuco',
    };

    it('quien pide factura deja sus datos, y el documento es factura', async () => {
      const raqueta = await producto('Pure Drive');

      const { body } = (await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 1 }],
        factura,
      }).expect(201)) as { body: { token: string } };

      expect(await guardado(body.token)).toMatchObject({
        documento: 'FACTURA',
        facturaRut: '76123456-0',
        facturaRazonSocial: 'Comercial Los Aromos SpA',
        facturaGiro: 'Venta de artículos deportivos',
        facturaDireccion: 'Los Aromos 345, Temuco',
      });
    });

    it.each([
      ['un RUT con el dígito equivocado', { ...factura, rut: '76.123.456-7' }],
      ['sin razón social', { ...factura, razonSocial: '' }],
      ['sin giro', { ...factura, giro: undefined }],
    ])('la factura con %s responde 400', async (_caso, datos) => {
      const raqueta = await producto('Pure Drive');

      await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 1 }],
        factura: datos,
      }).expect(400);
    });
  });

  describe('lo que no se entiende', () => {
    it.each([
      ['sin nombre', { nombre: '' }],
      ['un correo sin forma de correo', { email: 'camila' }],
      ['un teléfono que no es chileno', { telefono: '123' }],
      ['una entrega que no existe', { entrega: 'DRON' }],
      ['un carrito vacío', { lineas: [] }],
      ['una cantidad en cero', { lineas: [{ varianteId: 1, cantidad: 0 }] }],
    ])('%s responde 400', async (_caso, datos) => {
      await crear({
        lineas: [{ varianteId: 1, cantidad: 1 }],
        ...datos,
      }).expect(400);
    });
  });

  describe('lo disponible', () => {
    it('**lo que ya no se vende no se puede pedir**', async () => {
      const raqueta = await producto('Pure Drive');
      await request(servidor())
        .patch(`/api/admin/tienda/productos/${raqueta.id}`)
        .set('Cookie', admin)
        .send({ archivado: true })
        .expect(200);

      const { body } = (await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 1 }],
      }).expect(409)) as { body: { message: string } };

      expect(body.message).toContain('ya no está a la venta');
    });

    it('**un pedido pendiente aparta sus unidades**: la ficha, el carrito y otro pedido lo ven', async () => {
      const raqueta = await producto('Pure Drive', { stock: 3 });

      await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 2 }],
      }).expect(201);

      expect(await disponible(raqueta.id)).toBe(1);
      const { body: cotizacion } = (await request(servidor())
        .post('/api/tienda/carrito/cotizar')
        .send({ lineas: [{ varianteId: raqueta.varianteId, cantidad: 2 }] })
        .expect(200)) as {
        body: { lineas: { disponible: number; estado: string }[] };
      };
      expect(cotizacion.lineas[0]).toMatchObject({
        disponible: 1,
        estado: 'sin-stock',
      });

      const { body } = (await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 2 }],
      }).expect(409)) as { body: { message: string } };
      expect(body.message).toContain('Se agotó mientras comprabas');
    });

    it(`**pasados ${MINUTOS_PARA_EXPIRAR} minutos, las unidades vuelven solas**, sin ningún job`, async () => {
      const raqueta = await producto('Pure Drive', { stock: 1 });
      const { body } = (await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 1 }],
      }).expect(201)) as { body: { token: string } };
      expect(await disponible(raqueta.id)).toBe(0);

      await prisma.pedido.update({
        where: { token: body.token },
        data: {
          creadoEn: new Date(Date.now() - (MINUTOS_PARA_EXPIRAR + 1) * 60_000),
        },
      });

      expect(await disponible(raqueta.id)).toBe(1);
      await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 1 }],
      }).expect(201);
    });

    it('lo agotado por un apartado se ve agotado en la lista', async () => {
      const raqueta = await producto('Pure Drive', { stock: 1 });
      await crear({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 1 }],
      }).expect(201);

      const { body } = (await request(servidor())
        .get('/api/tienda/productos')
        .expect(200)) as { body: { id: number; agotado: boolean }[] };

      expect(body.find((p) => p.id === raqueta.id)?.agotado).toBe(true);
    });

    it('**dos pedidos a la vez por la última unidad: uno se crea y el otro se entera antes de pagar**', async () => {
      const raqueta = await producto('Pure Drive', { stock: 1 });
      const linea = {
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 1 }],
      };

      const [uno, otro] = await Promise.all([crear(linea), crear(linea)]);

      expect([uno.status, otro.status].sort()).toEqual([201, 409]);
      const perdedor = uno.status === 409 ? uno : otro;
      expect((perdedor.body as { message: string }).message).toContain(
        'Se agotó mientras comprabas',
      );
      expect(
        await prisma.lineaPedido.count({
          where: { varianteId: raqueta.varianteId },
        }),
      ).toBe(1);
    });
  });
});
