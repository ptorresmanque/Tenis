import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import { Autenticado, SoloAdmin, SoloSocio } from '../src/identidad/guards';
import { IdentidadModule } from '../src/identidad/identidad.module';
import { EstadoSocio } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T8. Los 403 se deciden en el servidor. Que la interfaz le esconda un botón a un
 * socio es cortesía; lo que impide que entre al panel del admin es este guard.
 */
@Controller('prueba-guards')
class ControladorDePrueba {
  @Get('cualquiera')
  @Autenticado()
  cualquiera(): string {
    return 'ok';
  }

  @Get('admin')
  @SoloAdmin()
  admin(): string {
    return 'ok';
  }

  @Get('socio')
  @SoloSocio()
  socio(): string {
    return 'ok';
  }
}

describe('Guards de autorización', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@guards.test';
  const CONTRASENA = 'raqueta lluviosa 44';

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      // IdentidadModule explícito: los guards se instancian en el módulo del
      // controlador que los usa, y ahí tiene que poder resolverse SesionService.
      // Es lo mismo que harán `catalogo-canchas` y `reservas`.
      imports: [AppModule, IdentidadModule],
      controllers: [ControladorDePrueba],
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

  /** Crea una cuenta, entra y devuelve su cookie de sesión. */
  const sesionDe = async (
    quien: 'visitante' | 'socio' | 'admin',
  ): Promise<string> => {
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
                  numeroSocio: `G-${quien}`,
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

  const pedir = (ruta: string, cookie?: string) => {
    const peticion = request(servidor()).get(`/api/prueba-guards/${ruta}`);
    return cookie ? peticion.set('Cookie', cookie) : peticion;
  };

  describe('@Autenticado()', () => {
    it('sin sesión responde 401', async () => {
      await pedir('cualquiera').expect(401);
    });

    it('con sesión deja pasar a cualquiera', async () => {
      await pedir('cualquiera', await sesionDe('visitante')).expect(200);
    });
  });

  describe('@SoloAdmin()', () => {
    it('responde 403 a un socio, aunque la interfaz le muestre el botón', async () => {
      await pedir('admin', await sesionDe('socio')).expect(403);
    });

    it('responde 401 sin sesión, no 403', async () => {
      // Son cosas distintas: uno no dijo quién es, el otro no tiene permiso.
      await pedir('admin').expect(401);
    });

    it('deja pasar al admin', async () => {
      await pedir('admin', await sesionDe('admin')).expect(200);
    });
  });

  describe('@SoloSocio()', () => {
    it('responde 403 a quien no tiene ficha de socio', async () => {
      await pedir('socio', await sesionDe('visitante')).expect(403);
    });

    it('deja pasar al socio', async () => {
      await pedir('socio', await sesionDe('socio')).expect(200);
    });

    it('el admin sin ficha de socio tampoco pasa', async () => {
      // Ser admin no es ser socio: el panel de administración es otra cosa que
      // reservar una cancha con el cupo de socio.
      await pedir('socio', await sesionDe('admin')).expect(403);
    });
  });

  describe('GET /api/yo', () => {
    const yo = (cookie?: string) => {
      const peticion = request(servidor()).get('/api/yo');
      return cookie ? peticion.set('Cookie', cookie) : peticion;
    };

    it('sin sesión responde 401', async () => {
      await yo().expect(401);
    });

    it('devuelve el contrato completo', async () => {
      const respuesta = await yo(await sesionDe('socio')).expect(200);

      expect(respuesta.body).toEqual({
        id: expect.any(Number) as number,
        nombre: 'socio',
        email: `socio${DOMINIO}`,
        esAdmin: false,
        socioId: expect.any(Number) as number,
        socioActivo: true,
        socioAlDia: true,
        profesorId: null,
      });
    });

    it('no filtra la contraseña ni el identificador de Google', async () => {
      const respuesta = await yo(await sesionDe('visitante')).expect(200);

      const cuerpo = JSON.stringify(respuesta.body);
      expect(cuerpo).not.toContain('argon2');
      expect(cuerpo).not.toContain('googleId');
    });
  });
});
