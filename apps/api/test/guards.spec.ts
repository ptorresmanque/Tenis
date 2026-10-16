import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import {
  AdminO,
  Autenticado,
  SoloAdmin,
  SoloSocio,
} from '../src/identidad/guards';
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

/**
 * T215. Un controlador como `admin/clases`: la clase deja entrar al profesor, y un método
 * abre también al gestor. Los dos guards corren, así que el del método tiene que mandar.
 */
@Controller('prueba-tipos')
@AdminO('profesor')
class ControladorDeTipos {
  @Get('del-profesor')
  delProfesor(): string {
    return 'ok';
  }

  @Get('del-dia')
  @AdminO('gestor', 'profesor')
  delDia(): string {
    return 'ok';
  }
}

@Controller('prueba-gestor')
class ControladorDelGestor {
  @Get()
  @AdminO('gestor')
  agenda(): string {
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
      controllers: [
        ControladorDePrueba,
        ControladorDeTipos,
        ControladorDelGestor,
      ],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // El profesor cae en cascada con su usuario.
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
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
    quien:
      | 'visitante'
      | 'socio'
      | 'admin'
      | 'gestor'
      | 'profesor'
      | 'profesor-inactivo',
  ): Promise<string> => {
    const email = `${quien}${DOMINIO}`;

    await prisma.usuario.create({
      data: {
        email,
        nombre: quien,
        apellido: 'De Prueba',
        esAdmin: quien === 'admin',
        esGestor: quien === 'gestor',
        profesor: quien.startsWith('profesor')
          ? {
              create: {
                nombreVisible: 'Profe De Prueba',
                telefono: '56911112222',
                especialidad: 'Iniciación',
                activo: quien === 'profesor',
              },
            }
          : undefined,
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

  describe('@AdminO() (T215)', () => {
    const tipos = (ruta: string, cookie?: string) => {
      const peticion = request(servidor()).get(`/api/${ruta}`);
      return cookie ? peticion.set('Cookie', cookie) : peticion;
    };

    it('@AdminO("gestor") deja pasar al admin y al gestor', async () => {
      await tipos('prueba-gestor', await sesionDe('admin')).expect(200);
      await tipos('prueba-gestor', await sesionDe('gestor')).expect(200);
    });

    it('@AdminO("gestor") responde 403 al profesor, al socio y a quien no tiene tipo', async () => {
      await tipos('prueba-gestor', await sesionDe('profesor')).expect(403);
      await tipos('prueba-gestor', await sesionDe('socio')).expect(403);
      await tipos('prueba-gestor', await sesionDe('visitante')).expect(403);
    });

    it('sin sesión responde 401, no 403', async () => {
      await tipos('prueba-gestor').expect(401);
    });

    it('el profesor con la ficha inactiva no pasa', async () => {
      await tipos(
        'prueba-tipos/del-profesor',
        await sesionDe('profesor-inactivo'),
      ).expect(403);
    });

    it('la lista del método reemplaza a la de la clase: el gestor entra solo a ese', async () => {
      const gestor = await sesionDe('gestor');

      await tipos('prueba-tipos/del-dia', gestor).expect(200);
      await tipos('prueba-tipos/del-profesor', gestor).expect(403);
    });

    it('el profesor entra a los dos', async () => {
      const profesor = await sesionDe('profesor');

      await tipos('prueba-tipos/del-profesor', profesor).expect(200);
      await tipos('prueba-tipos/del-dia', profesor).expect(200);
    });
  });

  describe('GET /api/yo', () => {
    const yo = (cookie?: string) => {
      const peticion = request(servidor()).get('/api/yo');
      return cookie ? peticion.set('Cookie', cookie) : peticion;
    };

    it('sin sesión no trae a nadie, y no es un error', async () => {
      // Preguntar quién soy con respuesta "nadie" es información válida: un 401
      // dice "no estás autorizado a esto", y a saber si hay sesión lo está
      // cualquiera. Cambiado el 2026-09-08 porque la SPA consulta este endpoint
      // al arrancar en todas las páginas, y cada visita sin sesión dejaba un
      // error rojo en la consola. El resto de los endpoints sigue con 401.
      const respuesta = await yo().expect(200);

      expect(respuesta.body).toEqual({});
    });

    it('devuelve el contrato completo', async () => {
      const respuesta = await yo(await sesionDe('socio')).expect(200);

      expect(respuesta.body).toEqual({
        id: expect.any(Number) as number,
        nombre: 'socio',
        apellido: 'De Prueba',
        email: `socio${DOMINIO}`,
        // Lo usa el formulario de reserva para no volver a pedir lo que ya se sabe.
        telefono: null,
        esAdmin: false,
        esGestor: false,
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
