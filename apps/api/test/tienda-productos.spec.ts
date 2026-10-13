import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { carpetaDeSubidas } from '../src/comun/imagenes';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';
import { moverStock } from '../src/tienda/stock';

/**
 * T158: los productos de la tienda, sus variantes, sus fotos y el stock.
 *
 * Lo que importa: **el stock solo cambia con su movimiento** —el stock inicial de una
 * variante es una entrada con su autor—, los códigos de barras no se repiten, un producto
 * no se publica sin algo que vender y no se borra nunca, y una foto quitada se va también
 * del disco (`SPEC-tienda.md` § Catálogo y § Stock).
 */
describe('Tienda: productos, variantes y stock', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let adminId: number;
  let carpeta: string;
  let categoriaId: number;

  const DOMINIO = '@tienda-t158.test';
  const CONTRASENA = 'raqueta lluviosa 158';
  /** Lo creado acá se distingue por el nombre, y los códigos por su prefijo. */
  const MARCA = '[Prueba T158]';
  const CODIGO = 'T158-';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const post = (ruta: string, cuerpo: unknown) =>
    request(servidor())
      .post(`/api/admin/tienda${ruta}`)
      .set('Cookie', admin)
      .send(cuerpo as object);
  const patch = (ruta: string, cuerpo: unknown) =>
    request(servidor())
      .patch(`/api/admin/tienda${ruta}`)
      .set('Cookie', admin)
      .send(cuerpo as object);
  const get = (ruta: string) =>
    request(servidor()).get(`/api/admin/tienda${ruta}`).set('Cookie', admin);

  interface VarianteDeLaFicha {
    id: number;
    etiqueta: string;
    codigoBarras: string | null;
    stock: number;
    activa: boolean;
  }
  interface FotoDeLaFicha {
    id: number;
    orden: number;
    miniatura: string;
    imagen: string;
  }
  interface Ficha {
    id: number;
    nombre: string;
    publicado: boolean;
    archivado: boolean;
    variantes: VarianteDeLaFicha[];
    fotos: FotoDeLaFicha[];
  }

  const crearProducto = async (cuerpo: Record<string, unknown> = {}) =>
    (
      await post('/productos', {
        nombre: `${MARCA} Babolat Pure Drive`,
        categoriaId,
        precioClp: 249990,
        ...cuerpo,
      }).expect(201)
    ).body as Ficha;

  const fotoDePrueba = () =>
    sharp({
      create: {
        width: 40,
        height: 30,
        channels: 3,
        background: { r: 200, g: 80, b: 20 },
      },
    })
      .jpeg()
      .toBuffer();

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
    await prisma.fotoProducto.deleteMany({
      where: { productoId: { in: ids } },
    });
    await prisma.producto.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'tienda-t158-'));
    process.env.SUBIDAS_DIR = carpeta;

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
    const creado = await prisma.usuario.create({
      data: {
        email,
        nombre: 'Jefa',
        apellido: 'De Prueba',
        esAdmin: true,
        passwordHash: await hashear(CONTRASENA),
      },
    });
    adminId = creado.id;
    const sesion = await request(servidor())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);
    admin = (sesion.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];

    // Raquetas viene de la migración de T156.
    categoriaId = (
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
    delete process.env.SUBIDAS_DIR;
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
    await rm(carpeta, { recursive: true, force: true });
  });

  describe('crear un producto', () => {
    it('**el stock inicial de cada variante es una entrada con su autor**', async () => {
      const ficha = await crearProducto({
        variantes: [
          { etiqueta: 'Grip 2', codigoBarras: `${CODIGO}0002`, stock: 3 },
          { etiqueta: 'Grip 3', codigoBarras: `${CODIGO}0003`, stock: 0 },
        ],
      });

      expect(
        ficha.variantes.map((v) => [v.etiqueta, v.codigoBarras, v.stock]),
      ).toEqual([
        ['Grip 2', `${CODIGO}0002`, 3],
        ['Grip 3', `${CODIGO}0003`, 0],
      ]);

      const movimientos = await prisma.movimientoStock.findMany({
        where: { variante: { productoId: ficha.id } },
      });
      // La que parte en cero no deja movimiento: no entró nada.
      expect(movimientos).toEqual([
        expect.objectContaining({
          cantidad: 3,
          motivo: 'ENTRADA',
          usuarioId: adminId,
        }),
      ]);
    });

    it('nace en borrador', async () => {
      const ficha = await crearProducto();

      expect(ficha).toMatchObject({ publicado: false, archivado: false });
    });

    it('una categoría que no existe responde 400', async () => {
      await post('/productos', {
        nombre: `${MARCA} Nada`,
        categoriaId: 999999,
        precioClp: 1000,
      }).expect(400);
    });

    it('un precio que no es un entero positivo responde 400', async () => {
      await post('/productos', {
        nombre: `${MARCA} Gratis`,
        categoriaId,
        precioClp: 0,
      }).expect(400);
      await post('/productos', {
        nombre: `${MARCA} Con decimales`,
        categoriaId,
        precioClp: 9990.5,
      }).expect(400);
    });

    it('dos variantes con la misma etiqueta en el pedido responden 400', async () => {
      await post('/productos', {
        nombre: `${MARCA} Repetida`,
        categoriaId,
        precioClp: 1000,
        variantes: [
          { etiqueta: 'M', stock: 1 },
          { etiqueta: 'm', stock: 1 },
        ],
      }).expect(400);
    });
  });

  describe('los códigos de barras', () => {
    it('**un código que ya tiene otra variante responde 409**', async () => {
      await crearProducto({
        variantes: [{ etiqueta: 'Única', codigoBarras: `${CODIGO}1111` }],
      });

      await post('/productos', {
        nombre: `${MARCA} Otra raqueta`,
        categoriaId,
        precioClp: 1000,
        variantes: [{ etiqueta: 'Única', codigoBarras: `${CODIGO}1111` }],
      }).expect(409);
    });

    it('agregar una variante con un código tomado también responde 409', async () => {
      await crearProducto({
        variantes: [{ etiqueta: 'Grip 2', codigoBarras: `${CODIGO}2222` }],
      });
      const otro = await crearProducto({ nombre: `${MARCA} Otra` });

      await post(`/productos/${otro.id}/variantes`, {
        etiqueta: 'Grip 4',
        codigoBarras: `${CODIGO}2222`,
      }).expect(409);
    });
  });

  describe('las variantes', () => {
    it('agregar una con stock deja su entrada', async () => {
      const ficha = await crearProducto();

      const { body } = (await post(`/productos/${ficha.id}/variantes`, {
        etiqueta: 'Grip 4',
        stock: 5,
      }).expect(201)) as { body: VarianteDeLaFicha };

      expect(body).toMatchObject({ etiqueta: 'Grip 4', stock: 5 });
      expect(
        await prisma.movimientoStock.count({ where: { varianteId: body.id } }),
      ).toBe(1);
    });

    it('una etiqueta que el producto ya tiene responde 409', async () => {
      const ficha = await crearProducto({
        variantes: [{ etiqueta: 'Grip 2' }],
      });

      await post(`/productos/${ficha.id}/variantes`, {
        etiqueta: 'grip 2',
      }).expect(409);
    });

    it('se corrige la etiqueta, el código y si está activa', async () => {
      const ficha = await crearProducto({
        variantes: [{ etiqueta: 'Grip2' }],
      });
      const id = ficha.variantes[0].id;

      const { body } = (await patch(`/variantes/${id}`, {
        etiqueta: 'Grip 2',
        codigoBarras: `${CODIGO}3333`,
        activa: false,
      }).expect(200)) as { body: VarianteDeLaFicha };

      expect(body).toMatchObject({
        etiqueta: 'Grip 2',
        codigoBarras: `${CODIGO}3333`,
        activa: false,
      });
    });

    it('**el stock no se edita a mano**: se cambia con una entrada o un ajuste', async () => {
      const ficha = await crearProducto({
        variantes: [{ etiqueta: 'Grip 2', stock: 1 }],
      });

      await patch(`/variantes/${ficha.variantes[0].id}`, { stock: 50 }).expect(
        400,
      );
      expect(
        (
          await prisma.variante.findUniqueOrThrow({
            where: { id: ficha.variantes[0].id },
          })
        ).stock,
      ).toBe(1);
    });
  });

  describe('publicar, archivar y nunca borrar', () => {
    it('**un producto sin variantes activas no se publica**', async () => {
      const ficha = await crearProducto();

      await patch(`/productos/${ficha.id}`, { publicado: true }).expect(409);
    });

    it('con una variante activa se publica y se despublica', async () => {
      const ficha = await crearProducto({
        variantes: [{ etiqueta: 'Grip 2', stock: 1 }],
      });

      const publicada = (
        await patch(`/productos/${ficha.id}`, { publicado: true }).expect(200)
      ).body as Ficha;
      expect(publicada.publicado).toBe(true);

      const despublicada = (
        await patch(`/productos/${ficha.id}`, { publicado: false }).expect(200)
      ).body as Ficha;
      expect(despublicada.publicado).toBe(false);
    });

    it('archivar lo saca de la tienda: queda despublicado', async () => {
      const ficha = await crearProducto({
        variantes: [{ etiqueta: 'Grip 2', stock: 1 }],
      });
      await patch(`/productos/${ficha.id}`, { publicado: true }).expect(200);

      const archivado = (
        await patch(`/productos/${ficha.id}`, { archivado: true }).expect(200)
      ).body as Ficha;

      expect(archivado).toMatchObject({ archivado: true, publicado: false });
    });

    it('un archivado no se publica', async () => {
      const ficha = await crearProducto({
        variantes: [{ etiqueta: 'Grip 2', stock: 1 }],
      });
      await patch(`/productos/${ficha.id}`, { archivado: true }).expect(200);

      await patch(`/productos/${ficha.id}`, { publicado: true }).expect(409);
    });

    it('**no hay cómo borrar un producto**', async () => {
      const ficha = await crearProducto();

      await request(servidor())
        .delete(`/api/admin/tienda/productos/${ficha.id}`)
        .set('Cookie', admin)
        .expect(404);
      expect(await prisma.producto.count({ where: { id: ficha.id } })).toBe(1);
    });

    it('la lista dice el stock de la variante más baja, para filtrar lo que se agota (T159)', async () => {
      // El total no sirve: +5 y −1 suman 4 y esconden la talla que se debe.
      const ficha = await crearProducto({
        variantes: [
          { etiqueta: 'Grip 2', stock: 5 },
          { etiqueta: 'Grip 3', stock: 1 },
          { etiqueta: 'Grip 4', stock: 0 },
        ],
      });
      // La inactiva no cuenta: ya no se vende.
      await patch(`/variantes/${ficha.variantes[2].id}`, {
        activa: false,
      }).expect(200);
      await prisma.$transaction((tx) =>
        moverStock(tx, {
          varianteId: ficha.variantes[1].id,
          cantidad: -2,
          motivo: 'VENTA',
          usuarioId: null,
        }),
      );

      const lista = (await get('/productos').expect(200)).body as {
        id: number;
        stockTotal: number;
        stockMinimo: number | null;
      }[];

      expect(lista.find((p) => p.id === ficha.id)).toMatchObject({
        stockTotal: 4,
        stockMinimo: -1,
      });
    });

    it('sin variantes activas, el stock más bajo es nulo', async () => {
      const ficha = await crearProducto();

      const lista = (await get('/productos').expect(200)).body as {
        id: number;
        stockMinimo: number | null;
      }[];

      expect(lista.find((p) => p.id === ficha.id)?.stockMinimo).toBeNull();
    });

    it('la lista no trae los archivados, salvo que se pidan', async () => {
      const visible = await crearProducto({ nombre: `${MARCA} Visible` });
      const guardado = await crearProducto({ nombre: `${MARCA} Guardado` });
      await patch(`/productos/${guardado.id}`, { archivado: true }).expect(200);

      const nombres = async (consulta: string) =>
        ((await get(`/productos${consulta}`).expect(200)).body as Ficha[])
          .filter((p) => p.nombre.startsWith(MARCA))
          .map((p) => p.id);

      expect(await nombres('')).toEqual([visible.id]);
      expect(await nombres('?estado=archivado')).toEqual([guardado.id]);
    });
  });

  describe('las fotos', () => {
    const subir = async (productoId: number) =>
      (
        await request(servidor())
          .post(`/api/admin/tienda/productos/${productoId}/fotos`)
          .set('Cookie', admin)
          .attach('foto', await fotoDePrueba(), 'raqueta.jpg')
          .expect(201)
      ).body as FotoDeLaFicha;

    it('se guardan reducidas, con miniatura, y van al final', async () => {
      const ficha = await crearProducto();

      const primera = await subir(ficha.id);
      const segunda = await subir(ficha.id);

      expect(segunda.orden).toBeGreaterThan(primera.orden);
      const fila = await prisma.fotoProducto.findUniqueOrThrow({
        where: { id: primera.id },
      });
      await expect(
        stat(join(carpetaDeSubidas(), fila.rutaWeb)),
      ).resolves.toBeDefined();
      await expect(
        stat(join(carpetaDeSubidas(), fila.rutaMiniatura)),
      ).resolves.toBeDefined();
    });

    it('se sirven por su id, como imagen', async () => {
      const ficha = await crearProducto();
      const foto = await subir(ficha.id);

      const respuesta = await request(servidor())
        .get(foto.miniatura)
        .expect(200);

      expect(respuesta.headers['content-type']).toContain('image/jpeg');
    });

    it('**con la tienda apagada, ni las fotos responden**', async () => {
      const ficha = await crearProducto();
      const foto = await subir(ficha.id);
      process.env.TIENDA_HABILITADA = 'false';

      await request(servidor()).get(foto.miniatura).expect(404);
    });

    it('se reordenan con la lista entera de ids', async () => {
      const ficha = await crearProducto();
      const a = await subir(ficha.id);
      const b = await subir(ficha.id);

      await request(servidor())
        .put(`/api/admin/tienda/productos/${ficha.id}/fotos/orden`)
        .set('Cookie', admin)
        .send({ ids: [b.id, a.id] })
        .expect(200);

      const despues = (await get(`/productos/${ficha.id}`).expect(200))
        .body as Ficha;
      expect(despues.fotos.map((f) => f.id)).toEqual([b.id, a.id]);
    });

    it('un orden que no trae exactamente sus fotos responde 400', async () => {
      const ficha = await crearProducto();
      const a = await subir(ficha.id);
      await subir(ficha.id);

      await request(servidor())
        .put(`/api/admin/tienda/productos/${ficha.id}/fotos/orden`)
        .set('Cookie', admin)
        .send({ ids: [a.id] })
        .expect(400);
    });

    it('**quitar una foto la borra también del disco**', async () => {
      const ficha = await crearProducto();
      const foto = await subir(ficha.id);
      const fila = await prisma.fotoProducto.findUniqueOrThrow({
        where: { id: foto.id },
      });

      await request(servidor())
        .delete(`/api/admin/tienda/productos/${ficha.id}/fotos/${foto.id}`)
        .set('Cookie', admin)
        .expect(200);

      await expect(
        stat(join(carpetaDeSubidas(), fila.rutaWeb)),
      ).rejects.toThrow();
      await expect(
        stat(join(carpetaDeSubidas(), fila.rutaMiniatura)),
      ).rejects.toThrow();
    });

    it('un archivo que no es imagen responde 400', async () => {
      const ficha = await crearProducto();

      await request(servidor())
        .post(`/api/admin/tienda/productos/${ficha.id}/fotos`)
        .set('Cookie', admin)
        .attach('foto', Buffer.from('<?php echo 1; ?>'), 'foto.jpg')
        .expect(400);
    });
  });

  describe('moverStock', () => {
    const variante = async (stock = 0) =>
      (
        await crearProducto({
          variantes: [{ etiqueta: 'Única', stock }],
        })
      ).variantes[0].id;

    it('suma o resta y deja el movimiento, en la misma transacción', async () => {
      const id = await variante(2);

      const movido = await prisma.$transaction((tx) =>
        moverStock(tx, {
          varianteId: id,
          cantidad: -1,
          motivo: 'VENTA',
          usuarioId: null,
        }),
      );

      expect(movido).toMatchObject({ stock: 1 });
      expect(
        (
          await prisma.movimientoStock.findMany({
            where: { varianteId: id },
            orderBy: { id: 'asc' },
          })
        ).map((m) => [m.motivo, m.cantidad]),
      ).toEqual([
        ['ENTRADA', 2],
        ['VENTA', -1],
      ]);
    });

    it('**si la transacción se cae, no queda ni el stock ni el movimiento**', async () => {
      const id = await variante(2);

      await expect(
        prisma.$transaction(async (tx) => {
          await moverStock(tx, {
            varianteId: id,
            cantidad: -1,
            motivo: 'VENTA',
            usuarioId: null,
          });
          throw new Error('se cayó lo que venía después');
        }),
      ).rejects.toThrow('se cayó');

      expect(
        (await prisma.variante.findUniqueOrThrow({ where: { id } })).stock,
      ).toBe(2);
      expect(
        await prisma.movimientoStock.count({ where: { varianteId: id } }),
      ).toBe(1);
    });

    it('**puede dejar el stock negativo**: el encargo y el mesón lo necesitan', async () => {
      const id = await variante(0);

      const movido = await prisma.$transaction((tx) =>
        moverStock(tx, {
          varianteId: id,
          cantidad: -1,
          motivo: 'VENTA',
          usuarioId: null,
        }),
      );

      expect(movido).toMatchObject({ stock: -1 });
    });

    it('un ajuste sin nota no se hace', async () => {
      const id = await variante(2);

      await expect(
        prisma.$transaction((tx) =>
          moverStock(tx, {
            varianteId: id,
            cantidad: -1,
            motivo: 'AJUSTE',
            usuarioId: adminId,
          }),
        ),
      ).rejects.toThrow('nota');
    });

    it('un movimiento de cero no se hace', async () => {
      const id = await variante(2);

      await expect(
        prisma.$transaction((tx) =>
          moverStock(tx, {
            varianteId: id,
            cantidad: 0,
            motivo: 'ENTRADA',
            usuarioId: adminId,
          }),
        ),
      ).rejects.toThrow();
    });
  });
});
