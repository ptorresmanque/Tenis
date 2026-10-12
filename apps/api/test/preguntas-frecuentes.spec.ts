import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T144: las preguntas frecuentes del club.
 *
 * El club las escribe desde su panel y `/preguntas-frecuentes` las publica. Importa el
 * orden —es el que el club eligió, no el de creación—, que la puerta pública no exponga
 * más que la pregunta y la respuesta, y que solo el admin pueda escribirlas.
 */
describe('Preguntas frecuentes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let socio: string;

  const DOMINIO = '@preguntas-t144.test';
  const CONTRASENA = 'raqueta lluviosa 44';
  /** Las de este test se distinguen por la pregunta: la tabla puede traer otras. */
  const MARCA = '[Prueba T144]';

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

  const crear = (cuerpo: Record<string, unknown>, cookie = admin) =>
    request(servidor())
      .post('/api/admin/preguntas-frecuentes')
      .set('Cookie', cookie)
      .send(cuerpo);

  const publicas = async () =>
    (
      (await request(servidor()).get('/api/preguntas-frecuentes').expect(200))
        .body as { id: number; pregunta: string; respuesta: string }[]
    ).filter((p) => p.pregunta.startsWith(MARCA));

  const limpiar = () =>
    prisma.preguntaFrecuente.deleteMany({
      where: { pregunta: { startsWith: MARCA } },
    });

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

  afterEach(limpiar);

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  describe('la puerta pública', () => {
    it('**las lista en el orden que eligió el club**, no en el de creación', async () => {
      await crear({
        pregunta: `${MARCA} segunda`,
        respuesta: 'B',
        orden: 901,
      }).expect(201);
      await crear({
        pregunta: `${MARCA} primera`,
        respuesta: 'A',
        orden: 900,
      }).expect(201);

      expect((await publicas()).map((p) => p.pregunta)).toEqual([
        `${MARCA} primera`,
        `${MARCA} segunda`,
      ]);
    });

    it('con el mismo orden, la más antigua va primero', async () => {
      await crear({
        pregunta: `${MARCA} vieja`,
        respuesta: 'A',
        orden: 950,
      }).expect(201);
      await crear({
        pregunta: `${MARCA} nueva`,
        respuesta: 'B',
        orden: 950,
      }).expect(201);

      expect((await publicas()).map((p) => p.pregunta)).toEqual([
        `${MARCA} vieja`,
        `${MARCA} nueva`,
      ]);
    });

    it('publica la pregunta y la respuesta, y nada más', async () => {
      await crear({
        pregunta: `${MARCA} ¿Hay estacionamiento?`,
        respuesta: 'Sí.',
      }).expect(201);

      const [pregunta] = await publicas();

      expect(Object.keys(pregunta).sort()).toEqual([
        'id',
        'pregunta',
        'respuesta',
      ]);
    });

    it('se lee sin sesión', async () => {
      await request(servidor()).get('/api/preguntas-frecuentes').expect(200);
    });
  });

  describe('el panel', () => {
    it('sin orden, la nueva queda al final', async () => {
      await crear({
        pregunta: `${MARCA} arriba`,
        respuesta: 'A',
        orden: 990,
      }).expect(201);
      const nueva = await crear({
        pregunta: `${MARCA} al final`,
        respuesta: 'B',
      }).expect(201);

      expect((nueva.body as { orden: number }).orden).toBeGreaterThan(990);
    });

    it('guarda la respuesta con sus saltos de línea, sin espacios a los lados', async () => {
      const creada = await crear({
        pregunta: `  ${MARCA} ¿Cómo reservo?  `,
        respuesta: '  Primero elige la hora.\nDespués paga.  ',
      }).expect(201);

      expect(creada.body).toMatchObject({
        pregunta: `${MARCA} ¿Cómo reservo?`,
        respuesta: 'Primero elige la hora.\nDespués paga.',
      });
    });

    it('edita solo lo que viene', async () => {
      const creada = await crear({
        pregunta: `${MARCA} original`,
        respuesta: 'La de antes.',
        orden: 900,
      }).expect(201);

      await request(servidor())
        .patch(
          `/api/admin/preguntas-frecuentes/${(creada.body as { id: number }).id}`,
        )
        .set('Cookie', admin)
        .send({ respuesta: 'La de ahora.' })
        .expect(200);

      expect(await publicas()).toEqual([
        expect.objectContaining({
          pregunta: `${MARCA} original`,
          respuesta: 'La de ahora.',
        }),
      ]);
    });

    it('borrar la saca del sitio', async () => {
      const creada = await crear({
        pregunta: `${MARCA} se va`,
        respuesta: 'A',
      }).expect(201);

      await request(servidor())
        .delete(
          `/api/admin/preguntas-frecuentes/${(creada.body as { id: number }).id}`,
        )
        .set('Cookie', admin)
        .expect(204);

      expect(await publicas()).toEqual([]);
    });

    it('el admin las lista con su orden', async () => {
      await crear({
        pregunta: `${MARCA} con orden`,
        respuesta: 'A',
        orden: 900,
      }).expect(201);

      const respuesta = await request(servidor())
        .get('/api/admin/preguntas-frecuentes')
        .set('Cookie', admin)
        .expect(200);

      expect(respuesta.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pregunta: `${MARCA} con orden`,
            orden: 900,
          }),
        ]),
      );
    });

    it('editar o borrar una que no existe responde 404', async () => {
      await request(servidor())
        .patch('/api/admin/preguntas-frecuentes/999999')
        .set('Cookie', admin)
        .send({ respuesta: 'X' })
        .expect(404);
      await request(servidor())
        .delete('/api/admin/preguntas-frecuentes/999999')
        .set('Cookie', admin)
        .expect(404);
    });
  });

  describe('validación', () => {
    it('sin pregunta responde 400 y lo dice', async () => {
      const respuesta = await crear({ pregunta: '  ', respuesta: 'A' }).expect(
        400,
      );

      expect((respuesta.body as { message: string }).message).toBe(
        'Falta la pregunta.',
      );
    });

    it('sin respuesta responde 400 y lo dice', async () => {
      const respuesta = await crear({ pregunta: `${MARCA} sola` }).expect(400);

      expect((respuesta.body as { message: string }).message).toBe(
        'Falta la respuesta.',
      );
    });

    it('**una respuesta de más de 2.000 caracteres responde 400**: no se recorta', async () => {
      // Recortarla publicaría una respuesta cortada a la mitad sin que nadie lo note.
      await crear({
        pregunta: `${MARCA} larga`,
        respuesta: 'a'.repeat(2001),
      }).expect(400);
    });

    it('un orden negativo responde 400', async () => {
      await crear({
        pregunta: `${MARCA} rara`,
        respuesta: 'A',
        orden: -1,
      }).expect(400);
    });

    it('editar sin ningún campo responde 400', async () => {
      const creada = await crear({
        pregunta: `${MARCA} quieta`,
        respuesta: 'A',
      }).expect(201);

      await request(servidor())
        .patch(
          `/api/admin/preguntas-frecuentes/${(creada.body as { id: number }).id}`,
        )
        .set('Cookie', admin)
        .send({})
        .expect(400);
    });
  });

  describe('quién puede escribirlas', () => {
    it('sin sesión, 401', async () => {
      await request(servidor())
        .post('/api/admin/preguntas-frecuentes')
        .send({ pregunta: `${MARCA} x`, respuesta: 'A' })
        .expect(401);
    });

    it('un socio recibe 403 al leer y al escribir en el panel', async () => {
      await request(servidor())
        .get('/api/admin/preguntas-frecuentes')
        .set('Cookie', socio)
        .expect(403);
      await crear({ pregunta: `${MARCA} x`, respuesta: 'A' }, socio).expect(
        403,
      );
    });
  });
});
