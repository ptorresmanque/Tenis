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
      data: {
        direccion: '',
        telefono: '',
        email: '',
        instagram: '',
        facebook: '',
        tiktok: '',
        youtube: '',
        whatsapp: '',
      },
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
      // Las redes también (T140): están en el pie de todas las páginas.
      // Y los textos de "El club" (T142), que son de esa página pública.
      // Y la tienda y la cafetería (T184), que la portada y "El club" dan a conocer.
      expect(Object.keys(publico.body as object).sort()).toEqual([
        'cafeteria',
        'direccion',
        'elClubBajada',
        'elClubCanchas',
        'elClubTitulo',
        'email',
        'facebook',
        'instagram',
        'latitud',
        'longitud',
        'nombre',
        'telefono',
        'tienda',
        'tiktok',
        'whatsapp',
        'youtube',
      ]);
    });

    it('**guarda las redes y las publica** (T140)', async () => {
      await request(servidor())
        .patch('/api/admin/configuracion')
        .set('Cookie', admin)
        .send({
          instagram: '@fedaltennis',
          facebook: 'facebook.com/fedaltennis',
          tiktok: '',
          youtube: 'https://www.youtube.com/@fedaltennis',
          whatsapp: '9 8765 4321',
        })
        .expect(200);

      const publico = await request(servidor()).get('/api/club').expect(200);

      expect(publico.body).toMatchObject({
        instagram: 'https://www.instagram.com/fedaltennis',
        facebook: 'https://facebook.com/fedaltennis',
        tiktok: '',
        youtube: 'https://www.youtube.com/@fedaltennis',
        whatsapp: '56987654321',
      });
    });

    it('una red con un enlace de otro dominio responde 400 y no guarda nada', async () => {
      await request(servidor())
        .patch('/api/admin/configuracion')
        .set('Cookie', admin)
        .send({
          direccion: 'No debería quedar',
          instagram: 'https://otro.cl/x',
        })
        .expect(400);

      const publico = await request(servidor()).get('/api/club').expect(200);

      expect((publico.body as { direccion: string }).direccion).not.toBe(
        'No debería quedar',
      );
    });

    describe('los textos de "El club" (T142)', () => {
      type Textos = {
        elClubTitulo: string;
        elClubBajada: string;
        elClubCanchas: string;
      };

      const leer = async (): Promise<Textos> =>
        (await request(servidor()).get('/api/club').expect(200)).body as Textos;

      const fijar = (textos: Partial<Textos>) =>
        request(servidor())
          .patch('/api/admin/configuracion')
          .set('Cookie', admin)
          .send(textos);

      it('**por omisión son los que la página tenía escritos**', async () => {
        // La migración no puede cambiar lo que el visitante ya veía.
        const textos = await leer();

        expect(textos.elClubTitulo).toBe('FEDAL Tennis Center');
        expect(textos.elClubBajada).toContain('Desde 2008');
        expect(textos.elClubCanchas).toContain('Basilea y Manacor');
      });

      it('el admin los cambia y el sitio los lee, con sus saltos de línea', async () => {
        const antes = await leer();

        await fijar({
          elClubTitulo: '  El club de Ñuñoa  ',
          elClubBajada: 'Primera línea.\nSegunda línea.',
          elClubCanchas: 'Ocho canchas duras.',
        }).expect(200);

        expect(await leer()).toMatchObject({
          elClubTitulo: 'El club de Ñuñoa',
          elClubBajada: 'Primera línea.\nSegunda línea.',
          elClubCanchas: 'Ocho canchas duras.',
        });

        await fijar(antes).expect(200);
      });

      it('**el título no puede quedar vacío**: es el h1 de la página', async () => {
        const respuesta = await fijar({ elClubTitulo: '   ' }).expect(400);

        expect((respuesta.body as { message: string }).message).toContain(
          'título',
        );
      });

      it('la bajada y el texto de las canchas sí pueden quedar vacíos', async () => {
        const antes = await leer();

        await fijar({ elClubBajada: '', elClubCanchas: '' }).expect(200);
        expect(await leer()).toMatchObject({
          elClubBajada: '',
          elClubCanchas: '',
        });

        await fijar(antes).expect(200);
      });

      it('lo que no es texto responde 400', async () => {
        const respuesta = await fijar({
          elClubBajada: 42 as unknown as string,
        }).expect(400);

        expect((respuesta.body as { message: string }).message).toContain(
          'texto',
        );
      });
    });

    describe('la tienda y la cafetería (T184)', () => {
      type Lugar = { descripcion: string; horario: string; whatsapp: string };
      type Publico = { tienda: Lugar; cafeteria: Lugar };

      const leer = async (): Promise<Publico> =>
        (await request(servidor()).get('/api/club').expect(200))
          .body as Publico;

      const fijar = (cambios: Record<string, unknown>) =>
        request(servidor())
          .patch('/api/admin/configuracion')
          .set('Cookie', admin)
          .send(cambios);

      const VACIO = { descripcion: '', horario: '', whatsapp: '' };

      afterEach(async () => {
        await prisma.configuracionClub.updateMany({
          data: {
            tiendaDescripcion: '',
            tiendaHorario: '',
            tiendaWhatsapp: '',
            cafeteriaDescripcion: '',
            cafeteriaHorario: '',
            cafeteriaWhatsapp: '',
          },
        });
      });

      it('**por omisión están vacías**: el sitio no las muestra hasta que el club escriba', async () => {
        expect(await leer()).toMatchObject({ tienda: VACIO, cafeteria: VACIO });
      });

      it('el admin las escribe y el sitio las lee, cada una por su lado', async () => {
        await fijar({
          tiendaDescripcion: '  Raquetas, cuerdas y\nzapatillas.  ',
          tiendaHorario: 'Lunes a sábado de 9:00 a 20:00',
          tiendaWhatsapp: '9 8765 4321',
          cafeteriaDescripcion: 'Café, jugos y sándwiches.',
          cafeteriaHorario: 'Todos los días de 8:00 a 22:00',
          cafeteriaWhatsapp: '',
        }).expect(200);

        expect(await leer()).toEqual(
          expect.objectContaining({
            tienda: {
              descripcion: 'Raquetas, cuerdas y\nzapatillas.',
              horario: 'Lunes a sábado de 9:00 a 20:00',
              whatsapp: '56987654321',
            },
            cafeteria: {
              descripcion: 'Café, jugos y sándwiches.',
              horario: 'Todos los días de 8:00 a 22:00',
              whatsapp: '',
            },
          }),
        );
      });

      it('lo que se pasa del largo de la columna se recorta, como los otros textos', async () => {
        await fijar({
          cafeteriaDescripcion: 'a'.repeat(700),
          cafeteriaHorario: 'b'.repeat(200),
        }).expect(200);

        const { cafeteria } = await leer();

        expect(cafeteria.descripcion).toHaveLength(600);
        expect(cafeteria.horario).toHaveLength(120);
      });

      it('**un WhatsApp que no es chileno responde 400 y dice de cuál lugar es**', async () => {
        const respuesta = await fijar({ cafeteriaWhatsapp: '8765 432' }).expect(
          400,
        );

        expect((respuesta.body as { message: string }).message).toContain(
          'WhatsApp de la cafetería',
        );
        expect((await leer()).cafeteria.whatsapp).toBe('');
      });
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
