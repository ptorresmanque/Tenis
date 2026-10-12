import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoSocio } from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';
import { moverStock } from '../src/tienda/stock';

/**
 * T161: el catálogo público de la tienda.
 *
 * Lo que importa: **solo se ve lo que se puede comprar** —publicado, sin archivar y con
 * alguna variante activa—; las tallas salen en los tres sistemas con la tabla de la marca;
 * y **el precio de socio lo ve solo el socio activo y al día**, calculado en el servidor.
 */
describe('Tienda: el catálogo público', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let socioAlDia: string;
  let socioMoroso: string;
  let zapatillas: number;
  let raquetas: number;

  const DOMINIO = '@tienda-t161.test';
  const CONTRASENA = 'raqueta lluviosa 161';
  const MARCA = '[Prueba T161]';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  interface ProductoDelCatalogo {
    id: number;
    nombre: string;
    precioClp: number;
    precioSocioClp: number | null;
    agotado: boolean;
    foto: string | null;
  }
  interface FichaPublica {
    id: number;
    nombre: string;
    precioSocioClp: number | null;
    variantes: { etiqueta: string; talla: string; disponible: number }[];
    tallas: { tallaCl: string; tallaUs: string; tallaEu: string }[];
  }

  const catalogo = async (consulta = '', cookie?: string) => {
    const peticion = request(servidor()).get(
      `/api/tienda/productos${consulta}`,
    );
    if (cookie) peticion.set('Cookie', cookie);
    return ((await peticion.expect(200)).body as ProductoDelCatalogo[]).filter(
      (p) => p.nombre.startsWith(MARCA),
    );
  };

  const nombres = async (consulta = '') =>
    (await catalogo(consulta)).map((p) => p.nombre.replace(`${MARCA} `, ''));

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
          numeroSocio: `T161-${quien}`,
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

  /** Un producto armado con la API del panel, publicado salvo que se diga otra cosa. */
  const producto = async (
    nombre: string,
    datos: {
      categoriaId?: number;
      marcaId?: number | null;
      precioClp?: number;
      variantes?: { etiqueta: string; stock?: number }[];
      publicar?: boolean;
      archivar?: boolean;
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
    if (datos.archivar) {
      await request(servidor())
        .patch(`/api/admin/tienda/productos/${body.id}`)
        .set('Cookie', admin)
        .send({ archivado: true })
        .expect(200);
    }

    return body;
  };

  const marca = async (
    nombre: string,
    tallas: { tallaCl: string; tallaUs: string; tallaEu: string }[],
  ) => {
    const { body } = (await request(servidor())
      .post('/api/admin/tienda/marcas')
      .set('Cookie', admin)
      .send({ nombre: `${MARCA} ${nombre}` })
      .expect(201)) as { body: { id: number } };
    await request(servidor())
      .put(`/api/admin/tienda/marcas/${body.id}/tallas`)
      .set('Cookie', admin)
      .send({ tallas })
      .expect(200);

    return body.id;
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
    await prisma.categoriaProducto.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
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
    socioMoroso = await iniciarSesion('moroso', {
      alDiaHasta: new Date('2020-01-31T00:00:00.000Z'),
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

  it('con la tienda apagada, el catálogo público responde 404', async () => {
    process.env.TIENDA_HABILITADA = 'false';

    await request(servidor()).get('/api/tienda/productos').expect(404);
    await request(servidor()).get('/api/tienda/filtros').expect(404);
  });

  describe('qué se ve', () => {
    it('**solo lo publicado, sin archivar y con alguna variante activa**', async () => {
      await producto('Visible');
      await producto('Borrador', { publicar: false });
      await producto('Archivado', { archivar: true });
      const sinActivas = await producto('Sin variantes activas');
      await request(servidor())
        .patch(`/api/admin/tienda/variantes/${sinActivas.variantes[0].id}`)
        .set('Cookie', admin)
        .send({ activa: false })
        .expect(200);

      expect(await nombres()).toEqual(['Visible']);
    });

    it('la ficha de uno que no se ve responde 404', async () => {
      const borrador = await producto('Borrador', { publicar: false });

      await request(servidor())
        .get(`/api/tienda/productos/${borrador.id}`)
        .expect(404);
    });

    it('lo que no tiene stock en ninguna variante sale como agotado', async () => {
      const sinStock = await producto('Sin stock', {
        variantes: [{ etiqueta: 'Única', stock: 1 }],
      });
      await prisma.$transaction((tx) =>
        moverStock(tx, {
          varianteId: sinStock.variantes[0].id,
          cantidad: -2,
          motivo: 'VENTA',
        }),
      );
      await producto('Con stock');

      const lista = await catalogo();
      expect(lista.find((p) => p.nombre.endsWith('Sin stock'))?.agotado).toBe(
        true,
      );
      expect(lista.find((p) => p.nombre.endsWith('Con stock'))?.agotado).toBe(
        false,
      );
    });
  });

  describe('filtros y orden', () => {
    it('por categoría, por marca y por rango de precio', async () => {
      const babolat = await marca('Babolat', []);
      await producto('Raqueta cara', { precioClp: 250000, marcaId: babolat });
      await producto('Raqueta barata', { precioClp: 40000 });
      await producto('Zapatilla', {
        categoriaId: zapatillas,
        precioClp: 90000,
        variantes: [{ etiqueta: '40', stock: 1 }],
      });

      expect(await nombres(`?categoriaId=${zapatillas}`)).toEqual([
        'Zapatilla',
      ]);
      expect(await nombres(`?marcaId=${babolat}`)).toEqual(['Raqueta cara']);
      expect(await nombres('?precioMin=50000&precioMax=100000')).toEqual([
        'Zapatilla',
      ]);
    });

    it('por talla: lo que tiene una variante activa con esa etiqueta', async () => {
      await producto('Talla 40', {
        categoriaId: zapatillas,
        variantes: [
          { etiqueta: '40', stock: 1 },
          { etiqueta: '41', stock: 1 },
        ],
      });
      await producto('Talla 42', {
        categoriaId: zapatillas,
        variantes: [{ etiqueta: '42', stock: 1 }],
      });

      expect(await nombres('?talla=40')).toEqual(['Talla 40']);
    });

    it('por precio, de menor a mayor y al revés; por omisión, lo más nuevo primero', async () => {
      await producto('Media', { precioClp: 20000 });
      await producto('Barata', { precioClp: 10000 });
      await producto('Cara', { precioClp: 30000 });

      expect(await nombres('?orden=precio-asc')).toEqual([
        'Barata',
        'Media',
        'Cara',
      ]);
      expect(await nombres('?orden=precio-desc')).toEqual([
        'Cara',
        'Media',
        'Barata',
      ]);
      expect(await nombres()).toEqual(['Cara', 'Barata', 'Media']);
    });

    it('un filtro que no se entiende responde 400', async () => {
      await request(servidor())
        .get('/api/tienda/productos?orden=alfabetico')
        .expect(400);
      await request(servidor())
        .get('/api/tienda/productos?precioMin=barato')
        .expect(400);
    });

    it('/api/tienda/filtros trae lo que hay para filtrar, solo de lo que se ve', async () => {
      const asics = await marca('Asics', []);
      await producto('Zapatilla', {
        categoriaId: zapatillas,
        marcaId: asics,
        precioClp: 90000,
        variantes: [
          { etiqueta: '41', stock: 1 },
          { etiqueta: '40', stock: 1 },
        ],
      });
      // Una categoría y una marca propias: las de la migración pueden tener productos
      // visibles de otra prueba, y esta solo puede afirmar sobre lo que creó.
      const { body: escondida } = (await request(servidor())
        .post('/api/admin/tienda/categorias')
        .set('Cookie', admin)
        .send({ nombre: `${MARCA} Escondida` })
        .expect(201)) as { body: { id: number } };
      const sinNadaALaVenta = await marca('Sin nada a la venta', []);
      await producto('Raqueta escondida', {
        categoriaId: escondida.id,
        marcaId: sinNadaALaVenta,
        publicar: false,
        precioClp: 999000,
      });

      const { body } = (await request(servidor())
        .get('/api/tienda/filtros')
        .expect(200)) as {
        body: {
          categorias: { id: number; nombre: string }[];
          marcas: { id: number; nombre: string }[];
          tallas: string[];
          precioMin: number | null;
          precioMax: number | null;
        };
      };

      expect(body.categorias.map((c) => c.id)).toContain(zapatillas);
      expect(body.categorias.map((c) => c.id)).not.toContain(escondida.id);
      expect(body.marcas.map((m) => m.id)).toContain(asics);
      expect(body.marcas.map((m) => m.id)).not.toContain(sinNadaALaVenta);
      expect(body.tallas).toEqual(expect.arrayContaining(['40', '41']));
      expect(body.precioMax).not.toBe(999000);
    });
  });

  describe('la ficha y sus tallas', () => {
    it('**en zapatillas, la talla sale en CL, US y EU con la tabla de la marca**', async () => {
      const asics = await marca('Asics', [
        { tallaCl: '40', tallaUs: '8', tallaEu: '41' },
      ]);
      const zapatilla = await producto('Gel Resolution', {
        categoriaId: zapatillas,
        marcaId: asics,
        variantes: [
          { etiqueta: '40', stock: 2 },
          { etiqueta: '41', stock: 0 },
        ],
      });

      const { body } = (await request(servidor())
        .get(`/api/tienda/productos/${zapatilla.id}`)
        .expect(200)) as { body: FichaPublica };

      expect(
        body.variantes.map((v) => [v.etiqueta, v.talla, v.disponible]),
      ).toEqual([
        ['40', 'CL 40 · US 8 · EU 41', 2],
        // La marca no trae el 41: va la etiqueta sola, sin inventar una conversión.
        ['41', '41', 0],
      ]);
      // Y la tabla de la marca, para que el comprador la consulte en la ficha.
      expect(body.tallas).toEqual([
        { tallaCl: '40', tallaUs: '8', tallaEu: '41' },
      ]);
    });

    it('una variante inactiva no aparece, y un stock negativo se ve como cero', async () => {
      const raqueta = await producto('Pure Drive', {
        variantes: [
          { etiqueta: 'Grip 2', stock: 1 },
          { etiqueta: 'Grip 3', stock: 1 },
        ],
      });
      await request(servidor())
        .patch(`/api/admin/tienda/variantes/${raqueta.variantes[1].id}`)
        .set('Cookie', admin)
        .send({ activa: false })
        .expect(200);
      await prisma.$transaction((tx) =>
        moverStock(tx, {
          varianteId: raqueta.variantes[0].id,
          cantidad: -3,
          motivo: 'VENTA',
        }),
      );

      const { body } = (await request(servidor())
        .get(`/api/tienda/productos/${raqueta.id}`)
        .expect(200)) as { body: FichaPublica };

      expect(body.variantes.map((v) => [v.etiqueta, v.disponible])).toEqual([
        ['Grip 2', 0],
      ]);
    });
  });

  describe('el precio de socio', () => {
    it('**lo ve el socio activo y al día, calculado en el servidor**', async () => {
      const raqueta = await producto('Pure Drive', { precioClp: 249990 });

      expect((await catalogo('', socioAlDia))[0].precioSocioClp).toBe(212491);
      const { body } = (await request(servidor())
        .get(`/api/tienda/productos/${raqueta.id}`)
        .set('Cookie', socioAlDia)
        .expect(200)) as { body: FichaPublica };
      expect(body.precioSocioClp).toBe(212491);
    });

    it('un visitante, un admin que no es socio y un socio moroso no lo ven', async () => {
      await producto('Pure Drive', { precioClp: 249990 });

      expect((await catalogo())[0].precioSocioClp).toBeNull();
      expect((await catalogo('', admin))[0].precioSocioClp).toBeNull();
      expect((await catalogo('', socioMoroso))[0].precioSocioClp).toBeNull();
    });
  });
});
