import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EnviadorCorreo } from '../src/identidad/correo';
import { hashear } from '../src/identidad/contrasena';
import { MINUTOS_PARA_EXPIRAR } from '../src/pagos/expiracion';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T169: los pedidos en el panel.
 *
 * La lista por estado y canal, con las marcas que se calculan al listar —"30 días sin
 * retirar", "requiere revisión"—, y el barrido que pasa a `EXPIRADO` los pendientes que
 * vencieron. Las acciones van **cada una en su estado**: listo para retirar, despachado con
 * el número de Starken, entregado. Fuera de su estado responden 409, y las dos primeras le
 * escriben al comprador.
 */
describe('Tienda: los pedidos en el panel', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let socio: string;
  let raquetas: number;

  const DOMINIO = '@tienda-t169.test';
  const CONTRASENA = 'raqueta lluviosa 169';
  const MARCA = '[Prueba T169]';

  const enviados: { para: string; asunto: string; cuerpo: string }[] = [];
  const correo = {
    enviar: (mensaje: { para: string; asunto: string; cuerpo: string }) => {
      enviados.push(mensaje);
      return Promise.resolve();
    },
  };

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  interface PedidoDeLaLista {
    id: number;
    estado: string;
    canal: string;
    entrega: string;
    nombre: string;
    email: string;
    totalClp: number;
    requiereRevision: boolean;
    sinRetirar: boolean;
  }

  const iniciarSesion = async (quien: string, esAdmin: boolean) => {
    const email = `${quien}${DOMINIO}`;
    await prisma.usuario.create({
      data: {
        email,
        nombre: quien,
        apellido: 'De Prueba',
        esAdmin,
        passwordHash: await hashear(CONTRASENA),
      },
    });
    const sesion = await request(servidor())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);

    return (sesion.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  };

  let varianteId: number;

  /** Un pedido creado por la API pública, y llevado al estado que pida la prueba. */
  const pedido = async (
    datos: {
      entrega?: 'RETIRO' | 'DESPACHO';
      estado?: 'PENDIENTE_PAGO' | 'PAGADO' | 'LISTO_PARA_RETIRO' | 'DESPACHADO';
      nombre?: string;
    } = {},
  ) => {
    const { body } = (await request(servidor())
      .post('/api/tienda/pedidos')
      .send({
        lineas: [{ varianteId, cantidad: 1 }],
        nombre: datos.nombre ?? 'Camila Rojas',
        email: `camila${DOMINIO}`,
        telefono: '+56 9 8765 4321',
        entrega: datos.entrega ?? 'RETIRO',
        despacho:
          datos.entrega === 'DESPACHO'
            ? {
                region: 'La Araucanía',
                comuna: 'Temuco',
                direccion: 'Los Aromos 345',
              }
            : undefined,
      })
      .expect(201)) as { body: { token: string } };

    const estado = datos.estado ?? 'PAGADO';
    const { id } = await prisma.pedido.update({
      where: { token: body.token },
      data: {
        estado,
        pagadoEn: estado === 'PENDIENTE_PAGO' ? null : new Date(),
        listoEn: estado === 'LISTO_PARA_RETIRO' ? new Date() : null,
        despachadoEn: estado === 'DESPACHADO' ? new Date() : null,
      },
    });

    return id;
  };

  const lista = async (consulta = '') =>
    (
      (await request(servidor())
        .get(`/api/admin/tienda/pedidos${consulta}`)
        .set('Cookie', admin)
        .expect(200)) as { body: PedidoDeLaLista[] }
    ).body.filter((p) => p.email.endsWith(DOMINIO));

  const accion = (id: number, cual: string, cuerpo: object = {}) =>
    request(servidor())
      .post(`/api/admin/tienda/pedidos/${id}/${cual}`)
      .set('Cookie', admin)
      .send(cuerpo);

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
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);

    await limpiar();
    const viejos = await prisma.producto.findMany({
      where: { nombre: { startsWith: MARCA } },
      select: { id: true },
    });
    await prisma.movimientoStock.deleteMany({
      where: { variante: { productoId: { in: viejos.map((p) => p.id) } } },
    });
    await prisma.variante.deleteMany({
      where: { productoId: { in: viejos.map((p) => p.id) } },
    });
    await prisma.producto.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    process.env.TIENDA_HABILITADA = 'true';
    admin = await iniciarSesion('jefa', true);
    socio = await iniciarSesion('socia', false);
    raquetas = (
      await prisma.categoriaProducto.findUniqueOrThrow({
        where: { nombre: 'Raquetas' },
      })
    ).id;

    const { body } = (await request(servidor())
      .post('/api/admin/tienda/productos')
      .set('Cookie', admin)
      .send({
        nombre: `${MARCA} Pure Drive`,
        categoriaId: raquetas,
        precioClp: 249990,
        variantes: [{ etiqueta: 'Grip 2', stock: 100 }],
      })
      .expect(201)) as { body: { id: number; variantes: { id: number }[] } };
    varianteId = body.variantes[0].id;
    await request(servidor())
      .patch(`/api/admin/tienda/productos/${body.id}`)
      .set('Cookie', admin)
      .send({ publicado: true })
      .expect(200);
  });

  beforeEach(() => {
    process.env.TIENDA_HABILITADA = 'true';
    enviados.length = 0;
  });

  afterEach(limpiar);

  afterAll(async () => {
    delete process.env.TIENDA_HABILITADA;
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
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  it('solo para administración; con la tienda apagada, 404', async () => {
    await request(servidor())
      .get('/api/admin/tienda/pedidos')
      .set('Cookie', socio)
      .expect(403);

    process.env.TIENDA_HABILITADA = 'false';
    await request(servidor())
      .get('/api/admin/tienda/pedidos')
      .set('Cookie', admin)
      .expect(404);
  });

  describe('la lista', () => {
    it('**por omisión, lo que hay que atender**: pagados, listos y despachados', async () => {
      const pagado = await pedido({ estado: 'PAGADO' });
      const listo = await pedido({ estado: 'LISTO_PARA_RETIRO' });
      const despachado = await pedido({
        entrega: 'DESPACHO',
        estado: 'DESPACHADO',
      });
      const pendiente = await pedido({ estado: 'PENDIENTE_PAGO' });

      const ids = (await lista()).map((p) => p.id);

      expect(ids).toEqual(expect.arrayContaining([pagado, listo, despachado]));
      expect(ids).not.toContain(pendiente);
    });

    it('filtra por estado y por canal', async () => {
      const pagado = await pedido({ estado: 'PAGADO' });
      const listo = await pedido({ estado: 'LISTO_PARA_RETIRO' });

      expect(
        (await lista('?estado=LISTO_PARA_RETIRO')).map((p) => p.id),
      ).toEqual([listo]);
      expect((await lista('?canal=EN_LINEA')).map((p) => p.id)).toEqual(
        expect.arrayContaining([pagado, listo]),
      );
      expect(await lista('?canal=MESON')).toEqual([]);
    });

    it(`**un pendiente de más de ${MINUTOS_PARA_EXPIRAR} minutos pasa a expirado al listar**`, async () => {
      const vencido = await pedido({ estado: 'PENDIENTE_PAGO' });
      const vigente = await pedido({ estado: 'PENDIENTE_PAGO' });
      await prisma.pedido.update({
        where: { id: vencido },
        data: {
          creadoEn: new Date(Date.now() - (MINUTOS_PARA_EXPIRAR + 1) * 60_000),
        },
      });

      expect((await lista('?estado=EXPIRADO')).map((p) => p.id)).toEqual([
        vencido,
      ]);
      expect(
        (await prisma.pedido.findUniqueOrThrow({ where: { id: vigente } }))
          .estado,
      ).toBe('PENDIENTE_PAGO');
    });

    it('**las marcas se calculan al listar**: 30 días sin retirar y requiere revisión', async () => {
      const olvidado = await pedido({ estado: 'LISTO_PARA_RETIRO' });
      await prisma.pedido.update({
        where: { id: olvidado },
        data: { listoEn: new Date(Date.now() - 31 * 24 * 60 * 60_000) },
      });
      const reciente = await pedido({ estado: 'LISTO_PARA_RETIRO' });
      const enRevision = await pedido({ estado: 'PAGADO' });
      await prisma.pedido.update({
        where: { id: enRevision },
        data: { requiereRevision: true },
      });

      const porId = new Map((await lista()).map((p) => [p.id, p]));

      expect(porId.get(olvidado)?.sinRetirar).toBe(true);
      expect(porId.get(reciente)?.sinRetirar).toBe(false);
      expect(porId.get(enRevision)?.requiereRevision).toBe(true);
    });

    it('un estado que no existe responde 400', async () => {
      await request(servidor())
        .get('/api/admin/tienda/pedidos?estado=PERDIDO')
        .set('Cookie', admin)
        .expect(400);
    });
  });

  it('el detalle trae el contacto, la entrega y las líneas', async () => {
    const id = await pedido({ entrega: 'DESPACHO', estado: 'PAGADO' });

    const { body } = (await request(servidor())
      .get(`/api/admin/tienda/pedidos/${id}`)
      .set('Cookie', admin)
      .expect(200)) as {
      body: {
        email: string;
        telefono: string;
        comuna: string;
        lineas: { descripcion: string }[];
      };
    };

    expect(body).toMatchObject({
      email: `camila${DOMINIO}`,
      telefono: '56987654321',
      comuna: 'Temuco',
      lineas: [{ descripcion: `${MARCA} Pure Drive · Grip 2` }],
    });
  });

  describe('las acciones', () => {
    it('**listo para retirar**: cambia el estado y le escribe al comprador dónde y cuándo', async () => {
      const id = await pedido({ estado: 'PAGADO' });

      await accion(id, 'listo').expect(200);

      const guardado = await prisma.pedido.findUniqueOrThrow({ where: { id } });
      expect(guardado.estado).toBe('LISTO_PARA_RETIRO');
      expect(guardado.listoEn).not.toBeNull();
      expect(enviados).toHaveLength(1);
      expect(enviados[0]).toMatchObject({ para: `camila${DOMINIO}` });
      expect(enviados[0].asunto).toContain('listo para retirar');
    });

    it('**despachado**: exige el número de Starken y lo manda en el correo', async () => {
      const id = await pedido({ entrega: 'DESPACHO', estado: 'PAGADO' });

      await accion(id, 'despachado', { numeroSeguimiento: '' }).expect(400);
      await accion(id, 'despachado', {
        numeroSeguimiento: ' STK-123456 ',
      }).expect(200);

      const guardado = await prisma.pedido.findUniqueOrThrow({ where: { id } });
      expect(guardado).toMatchObject({
        estado: 'DESPACHADO',
        numeroSeguimiento: 'STK-123456',
      });
      expect(enviados).toHaveLength(1);
      expect(enviados[0].cuerpo).toContain('STK-123456');
    });

    it('entregado, desde listo o despachado; no escribe', async () => {
      const listo = await pedido({ estado: 'LISTO_PARA_RETIRO' });
      const despachado = await pedido({
        entrega: 'DESPACHO',
        estado: 'DESPACHADO',
      });

      await accion(listo, 'entregado').expect(200);
      await accion(despachado, 'entregado').expect(200);

      for (const id of [listo, despachado]) {
        const guardado = await prisma.pedido.findUniqueOrThrow({
          where: { id },
        });
        expect(guardado.estado).toBe('ENTREGADO');
        expect(guardado.entregadoEn).not.toBeNull();
      }
      expect(enviados).toHaveLength(0);
    });

    it.each([
      [
        'listo, a un despacho',
        { entrega: 'DESPACHO' as const, estado: 'PAGADO' as const },
        'listo',
      ],
      ['listo, dos veces', { estado: 'LISTO_PARA_RETIRO' as const }, 'listo'],
      ['despachado, a un retiro', { estado: 'PAGADO' as const }, 'despachado'],
      [
        'entregado, sin estar listo',
        { estado: 'PAGADO' as const },
        'entregado',
      ],
      ['listo, sin pagar', { estado: 'PENDIENTE_PAGO' as const }, 'listo'],
    ])(
      '**fuera de su estado responde 409**: %s',
      async (_caso, datos, cual) => {
        const id = await pedido(datos);

        await accion(id, cual, { numeroSeguimiento: 'STK-1' }).expect(409);
        expect(enviados).toHaveLength(0);
      },
    );

    it('un pedido que no existe responde 404', async () => {
      await accion(999999999, 'listo').expect(404);
    });
  });
});
