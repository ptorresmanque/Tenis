import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoSocio } from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

interface Fila {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  esAdmin: boolean;
  esGestor: boolean;
  socio: { id: number; numeroSocio: string; estado: string } | null;
  profesor: { id: number; nombreVisible: string; activo: boolean } | null;
}

interface Listado {
  usuarios: Fila[];
  total: number;
  pagina: number;
}

/**
 * T216. La lista de usuarios del panel, que reemplaza a Administradores
 * (`SPEC-identidad.md` § Tipos de usuario, criterios 25–27).
 *
 * Las dos reglas de Administradores se mudan acá con sus pruebas: nadie se quita el
 * admin a sí mismo, y el club no se queda sin admins. Son los dos errores que no se
 * arreglan desde la propia aplicación.
 */
describe('Usuarios del panel', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@usuarios-t216.test';
  const CONTRASENA = 'raqueta lluviosa 44';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const entrar = async (email: string): Promise<string> => {
    const respuesta = await request(servidor())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);

    return (respuesta.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  };

  const crear = async (
    quien: string,
    datos: {
      nombre?: string;
      apellido?: string;
      esAdmin?: boolean;
      esGestor?: boolean;
      socio?: boolean;
      profesor?: boolean;
    } = {},
  ) => {
    const email = `${quien}${DOMINIO}`;
    const usuario = await prisma.usuario.create({
      data: {
        email,
        nombre: datos.nombre ?? quien,
        apellido: datos.apellido ?? 'De Prueba',
        telefono: '56911112222',
        esAdmin: datos.esAdmin ?? false,
        esGestor: datos.esGestor ?? false,
        passwordHash: await hashear(CONTRASENA),
        socio: datos.socio
          ? {
              create: {
                numeroSocio: `T216-${quien}`,
                estado: EstadoSocio.ACTIVO,
                fechaIngreso: new Date('2026-01-01T00:00:00.000Z'),
                alDiaHasta: new Date('2099-12-31T00:00:00.000Z'),
              },
            }
          : undefined,
        profesor: datos.profesor
          ? {
              create: {
                nombreVisible: `Profe ${quien}`,
                telefono: '56933334444',
                especialidad: 'Iniciación',
              },
            }
          : undefined,
      },
      select: { id: true },
    });

    return { id: usuario.id, email };
  };

  const listar = (cookie: string, consulta = '') =>
    request(servidor())
      .get(`/api/admin/usuarios${consulta}`)
      .set('Cookie', cookie);

  const cambiar = (cookie: string, id: number, cuerpo: object) =>
    request(servidor())
      .patch(`/api/admin/usuarios/${id}`)
      .set('Cookie', cookie)
      .send(cuerpo);

  let jefe: { id: number; email: string };
  let cookieJefe: string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    jefe = await crear('jefe', {
      nombre: 'Jefe',
      apellido: 'Del Club',
      esAdmin: true,
    });
    cookieJefe = await entrar(jefe.email);
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  describe('GET /admin/usuarios (25)', () => {
    it('al gestor y al profesor les responde 403; sin sesión, 401', async () => {
      const gestor = await crear('gestor', { esGestor: true });
      const profesor = await crear('profe', { profesor: true });

      await listar(await entrar(gestor.email)).expect(403);
      await listar(await entrar(profesor.email)).expect(403);
      await request(servidor()).get('/api/admin/usuarios').expect(401);
    });

    it('trae los tipos de cada uno, con su ficha de socio y de profesor', async () => {
      await crear('socia', { socio: true, esGestor: true });
      await crear('profe', { profesor: true });

      const body: unknown = (
        await listar(cookieJefe, `?q=${encodeURIComponent(DOMINIO)}`).expect(
          200,
        )
      ).body;
      const porCorreo = new Map(
        (body as Listado).usuarios.map((fila) => [fila.email, fila]),
      );

      expect(porCorreo.get(`socia${DOMINIO}`)).toMatchObject({
        esAdmin: false,
        esGestor: true,
        socio: { numeroSocio: 'T216-socia', estado: 'ACTIVO' },
        profesor: null,
      });
      expect(porCorreo.get(`profe${DOMINIO}`)).toMatchObject({
        socio: null,
        profesor: { nombreVisible: 'Profe profe', activo: true },
      });
      expect(porCorreo.get(jefe.email)).toMatchObject({ esAdmin: true });
    });

    it('no trae ni la contraseña ni el id de Google', async () => {
      const body: unknown = (
        await listar(cookieJefe, `?q=${encodeURIComponent(DOMINIO)}`).expect(
          200,
        )
      ).body;

      const cuerpo = JSON.stringify(body);
      expect(cuerpo).not.toContain('argon2');
      expect(cuerpo).not.toContain('googleId');
      expect(cuerpo).not.toContain('passwordHash');
    });

    it('"ana" encuentra por nombre, por apellido o por correo', async () => {
      await crear('t216-uno', { nombre: 'Ana', apellido: 'Rojas' });
      await crear('t216-dos', { nombre: 'Beto', apellido: 'Santana' });
      await crear('t216-ana', { nombre: 'Carla', apellido: 'Pérez' });
      await crear('t216-cuatro', { nombre: 'Daniel', apellido: 'Soto' });

      const body: unknown = (await listar(cookieJefe, '?q=ana').expect(200))
        .body;
      const correos = (body as Listado).usuarios.map((fila) => fila.email);

      expect(correos).toEqual(
        expect.arrayContaining([
          `t216-uno${DOMINIO}`,
          `t216-dos${DOMINIO}`,
          `t216-ana${DOMINIO}`,
        ]),
      );
      expect(correos).not.toContain(`t216-cuatro${DOMINIO}`);
    });

    it('con varias palabras, cada una tiene que estar en algún lado: "ana rojas t216"', async () => {
      await crear('t216-uno', { nombre: 'Ana', apellido: 'Rojas' });
      await crear('t216-dos', { nombre: 'Ana', apellido: 'Soto' });

      const body: unknown = (
        await listar(cookieJefe, '?q=ana%20rojas%20t216').expect(200)
      ).body;

      expect((body as Listado).usuarios.map((fila) => fila.email)).toEqual([
        `t216-uno${DOMINIO}`,
      ]);
    });

    it('da de a 50, por nombre, y dice cuántos hay en total', async () => {
      for (let n = 0; n < 52; n += 1) {
        await prisma.usuario.create({
          data: {
            email: `lote-${String(n).padStart(2, '0')}${DOMINIO}`,
            nombre: `Lote ${String(n).padStart(2, '0')}`,
            apellido: 'T216',
          },
        });
      }

      const primera = (await listar(cookieJefe, '?q=lote-').expect(200))
        .body as Listado;
      const segunda = (
        await listar(cookieJefe, '?q=lote-&pagina=2').expect(200)
      ).body as Listado;

      expect(primera.total).toBe(52);
      expect(primera.usuarios).toHaveLength(50);
      expect(primera.usuarios[0].nombre).toBe('Lote 00');
      expect(segunda).toMatchObject({ pagina: 2, total: 52 });
      expect(segunda.usuarios.map((fila) => fila.nombre)).toEqual([
        'Lote 50',
        'Lote 51',
      ]);
    });

    it('una página que no es un número entero desde 1 responde 400', async () => {
      await listar(cookieJefe, '?pagina=0').expect(400);
      await listar(cookieJefe, '?pagina=dos').expect(400);
    });
  });

  describe('PATCH /admin/usuarios/:id', () => {
    it('enciende y apaga el gestor', async () => {
      const otro = await crear('otro');

      const body: unknown = (
        await cambiar(cookieJefe, otro.id, {
          esGestor: true,
        }).expect(200)
      ).body;

      expect(body).toMatchObject({
        id: otro.id,
        esGestor: true,
        esAdmin: false,
      });

      await cambiar(cookieJefe, otro.id, { esGestor: false }).expect(200);
      expect(
        await prisma.usuario.findUniqueOrThrow({
          where: { id: otro.id },
          select: { esGestor: true },
        }),
      ).toEqual({ esGestor: false });
    });

    it('apagarle el admin a otro rige en su petición siguiente, sin volver a entrar', async () => {
      const otro = await crear('otro', { esAdmin: true });
      const suCookie = await entrar(otro.email);
      await listar(suCookie).expect(200);

      await cambiar(cookieJefe, otro.id, { esAdmin: false }).expect(200);

      await listar(suCookie).expect(403);
    });

    it('sin nada que cambiar, o con algo que no es sí o no, responde 400', async () => {
      const otro = await crear('otro');

      await cambiar(cookieJefe, otro.id, {}).expect(400);
      await cambiar(cookieJefe, otro.id, { esGestor: 'si' }).expect(400);
    });

    it('a un usuario que no existe le responde 404', async () => {
      await cambiar(cookieJefe, 999_999_999, { esGestor: true }).expect(404);
    });

    it('al gestor le responde 403', async () => {
      const gestor = await crear('gestor', { esGestor: true });

      await cambiar(await entrar(gestor.email), jefe.id, {
        esGestor: true,
      }).expect(403);
    });

    describe('las dos reglas del admin (27)', () => {
      it('**nadie se quita el admin a sí mismo**', async () => {
        const body: unknown = (
          await cambiar(cookieJefe, jefe.id, {
            esAdmin: false,
          }).expect(409)
        ).body;

        expect((body as { message: string }).message).toContain('a ti');
        expect(
          await prisma.usuario.findUniqueOrThrow({
            where: { id: jefe.id },
            select: { esAdmin: true },
          }),
        ).toEqual({ esAdmin: true });
      });

      it('sí puede quitarse el gestor', async () => {
        await cambiar(cookieJefe, jefe.id, { esGestor: true }).expect(200);
        await cambiar(cookieJefe, jefe.id, { esGestor: false }).expect(200);
      });

      it('a otro admin sí, mientras quede alguien', async () => {
        const suplente = await crear('suplente', { esAdmin: true });

        await cambiar(cookieJefe, suplente.id, { esAdmin: false }).expect(200);
      });

      it('**el club no se queda sin admins**: dos que se lo quitan a la vez, pasa uno', async () => {
        // Con "nadie se quita el admin a sí mismo", al último solo se llega por una
        // carrera: dos admins que se lo quitan uno al otro en el mismo instante. Sin
        // candado, los dos cuentan dos y el club queda sin nadie en el panel.
        //
        // La base de prueba es de una corrida a la vez (maxWorkers 1), así que durante
        // el caso el jefe y el suplente pueden ser los únicos admins.
        const suplente = await crear('suplente', { esAdmin: true });
        const cookieSuplente = await entrar(suplente.email);
        const otros = await prisma.usuario.findMany({
          where: { esAdmin: true, id: { notIn: [jefe.id, suplente.id] } },
          select: { id: true },
        });
        await prisma.usuario.updateMany({
          where: { id: { in: otros.map((u) => u.id) } },
          data: { esAdmin: false },
        });

        try {
          const respuestas = await Promise.all([
            cambiar(cookieJefe, suplente.id, { esAdmin: false }),
            cambiar(cookieSuplente, jefe.id, { esAdmin: false }),
          ]);

          // El que llega segundo recibe 409 si ya pasó el guard, o 403 si el guard ya
          // lo vio sin admin. Lo que no puede pasar es que entren los dos.
          expect(respuestas.filter((r) => r.status === 200)).toHaveLength(1);
          expect(
            await prisma.usuario.count({
              where: { id: { in: [jefe.id, suplente.id] }, esAdmin: true },
            }),
          ).toBe(1);
        } finally {
          await prisma.usuario.updateMany({
            where: { id: { in: otros.map((u) => u.id) } },
            data: { esAdmin: true },
          });
        }
      });
    });
  });
});
