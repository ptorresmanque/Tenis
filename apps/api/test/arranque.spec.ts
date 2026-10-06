import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { arrancar, CATEGORIAS_DE_JUEGO } from '../src/arranque';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * D3 (tasks/plan-despliegue.md). Lo que corre el agente en QA y en producción después
 * de migrar: deja la base lista para usarse sin el seed de demostración, que tiene una
 * contraseña publicada en un repo público, y crea el primer admin desde el archivo que
 * le señala ADMIN_INICIAL.
 */
describe('Arranque de una base para QA y producción', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@arranque-d3.test';
  const CORREO = `admin${DOMINIO}`;
  const CLAVE = 'saque abierto en la cancha 3';
  const CANCHA = 'Cancha D3';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  /** Un admin-inicial.env como el que el dueño deja en el servidor. */
  function archivoAdmin(campos: Record<string, string>): string {
    const ruta = join(
      mkdtempSync(join(tmpdir(), 'arranque-')),
      'admin-inicial.env',
    );
    writeFileSync(
      ruta,
      Object.entries(campos)
        .map(([clave, valor]) => `${clave}="${valor}"`)
        .join('\n'),
    );
    return ruta;
  }

  const adminValido = (clave = CLAVE) =>
    archivoAdmin({
      ADMIN_CORREO: CORREO.toUpperCase(),
      ADMIN_NOMBRE: 'Jonatan',
      ADMIN_APELLIDO: 'Del Club',
      ADMIN_CLAVE: clave,
    });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: CANCHA } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: CANCHA } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  async function entrar(clave: string) {
    return request(servidor())
      .post('/api/auth/login')
      .send({ email: CORREO, contrasena: clave });
  }

  it('deja la configuración del club y las seis categorías de juego', async () => {
    await arrancar(prisma, undefined);

    expect(
      await prisma.configuracionClub.findUnique({ where: { id: 1 } }),
    ).not.toBeNull();
    expect(
      await prisma.categoriaJuego.count({
        where: { nombre: { in: CATEGORIAS_DE_JUEGO.map((c) => c.nombre) } },
      }),
    ).toBe(6);
  });

  it('sin ADMIN_INICIAL no crea ningún usuario y lo dice', async () => {
    const mensaje = await arrancar(prisma, '');

    expect(mensaje).toMatch(/sin admin inicial/);
    expect(
      await prisma.usuario.count({ where: { email: { endsWith: DOMINIO } } }),
    ).toBe(0);
  });

  it('el admin inicial entra y crea una cancha desde el panel', async () => {
    const mensaje = await arrancar(prisma, adminValido());

    expect(mensaje).toContain(CORREO);
    const login = await entrar(CLAVE);
    expect(login.status).toBe(204);
    const cookie = (
      login.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];
    await request(servidor())
      .post('/api/admin/canchas')
      .set('Cookie', cookie)
      .send({ nombre: CANCHA, superficie: 'ARCILLA' })
      .expect(201);
  });

  it('correrlo dos veces no duplica nada ni cambia la clave del admin', async () => {
    await arrancar(prisma, adminValido());
    await arrancar(prisma, adminValido('otra clave bastante larga'));

    expect(await prisma.usuario.count({ where: { email: CORREO } })).toBe(1);
    expect((await entrar(CLAVE)).status).toBe(204);
    expect(
      await prisma.categoriaJuego.count({
        where: { nombre: { in: CATEGORIAS_DE_JUEGO.map((c) => c.nombre) } },
      }),
    ).toBe(6);
  });

  it('una cuenta que ya existía queda como admin, con su clave intacta', async () => {
    await arrancar(prisma, adminValido());
    await prisma.usuario.update({
      where: { email: CORREO },
      data: { esAdmin: false },
    });

    await arrancar(prisma, adminValido('otra clave bastante larga'));

    expect(
      (await prisma.usuario.findUnique({ where: { email: CORREO } }))?.esAdmin,
    ).toBe(true);
    expect((await entrar(CLAVE)).status).toBe(204);
  });

  it.each([
    ['una clave corta', { ADMIN_CLAVE: 'corta' }, /al menos 10 caracteres/],
    ['una clave filtrada', { ADMIN_CLAVE: 'password123' }, /filtradas/],
    [
      'un correo inválido',
      { ADMIN_CORREO: 'no-es-un-correo' },
      /formato válido/,
    ],
    ['sin nombre', { ADMIN_NOMBRE: '' }, /Falta el nombre/],
  ])(
    'rechaza %s sin crear nada, nombrando el archivo',
    async (_caso, cambio, motivo) => {
      const ruta = archivoAdmin({
        ADMIN_CORREO: CORREO,
        ADMIN_NOMBRE: 'Jonatan',
        ADMIN_APELLIDO: 'Del Club',
        ADMIN_CLAVE: CLAVE,
        ...cambio,
      });

      await expect(arrancar(prisma, ruta)).rejects.toThrow(motivo);
      await expect(arrancar(prisma, ruta)).rejects.toThrow(/admin-inicial/);
      expect(
        await prisma.usuario.count({ where: { email: { endsWith: DOMINIO } } }),
      ).toBe(0);
    },
  );
});
