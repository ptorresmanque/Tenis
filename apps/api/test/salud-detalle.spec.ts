import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import { EstadoSocio } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import type { EstadoSalud } from '../src/salud/salud.service';

/**
 * T27. La pantalla de estado es del admin, y esconder su enlace no cierra nada: lo
 * que cierra es que el detalle del motor no salga por la API.
 *
 * `GET /api/salud` sigue siendo público a propósito. Un healthcheck de despliegue no
 * tiene sesión, y dejarlo tras el guard rompe el monitoreo para proteger algo que ya
 * no está ahí: la versión de MariaDB se fue a `/detalle`.
 */
describe('GET /api/salud y su detalle', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@salud.test';
  const CONTRASENA = 'raqueta lluviosa 44';

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
  });

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const sesionDe = async (quien: 'socio' | 'admin'): Promise<string> => {
    const email = `${quien}${DOMINIO}`;

    await prisma.usuario.create({
      data: {
        email,
        nombre: quien,
        apellido: 'De Prueba',
        esAdmin: quien === 'admin',
        passwordHash: await hashear(CONTRASENA),
        socio:
          quien === 'socio'
            ? {
                create: {
                  numeroSocio: `S-${quien}`,
                  estado: EstadoSocio.ACTIVO,
                  fechaIngreso: new Date('2026-01-01T00:00:00.000Z'),
                  alDiaHasta: new Date('2099-12-31T00:00:00.000Z'),
                },
              }
            : undefined,
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

  it('sin sesión responde si el sistema está sano', async () => {
    const respuesta = await request(servidor()).get('/api/salud').expect(200);

    expect((respuesta.body as EstadoSalud).estado).toBe('ok');
  });

  it('sin sesión no cuenta con qué motor corre el club', async () => {
    const respuesta = await request(servidor()).get('/api/salud').expect(200);

    // El texto entero, no solo la propiedad: es la fuga que la tarea cierra, y un
    // día alguien la va a devolver anidada en otra cosa.
    expect(JSON.stringify(respuesta.body)).not.toMatch(/MariaDB/i);
  });

  it('el detalle sin sesión responde 401', async () => {
    await request(servidor()).get('/api/salud/detalle').expect(401);
  });

  it('el detalle responde 403 a un socio', async () => {
    await request(servidor())
      .get('/api/salud/detalle')
      .set('Cookie', await sesionDe('socio'))
      .expect(403);
  });

  it('el admin sí ve la versión del motor', async () => {
    const respuesta = await request(servidor())
      .get('/api/salud/detalle')
      .set('Cookie', await sesionDe('admin'))
      .expect(200);

    expect((respuesta.body as EstadoSalud).baseDatos.versionMotor).toMatch(
      /MariaDB/i,
    );
  });
});
