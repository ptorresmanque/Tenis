import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T156: el interruptor de la tienda, y las categorías, las marcas y sus tablas de tallas.
 *
 * Lo que importa del interruptor es que **con la variable apagada la tienda no existe**:
 * 404 en todo su panel, también para un admin, y no un 403 que delate que hay algo
 * detrás (`SPEC-tienda.md` § El interruptor). Del catálogo, que los nombres no se
 * repitan y que la tabla de tallas de una marca se guarde entera.
 */
describe('Tienda: el interruptor y el catálogo del panel', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let socio: string;

  const DOMINIO = '@tienda-t156.test';
  const CONTRASENA = 'raqueta lluviosa 156';
  /** Lo creado acá se distingue por el nombre: las tablas traen otras filas. */
  const MARCA = '[Prueba T156]';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const crearCuenta = async (quien: string, esAdmin: boolean) => {
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

    const respuesta = await request(servidor())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);

    return (respuesta.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  };

  const get = (ruta: string, cookie = admin) =>
    request(servidor()).get(`/api/admin/tienda${ruta}`).set('Cookie', cookie);
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
  const put = (ruta: string, cuerpo: unknown) =>
    request(servidor())
      .put(`/api/admin/tienda${ruta}`)
      .set('Cookie', admin)
      .send(cuerpo as object);

  const limpiar = async () => {
    // Las tallas caen con su marca.
    await prisma.marca.deleteMany({ where: { nombre: { startsWith: MARCA } } });
    await prisma.categoriaProducto.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
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
    admin = await crearCuenta('jefa', true);
    socio = await crearCuenta('socio', false);
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

  describe('el interruptor', () => {
    it('**apagado, el panel de la tienda responde 404, también al admin**', async () => {
      process.env.TIENDA_HABILITADA = 'false';

      await get('/categorias').expect(404);
      await get('').expect(404);
    });

    it('sin la variable, la tienda tampoco existe', async () => {
      delete process.env.TIENDA_HABILITADA;

      await get('/categorias').expect(404);
    });

    it('encendido, el panel responde', async () => {
      await get('/categorias').expect(200);
    });

    it('encendido, un socio que no es admin recibe 403', async () => {
      await get('/categorias', socio).expect(403);
    });

    it('GET /api/club dice si la tienda está habilitada', async () => {
      const encendida = await request(servidor()).get('/api/club').expect(200);
      expect(encendida.body).toMatchObject({ tiendaHabilitada: true });

      process.env.TIENDA_HABILITADA = 'false';
      const apagada = await request(servidor()).get('/api/club').expect(200);
      expect(apagada.body).toMatchObject({ tiendaHabilitada: false });
    });
  });

  describe('las categorías', () => {
    it('la migración trae las seis del club, y zapatillas usa tabla de tallas', async () => {
      const body: unknown = (await get('/categorias').expect(200)).body;
      const delClub = (
        body as { nombre: string; usaTablaDeTallas: boolean }[]
      ).filter((c) => !c.nombre.startsWith(MARCA));

      expect(delClub.map((c) => c.nombre)).toEqual([
        'Zapatillas',
        'Raquetas',
        'Ropa',
        'Pelotas',
        'Cuerdas',
        'Accesorios',
      ]);
      expect(delClub.find((c) => c.nombre === 'Zapatillas')).toMatchObject({
        usaTablaDeTallas: true,
      });
      expect(
        delClub.filter((c) => c.usaTablaDeTallas).map((c) => c.nombre),
      ).toEqual(['Zapatillas']);
    });

    it('el admin crea una y la ve en la lista, en el orden que eligió', async () => {
      await post('/categorias', {
        nombre: `${MARCA} Bolsos`,
        orden: 902,
      }).expect(201);
      await post('/categorias', {
        nombre: `${MARCA} Calcetines`,
        orden: 901,
        usaTablaDeTallas: true,
      }).expect(201);

      const body: unknown = (await get('/categorias').expect(200)).body;
      const nuestras = (body as { nombre: string }[]).filter((c) =>
        c.nombre.startsWith(MARCA),
      );

      expect(nuestras).toEqual([
        expect.objectContaining({
          nombre: `${MARCA} Calcetines`,
          usaTablaDeTallas: true,
        }),
        expect.objectContaining({
          nombre: `${MARCA} Bolsos`,
          usaTablaDeTallas: false,
        }),
      ]);
    });

    it('sin orden, la nueva queda al final', async () => {
      const body: unknown = (
        await post('/categorias', {
          nombre: `${MARCA} Grips`,
        }).expect(201)
      ).body;

      const todas: unknown = (await get('/categorias').expect(200)).body;
      const ordenes = (todas as { orden: number }[]).map((c) => c.orden);

      expect((body as { orden: number }).orden).toBe(Math.max(...ordenes));
    });

    it('**un nombre repetido responde 409**, aunque cambien las mayúsculas', async () => {
      await post('/categorias', { nombre: `${MARCA} Bolsos` }).expect(201);

      await post('/categorias', { nombre: `${MARCA} Bolsos` }).expect(409);
      await post('/categorias', { nombre: `${MARCA} BOLSOS` }).expect(409);
    });

    it('sin nombre responde 400', async () => {
      await post('/categorias', { nombre: '  ' }).expect(400);
    });

    it('se edita el nombre y si usa tabla de tallas', async () => {
      const body: unknown = (
        await post('/categorias', {
          nombre: `${MARCA} Poleras`,
        }).expect(201)
      ).body;
      const id = (body as { id: number }).id;

      const editada: unknown = (
        await patch(`/categorias/${id}`, {
          nombre: `${MARCA} Poleras y polerones`,
          usaTablaDeTallas: true,
        }).expect(200)
      ).body;

      expect(editada).toMatchObject({
        nombre: `${MARCA} Poleras y polerones`,
        usaTablaDeTallas: true,
      });
    });

    it('editar una que no existe responde 404', async () => {
      await patch('/categorias/999999', { nombre: `${MARCA} Nada` }).expect(
        404,
      );
    });
  });

  describe('las marcas y su tabla de tallas', () => {
    const crearMarca = async (nombre: string) =>
      ((await post('/marcas', { nombre }).expect(201)).body as { id: number })
        .id;

    it('el admin crea una marca, y un nombre repetido responde 409', async () => {
      await crearMarca(`${MARCA} Babolat`);

      await post('/marcas', { nombre: `${MARCA} babolat` }).expect(409);
    });

    it('se renombra una marca', async () => {
      const id = await crearMarca(`${MARCA} Wilsn`);

      const body: unknown = (
        await patch(`/marcas/${id}`, {
          nombre: `${MARCA} Wilson`,
        }).expect(200)
      ).body;

      expect(body).toMatchObject({ nombre: `${MARCA} Wilson` });
    });

    it('**la tabla se guarda entera, en el orden en que se escribió**', async () => {
      const id = await crearMarca(`${MARCA} Asics`);
      const tabla = [
        { tallaCl: '40', tallaUs: '8', tallaEu: '41' },
        { tallaCl: '39', tallaUs: '7', tallaEu: '40' },
      ];

      await put(`/marcas/${id}/tallas`, { tallas: tabla }).expect(200);

      const body: unknown = (await get(`/marcas/${id}/tallas`).expect(200))
        .body;
      expect(body).toEqual(tabla);
    });

    it('guardarla de nuevo reemplaza la anterior entera', async () => {
      const id = await crearMarca(`${MARCA} Head`);

      await put(`/marcas/${id}/tallas`, {
        tallas: [
          { tallaCl: '40', tallaUs: '8', tallaEu: '41' },
          { tallaCl: '41', tallaUs: '9', tallaEu: '42' },
        ],
      }).expect(200);
      await put(`/marcas/${id}/tallas`, {
        tallas: [{ tallaCl: '42', tallaUs: '10', tallaEu: '43' }],
      }).expect(200);

      const body: unknown = (await get(`/marcas/${id}/tallas`).expect(200))
        .body;
      expect(body).toEqual([{ tallaCl: '42', tallaUs: '10', tallaEu: '43' }]);
    });

    it('una tabla vacía borra la tabla de la marca', async () => {
      const id = await crearMarca(`${MARCA} Yonex`);

      await put(`/marcas/${id}/tallas`, {
        tallas: [{ tallaCl: '40', tallaUs: '8', tallaEu: '41' }],
      }).expect(200);
      await put(`/marcas/${id}/tallas`, { tallas: [] }).expect(200);

      const body: unknown = (await get(`/marcas/${id}/tallas`).expect(200))
        .body;
      expect(body).toEqual([]);
    });

    it('**dos filas con la misma talla CL responden 400** y no guardan nada', async () => {
      const id = await crearMarca(`${MARCA} Prince`);

      const body: unknown = (
        await put(`/marcas/${id}/tallas`, {
          tallas: [
            { tallaCl: '40', tallaUs: '8', tallaEu: '41' },
            { tallaCl: '40', tallaUs: '8.5', tallaEu: '41.5' },
          ],
        }).expect(400)
      ).body;

      expect((body as { message: string }).message).toContain('40');
      expect((await get(`/marcas/${id}/tallas`).expect(200)).body).toEqual([]);
    });

    it('una fila con una talla vacía responde 400', async () => {
      const id = await crearMarca(`${MARCA} Dunlop`);

      await put(`/marcas/${id}/tallas`, {
        tallas: [{ tallaCl: '40', tallaUs: '', tallaEu: '41' }],
      }).expect(400);
    });

    it('la tabla de una marca que no existe responde 404', async () => {
      await get('/marcas/999999/tallas').expect(404);
      await put('/marcas/999999/tallas', { tallas: [] }).expect(404);
    });
  });
});
