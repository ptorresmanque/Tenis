import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoSocio } from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T172: la configuración de la tienda, en su pestaña del panel (`SPEC-tienda.md` § Panel):
 * el descuento de socio, el umbral de stock bajo y el texto del arriendo de raquetas.
 *
 * **Cambiar el descuento cambia lo que viene, no lo que ya se vendió**: el precio y el
 * descuento se congelan en cada línea al crear el pedido (T164).
 */
describe('Tienda: la configuración', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let socioAlDia: string;
  let raquetas: number;
  let antes: {
    descuentoSocioPorcentaje: number;
    umbralStockBajo: number;
    arriendoRaquetasTexto: string;
  };

  const DOMINIO = '@tienda-t172.test';
  const CONTRASENA = 'raqueta lluviosa 172';
  const MARCA = '[Prueba T172]';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const configurar = (cambio: object, cookie = admin) =>
    request(servidor())
      .patch('/api/admin/tienda/configuracion')
      .set('Cookie', cookie)
      .send(cambio);

  const iniciarSesion = async (
    quien: string,
    esAdmin: boolean,
    socio = false,
  ) => {
    const email = `${quien}${DOMINIO}`;
    const usuario = await prisma.usuario.create({
      data: {
        email,
        nombre: quien,
        apellido: 'De Prueba',
        esAdmin,
        passwordHash: await hashear(CONTRASENA),
      },
    });
    if (socio) {
      await prisma.socio.create({
        data: {
          usuarioId: usuario.id,
          numeroSocio: `T172-${quien}`,
          estado: EstadoSocio.ACTIVO,
          fechaIngreso: new Date('2020-01-01T00:00:00.000Z'),
          alDiaHasta: new Date('2099-12-31T00:00:00.000Z'),
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

  const producto = async (precioClp: number, stock: number) => {
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
    antes = await prisma.configuracionClub.findFirstOrThrow({
      select: {
        descuentoSocioPorcentaje: true,
        umbralStockBajo: true,
        arriendoRaquetasTexto: true,
      },
    });

    process.env.TIENDA_HABILITADA = 'true';
    admin = await iniciarSesion('jefa', true);
    socioAlDia = await iniciarSesion('socia', false, true);
    raquetas = (
      await prisma.categoriaProducto.findUniqueOrThrow({
        where: { nombre: 'Raquetas' },
      })
    ).id;
  });

  beforeEach(async () => {
    process.env.TIENDA_HABILITADA = 'true';
    await prisma.configuracionClub.updateMany({
      data: {
        descuentoSocioPorcentaje: 15,
        umbralStockBajo: 2,
        arriendoRaquetasTexto: '',
      },
    });
  });

  afterEach(limpiar);

  afterAll(async () => {
    delete process.env.TIENDA_HABILITADA;
    await prisma.configuracionClub.updateMany({ data: antes });
    await prisma.socio.deleteMany({
      where: { usuario: { email: { endsWith: DOMINIO } } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  it('solo para administración; con la tienda apagada, 404', async () => {
    await request(servidor())
      .get('/api/admin/tienda/configuracion')
      .set('Cookie', socioAlDia)
      .expect(403);

    process.env.TIENDA_HABILITADA = 'false';
    await request(servidor())
      .get('/api/admin/tienda/configuracion')
      .set('Cookie', admin)
      .expect(404);
  });

  it('trae los tres valores', async () => {
    const { body } = (await request(servidor())
      .get('/api/admin/tienda/configuracion')
      .set('Cookie', admin)
      .expect(200)) as { body: object };

    expect(body).toEqual({
      descuentoSocioPorcentaje: 15,
      umbralStockBajo: 2,
      arriendoRaquetasTexto: '',
    });
  });

  it('**cambiar el descuento cambia el catálogo y lo nuevo, no lo ya vendido**', async () => {
    const raqueta = await producto(10000, 10);
    const { body: viejo } = (await request(servidor())
      .post('/api/tienda/pedidos')
      .set('Cookie', socioAlDia)
      .send({
        lineas: [{ varianteId: raqueta.varianteId, cantidad: 1 }],
        nombre: 'Socia De Prueba',
        email: `socia${DOMINIO}`,
        telefono: '+56 9 8765 4321',
        entrega: 'RETIRO',
      })
      .expect(201)) as { body: { token: string } };

    await configurar({ descuentoSocioPorcentaje: 20 }).expect(200);

    const { body: ficha } = (await request(servidor())
      .get(`/api/tienda/productos/${raqueta.id}`)
      .set('Cookie', socioAlDia)
      .expect(200)) as { body: { precioSocioClp: number } };
    expect(ficha.precioSocioClp).toBe(8000);

    const guardado = await prisma.pedido.findUniqueOrThrow({
      where: { token: viejo.token },
      include: { lineas: true },
    });
    expect(guardado.lineas[0].descuentoUnitarioClp).toBe(1500);
    expect(guardado.totalClp).toBe(8500);
  });

  it.each([
    ['un descuento sobre 50%', { descuentoSocioPorcentaje: 51 }],
    ['un descuento negativo', { descuentoSocioPorcentaje: -1 }],
    ['un descuento con decimales', { descuentoSocioPorcentaje: 12.5 }],
    ['un umbral sobre 100', { umbralStockBajo: 101 }],
    ['un umbral negativo', { umbralStockBajo: -1 }],
    [
      'un texto de arriendo de más de 600 caracteres',
      { arriendoRaquetasTexto: 'x'.repeat(601) },
    ],
    ['nada que cambiar', {}],
  ])('%s responde 400', async (_caso, cambio) => {
    await configurar(cambio).expect(400);
  });

  it('el texto del arriendo llega a la tienda solo si el club lo escribió', async () => {
    const leer = async () =>
      (
        (await request(servidor()).get('/api/tienda/filtros').expect(200)) as {
          body: { arriendoRaquetas: string };
        }
      ).body.arriendoRaquetas;

    expect(await leer()).toBe('');
    await configurar({
      arriendoRaquetasTexto:
        '  Arrendamos raquetas en el mesón: $2.000 la hora.  ',
    }).expect(200);
    expect(await leer()).toBe(
      'Arrendamos raquetas en el mesón: $2.000 la hora.',
    );
  });

  it('**el filtro de stock bajo lee el umbral de la configuración**', async () => {
    await producto(10000, 1);
    const marcado = async () => {
      const { body } = (await request(servidor())
        .get('/api/admin/tienda/productos')
        .set('Cookie', admin)
        .expect(200)) as { body: { nombre: string; stockBajo: boolean }[] };

      return body.find((p) => p.nombre.startsWith(MARCA))?.stockBajo;
    };

    expect(await marcado()).toBe(true);
    await configurar({ umbralStockBajo: 0 }).expect(200);
    expect(await marcado()).toBe(false);
  });
});
