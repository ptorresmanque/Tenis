import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Fase 7: los datos del club y quién entra al panel.
 *
 * Dos cosas distintas que comparten pantalla y por eso comparten test: los **datos
 * del club** —que dejaron de estar escritos en las plantillas— y los
 * **administradores**, que hasta ahora se nombraban editando la base a mano.
 *
 * De los datos importa qué sale por la puerta pública. De los administradores, que
 * el club no pueda quedarse sin ninguno: es el único error de esta pantalla que no
 * se arregla desde la propia aplicación.
 */
describe('Datos del club y administradores', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let otroAdmin: string;

  const DOMINIO = '@config-f7.test';
  const CONTRASENA = 'raqueta lluviosa 44';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const crear = async (quien: string, esAdmin: boolean): Promise<string> => {
    const email = `${quien}${DOMINIO}`;

    await prisma.usuario.create({
      data: {
        email,
        nombre: quien,
        apellido: 'De Prueba',
        telefono: '+56911112222',
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
    admin = await crear('jefe', true);
    otroAdmin = await crear('suplente', true);
    await crear('socia', false);
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.configuracionClub.updateMany({
      data: { direccion: '', telefono: '', email: '' },
    });
    await app.close();
  });

  describe('los datos del club', () => {
    it('el admin los guarda y el sitio público los lee', async () => {
      await request(servidor())
        .patch('/api/admin/configuracion')
        .set('Cookie', admin)
        .send({
          direccion: 'Avenida del Tenis 1234, Ñuñoa',
          // Como lo escribe el admin; se guarda y se publica en la forma de T120.
          telefono: '+56 2 2345 6789',
          email: 'hola@fedaltenis.cl',
        })
        .expect(200);

      const publico = await request(servidor()).get('/api/club').expect(200);

      expect(publico.body).toMatchObject({
        direccion: 'Avenida del Tenis 1234, Ñuñoa',
        telefono: '56223456789',
        email: 'hola@fedaltenis.cl',
      });
    });

    it('**la puerta pública no devuelve las reglas del club**', async () => {
      // Es la misma fila de la base. Devolverla entera le contaría a cualquiera
      // cuántos invitados por mes tiene un socio y cuánto dura la sanción.
      const publico = await request(servidor()).get('/api/club').expect(200);

      // La ubicación sí es pública (T100): es para el mapa de "El club".
      expect(Object.keys(publico.body as object).sort()).toEqual([
        'direccion',
        'email',
        'latitud',
        'longitud',
        'nombre',
        'telefono',
      ]);
    });

    it('un teléfono del club que no son 9 dígitos responde 400 (T120)', async () => {
      await request(servidor())
        .patch('/api/admin/configuracion')
        .set('Cookie', admin)
        .send({ telefono: '2345 678' })
        .expect(400);
    });

    it('el nombre no puede quedar vacío', async () => {
      // Es el título de cada página y el remitente de cada correo.
      await request(servidor())
        .patch('/api/admin/configuracion')
        .set('Cookie', admin)
        .send({ nombre: '   ' })
        .expect(400);
    });

    it('los datos los cambia el admin, no cualquiera', async () => {
      await request(servidor())
        .patch('/api/admin/configuracion')
        .send({ direccion: 'Mi casa' })
        .expect(401);
    });
  });

  describe('los administradores', () => {
    it('lista a quienes tienen el panel abierto', async () => {
      const respuesta = await request(servidor())
        .get('/api/admin/administradores')
        .set('Cookie', admin)
        .expect(200);

      const correos = (respuesta.body as { email: string }[]).map(
        (fila) => fila.email,
      );

      expect(correos).toContain(`jefe${DOMINIO}`);
      expect(correos).not.toContain(`socia${DOMINIO}`);
    });

    it('nombra a alguien por su correo', async () => {
      await request(servidor())
        .patch('/api/admin/administradores/por-correo')
        .set('Cookie', admin)
        .send({ email: `socia${DOMINIO}`, esAdmin: true })
        .expect(200);

      const usuaria = await prisma.usuario.findUniqueOrThrow({
        where: { email: `socia${DOMINIO}` },
        select: { esAdmin: true },
      });

      expect(usuaria.esAdmin).toBe(true);

      // Se deja como estaba para no ensuciar los demás casos.
      await request(servidor())
        .patch('/api/admin/administradores/por-correo')
        .set('Cookie', admin)
        .send({ email: `socia${DOMINIO}`, esAdmin: false })
        .expect(200);
    });

    it('un correo sin cuenta se explica, no se traga', async () => {
      const respuesta = await request(servidor())
        .patch('/api/admin/administradores/por-correo')
        .set('Cookie', admin)
        .send({ email: `fantasma${DOMINIO}`, esAdmin: true })
        .expect(400);

      expect((respuesta.body as { message: string }).message).toContain(
        'cuenta',
      );
    });

    it('**nadie se quita el rol a sí mismo**', async () => {
      // El clic con el que alguien se deja afuera del panel sin querer: para
      // volver a entrar hace falta la base de datos.
      const yo = await prisma.usuario.findUniqueOrThrow({
        where: { email: `jefe${DOMINIO}` },
        select: { id: true },
      });

      await request(servidor())
        .patch(`/api/admin/administradores/${yo.id}`)
        .set('Cookie', admin)
        .send({ esAdmin: false })
        .expect(409);

      const sigue = await prisma.usuario.findUniqueOrThrow({
        where: { id: yo.id },
        select: { esAdmin: true },
      });

      expect(sigue.esAdmin).toBe(true);
    });

    it('a otro sí, mientras quede alguien', async () => {
      const suplente = await prisma.usuario.findUniqueOrThrow({
        where: { email: `suplente${DOMINIO}` },
        select: { id: true },
      });

      await request(servidor())
        .patch(`/api/admin/administradores/${suplente.id}`)
        .set('Cookie', admin)
        .send({ esAdmin: false })
        .expect(200);

      // Y vuelve, que el siguiente test lo necesita con el rol puesto.
      await request(servidor())
        .patch(`/api/admin/administradores/${suplente.id}`)
        .set('Cookie', admin)
        .send({ esAdmin: true })
        .expect(200);
    });

    it('quien no es admin no puede nombrar administradores', async () => {
      const socia = await request(servidor())
        .post('/api/auth/login')
        .send({ email: `socia${DOMINIO}`, contrasena: CONTRASENA })
        .expect(204);

      await request(servidor())
        .get('/api/admin/administradores')
        .set(
          'Cookie',
          (socia.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
        )
        .expect(403);
    });

    it('el suplente puede quitarle el rol al jefe: la regla es sobre uno mismo', async () => {
      // Y así queda probado que el guardia no es "solo el primero manda", sino
      // "no te dispares en el pie y no dejes el club sin nadie".
      const jefe = await prisma.usuario.findUniqueOrThrow({
        where: { email: `jefe${DOMINIO}` },
        select: { id: true },
      });

      await request(servidor())
        .patch(`/api/admin/administradores/${jefe.id}`)
        .set('Cookie', otroAdmin)
        .send({ esAdmin: false })
        .expect(200);

      await request(servidor())
        .patch(`/api/admin/administradores/${jefe.id}`)
        .set('Cookie', otroAdmin)
        .send({ esAdmin: true })
        .expect(200);
    });
  });
});
