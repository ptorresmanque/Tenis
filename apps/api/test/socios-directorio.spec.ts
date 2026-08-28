import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoSocio } from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { SocioDelDirectorio } from '../src/identidad/socios/directorio.controller';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * `GET /api/socios`: con quién puede jugar un socio.
 *
 * Existe para que el formulario de reserva ofrezca una lista en vez de pedir un
 * número de socio de memoria. Lo que se prueba es lo que **no** sale: uno mismo, los
 * socios que ya no están activos, y todo dato de contacto.
 */
describe('Directorio de socios', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@directorio.test';
  const CONTRASENA = 'raqueta lluviosa 44';

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

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

  const crear = async (
    quien: string,
    ficha: { numeroSocio: string; estado: EstadoSocio } | null,
  ): Promise<string> => {
    const email = `${quien}${DOMINIO}`;

    await prisma.usuario.create({
      data: {
        email,
        nombre: quien,
        apellido: 'Del Directorio',
        telefono: '+56 9 0000 0000',
        passwordHash: await hashear(CONTRASENA),
        socio: ficha
          ? {
              create: {
                numeroSocio: ficha.numeroSocio,
                estado: ficha.estado,
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

  it('lista a los demás socios activos, sin uno mismo y sin los retirados', async () => {
    const cookie = await crear('yo', {
      numeroSocio: 'D-1',
      estado: EstadoSocio.ACTIVO,
    });
    await crear('otra', { numeroSocio: 'D-2', estado: EstadoSocio.ACTIVO });
    await crear('retirado', {
      numeroSocio: 'D-3',
      estado: EstadoSocio.RETIRADO,
    });

    const respuesta = await request(servidor())
      .get('/api/socios')
      .set('Cookie', cookie)
      .expect(200);

    const numeros = (respuesta.body as SocioDelDirectorio[]).map(
      (socio) => socio.numeroSocio,
    );

    expect(numeros).toContain('D-2');
    // Uno no se acompaña a sí mismo, y el retirado ya no juega: ofrecerlos es ofrecer
    // una elección que el servicio rechaza después, con la cancha ya elegida.
    expect(numeros).not.toContain('D-1');
    expect(numeros).not.toContain('D-3');
  });

  it('no entrega datos de contacto: es para elegir, no una libreta del club', async () => {
    const cookie = await crear('yo', {
      numeroSocio: 'D-1',
      estado: EstadoSocio.ACTIVO,
    });
    await crear('otra', { numeroSocio: 'D-2', estado: EstadoSocio.ACTIVO });

    const respuesta = await request(servidor())
      .get('/api/socios')
      .set('Cookie', cookie)
      .expect(200);

    const cuerpo = JSON.stringify(respuesta.body);
    expect(cuerpo).not.toContain(DOMINIO);
    expect(cuerpo).not.toContain('+56 9 0000 0000');
  });

  it('a quien no tiene ficha de socio no le abre el padrón', async () => {
    const cookie = await crear('visitante', null);

    await request(servidor())
      .get('/api/socios')
      .set('Cookie', cookie)
      .expect(403);
  });

  it('sin sesión no se ve nada', async () => {
    await request(servidor()).get('/api/socios').expect(401);
  });
});
