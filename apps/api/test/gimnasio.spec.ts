import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T235. El gimnasio del club en la API (`SPEC.md` § El gimnasio, criterios G2 a G4).
 *
 * Es un tercer lugar, como la tienda y la cafetería: tres textos y sus fotos. Suma dos
 * cosas: **las tarifas**, una lista que se guarda entera, y **el cupo de una clase grupal**,
 * que es de la administración y no se publica.
 */
describe('El gimnasio del club', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let socio: string;
  let antes: {
    gimnasioDescripcion: string;
    gimnasioHorario: string;
    gimnasioWhatsapp: string;
    gimnasioCupoGrupal: number;
  };

  const DOMINIO = '@gimnasio-t235.test';
  const CONTRASENA = 'una-contrasena-larga-2026';

  interface Tarifa {
    nombre: string;
    precioSocioClp: number;
    precioNoSocioClp: number;
  }

  interface GimnasioPublico {
    descripcion: string;
    horario: string;
    whatsapp: string;
    fotos: unknown[];
    tarifas: Tarifa[];
  }

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const publico = async () =>
    (await request(servidor()).get('/api/club').expect(200)).body as {
      gimnasio: GimnasioPublico;
    };

  const configurar = (cambios: object, cookie = admin) =>
    request(servidor())
      .patch('/api/admin/configuracion')
      .set('Cookie', cookie)
      .send(cambios);

  const guardarTarifas = (tarifas: unknown, cookie = admin) =>
    request(servidor())
      .put('/api/admin/club/gimnasio/tarifas')
      .set('Cookie', cookie)
      .send({ tarifas });

  const tarifa = (n: number): Tarifa => ({
    nombre: `Plan ${n}`,
    precioSocioClp: n * 1000,
    precioNoSocioClp: n * 1500,
  });

  const entrar = async (quien: string, esAdmin: boolean) => {
    await prisma.usuario.create({
      data: {
        email: `${quien}${DOMINIO}`,
        passwordHash: await hashear(CONTRASENA),
        nombre: quien,
        apellido: 'Gimnasio',
        esAdmin,
      },
    });

    const respuesta = await request(servidor())
      .post('/api/auth/login')
      .send({ email: `${quien}${DOMINIO}`, contrasena: CONTRASENA })
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
    antes = await prisma.configuracionClub.findUniqueOrThrow({
      where: { id: 1 },
      select: {
        gimnasioDescripcion: true,
        gimnasioHorario: true,
        gimnasioWhatsapp: true,
        gimnasioCupoGrupal: true,
      },
    });

    admin = await entrar('admin', true);
    socio = await entrar('socio', false);
  });

  afterEach(async () => {
    await prisma.tarifaGimnasio.deleteMany();
  });

  afterAll(async () => {
    await prisma.configuracionClub.update({ where: { id: 1 }, data: antes });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  describe('sus textos', () => {
    it('el admin los escribe y el sitio los lee, como los de la tienda', async () => {
      await configurar({
        gimnasioDescripcion:
          '  Máquinas, pesas y un profesor de preparación física.  ',
        gimnasioHorario: 'Lunes a viernes de 7:00 a 21:00',
        gimnasioWhatsapp: '9 8765 4321',
      }).expect(200);

      expect((await publico()).gimnasio).toMatchObject({
        descripcion: 'Máquinas, pesas y un profesor de preparación física.',
        horario: 'Lunes a viernes de 7:00 a 21:00',
        whatsapp: '56987654321',
        fotos: [],
        tarifas: [],
      });
    });

    it('lo que se pasa del largo de la columna se recorta', async () => {
      await configurar({
        gimnasioDescripcion: 'a'.repeat(700),
        gimnasioHorario: 'b'.repeat(200),
      }).expect(200);

      const { gimnasio } = await publico();

      expect(gimnasio.descripcion).toHaveLength(600);
      expect(gimnasio.horario).toHaveLength(120);
    });

    it('**un WhatsApp que no es chileno responde 400 y dice que es el del gimnasio**', async () => {
      const respuesta = await configurar({
        gimnasioWhatsapp: '8765 432',
      }).expect(400);

      expect((respuesta.body as { message: string }).message).toContain(
        'WhatsApp del gimnasio',
      );
    });
  });

  describe('el cupo de una clase grupal (G4)', () => {
    it.each([2, 40])('acepta %i', async (cupo) => {
      await configurar({ gimnasioCupoGrupal: cupo }).expect(200);

      expect(
        (
          (
            await request(servidor())
              .get('/api/admin/configuracion')
              .set('Cookie', admin)
              .expect(200)
          ).body as { gimnasioCupoGrupal: number }
        ).gimnasioCupoGrupal,
      ).toBe(cupo);
    });

    it.each([1, 41, 2.5])('rechaza %s con 400', async (cupo) => {
      await configurar({ gimnasioCupoGrupal: cupo }).expect(400);
    });

    it('**el sitio no lo publica**', async () => {
      const cuerpo = JSON.stringify(await publico());

      expect(cuerpo).not.toMatch(/cupo/i);
    });
  });

  describe('las tarifas (G2 y G3)', () => {
    it('**diez se guardan, y el sitio las muestra en el orden de la pantalla**', async () => {
      const diez = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(tarifa);

      const respuesta = await guardarTarifas(diez).expect(200);

      expect(respuesta.body).toEqual(diez);
      expect((await publico()).gimnasio.tarifas).toEqual(diez);
    });

    it('guardar de nuevo reemplaza la lista entera', async () => {
      await guardarTarifas([tarifa(1), tarifa(2), tarifa(3)]).expect(200);
      await guardarTarifas([tarifa(7)]).expect(200);

      expect((await publico()).gimnasio.tarifas).toEqual([tarifa(7)]);
    });

    it('una lista vacía deja el gimnasio sin tarifas', async () => {
      await guardarTarifas([tarifa(1)]).expect(200);
      await guardarTarifas([]).expect(200);

      expect((await publico()).gimnasio.tarifas).toEqual([]);
    });

    it('el nombre se guarda sin los espacios de los bordes', async () => {
      await guardarTarifas([
        { ...tarifa(1), nombre: '  Pase diario  ' },
      ]).expect(200);

      expect((await publico()).gimnasio.tarifas[0].nombre).toBe('Pase diario');
    });

    const RECHAZOS: [string, unknown, RegExp][] = [
      ['once', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(tarifa), /diez/],
      [
        'una sin nombre',
        [tarifa(1), { ...tarifa(2), nombre: '   ' }],
        /nombre/,
      ],
      [
        'un nombre de 81 letras',
        [{ ...tarifa(1), nombre: 'a'.repeat(81) }],
        /80/,
      ],
      [
        'un monto negativo',
        [{ ...tarifa(1), precioNoSocioClp: -1 }],
        /no socio/,
      ],
      [
        'un monto con decimales',
        [{ ...tarifa(1), precioSocioClp: 1.5 }],
        /socio/,
      ],
      ['algo que no es una lista', { nombre: 'Plan' }, /lista/],
    ];

    it.each(RECHAZOS)(
      '**%s se rechaza entera con 400, y las anteriores quedan**',
      async (_caso, tarifas, mensaje) => {
        await guardarTarifas([tarifa(1), tarifa(2)]).expect(200);

        const respuesta = await guardarTarifas(tarifas).expect(400);

        expect((respuesta.body as { message: string }).message).toMatch(
          mensaje,
        );
        expect((await publico()).gimnasio.tarifas).toEqual([
          tarifa(1),
          tarifa(2),
        ]);
      },
    );

    it('son del admin: sin sesión 401, con la de un socio 403', async () => {
      await request(servidor())
        .put('/api/admin/club/gimnasio/tarifas')
        .send({ tarifas: [] })
        .expect(401);
      await guardarTarifas([], socio).expect(403);
    });
  });
});
