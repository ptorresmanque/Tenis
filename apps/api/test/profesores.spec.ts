import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T45: la ficha del profesor.
 *
 * **Desactivar no es borrar**, y esa es la regla que este archivo cuida. Un profesor
 * que se fue del club dio clases que pasaron: borrarlo se llevaría esa historia por
 * delante. Se desactiva, deja de aparecer para agendar, y lo suyo sigue donde estaba.
 */
describe('Ficha de profesor', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;

  const DOMINIO = '@profes.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  /** Lo que se creó en el test, para llevárselo al terminar. */
  let creados: number[] = [];

  const FICHA = {
    nombreVisible: 'Ana Silva',
    telefono: '+56944444444',
    especialidad: 'Iniciación',
    tarifaHoraClp: 18000,
  };

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'De prueba',
      });

    await prisma.usuario.update({
      where: { email: `${sufijo}${DOMINIO}` },
      data: { esAdmin },
    });
  };

  const entrar = async (sufijo: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA });

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  interface FichaPublicada {
    id: number;
    nombreVisible: string;
    telefono: string;
    especialidad: string;
    tarifaHoraClp: number | null;
    activo: boolean;
  }

  /** Una cuenta sin sesión, y su id: desde T297 todo profesor nace con una (D12). */
  let cuentas = 0;
  const nuevaCuenta = async () =>
    (
      await prisma.usuario.create({
        data: {
          email: `profe-${(cuentas += 1)}-cuenta${DOMINIO}`,
          nombre: 'Profe',
          apellido: 'De prueba',
        },
        select: { id: true },
      })
    ).id;

  /** Anota un profesor; con su cuenta propia, salvo que la prueba diga cuál. */
  const crear = async (datos: Record<string, unknown> = FICHA) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/profesores')
      .set('Cookie', cookieAdmin)
      .send(
        'usuarioId' in datos
          ? datos
          : { ...datos, usuarioId: await nuevaCuenta() },
      );

    if (respuesta.status === 201) {
      creados.push((respuesta.body as FichaPublicada).id);
    }

    return respuesta;
  };

  /** Una ficha de antes de T297, sin cuenta: siguen dando clases (D14). */
  const fichaSinCuenta = async (nombreVisible = 'Ana Silva') => {
    const { id } = await prisma.profesor.create({
      data: { ...FICHA, telefono: '56944444444', nombreVisible },
      select: { id: true },
    });
    creados.push(id);
    return id;
  };

  /** El cuerpo de la respuesta como ficha: supertest lo entrega sin tipo. */
  const fichaDe = (respuesta: { body: unknown }) =>
    respuesta.body as FichaPublicada;

  const editar = (id: number, datos: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/admin/profesores/${id}`)
      .set('Cookie', cookieAdmin)
      .send(datos);

  const listar = async (consulta = '') => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/profesores${consulta}`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as FichaPublicada[];
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);

    await crearCuenta('jefe', true);
    await crearCuenta('mirona');
    cookieAdmin = await entrar('jefe');
    cookieSocio = await entrar('mirona');
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  afterEach(async () => {
    await prisma.profesor.deleteMany({ where: { id: { in: creados } } });
    creados = [];
  });

  it('el club anota un profesor y queda en la lista', async () => {
    const respuesta = await crear();

    expect(respuesta.status).toBe(201);
    // El teléfono vuelve normalizado (T120), no como se escribió.
    expect(respuesta.body).toMatchObject({
      ...FICHA,
      telefono: '56944444444',
      activo: true,
    });

    const lista = await listar();
    expect(lista.some((p) => p.nombreVisible === 'Ana Silva')).toBe(true);
  });

  it('**sin cuenta no se anota: 400, y dice qué hacer** (T297, D12)', async () => {
    // Desde T297 el profesor siempre tiene cuenta: la crea en el sitio, y el admin lo
    // marca Profesor en su ficha de Personas.
    const antes = await prisma.profesor.count();

    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/profesores')
      .set('Cookie', cookieAdmin)
      .send(FICHA)
      .expect(400);

    expect((respuesta.body as { message: string }).message).toBe(
      'El profesor necesita su cuenta: que se registre en el sitio, y márcalo Profesor en Personas.',
    );
    expect(await prisma.profesor.count()).toBe(antes);
  });

  it('sin nombre, sin teléfono o sin especialidad no se guarda', async () => {
    // El nombre es cómo se anuncia y el teléfono es por dónde lo llaman cuando algo
    // cambia. Una ficha sin eso no sirve para lo que existe.
    await crear({ ...FICHA, nombreVisible: '  ' }).then((r) =>
      expect(r.status).toBe(400),
    );
    await crear({ ...FICHA, telefono: '' }).then((r) =>
      expect(r.status).toBe(400),
    );
    await crear({ ...FICHA, especialidad: '' }).then((r) =>
      expect(r.status).toBe(400),
    );
  });

  it('un teléfono que no son 9 dígitos no se guarda (T120)', async () => {
    expect((await crear({ ...FICHA, telefono: '12345' })).status).toBe(400);
  });

  it('la tarifa es opcional: no todos los tratos son por hora', async () => {
    const respuesta = await crear({ ...FICHA, tarifaHoraClp: null });

    expect(respuesta.status).toBe(201);
    expect((respuesta.body as FichaPublicada).tarifaHoraClp).toBeNull();
  });

  it('una tarifa negativa o con decimales se rechaza', async () => {
    await crear({ ...FICHA, tarifaHoraClp: -1 }).then((r) =>
      expect(r.status).toBe(400),
    );
    await crear({ ...FICHA, tarifaHoraClp: 1500.5 }).then((r) =>
      expect(r.status).toBe(400),
    );
  });

  it('editar cambia lo que el club anuncia', async () => {
    const id = fichaDe(await crear()).id;

    await editar(id, {
      especialidad: 'Competitivo',
      tarifaHoraClp: 22000,
    }).expect(200);

    const ficha = await prisma.profesor.findUniqueOrThrow({ where: { id } });
    expect(ficha.especialidad).toBe('Competitivo');
    expect(ficha.tarifaHoraClp).toBe(22000);
    // Lo que no se manda no se toca.
    expect(ficha.nombreVisible).toBe('Ana Silva');
  });

  it('**desactivar no borra la ficha: lo que dio sigue teniendo autor**', async () => {
    const id = fichaDe(await crear()).id;

    await editar(id, { activo: false }).expect(200);

    expect(await prisma.profesor.count({ where: { id } })).toBe(1);
    const enElPanel = (await listar()).find((p) => p.id === id);
    expect(enElPanel?.activo).toBe(false);
  });

  it('**el desactivado no aparece para agendar clases nuevas**', async () => {
    const id = fichaDe(await crear()).id;
    await editar(id, { activo: false }).expect(200);

    const paraAgendar = await listar('?activos=1');

    expect(paraAgendar.some((p) => p.id === id)).toBe(false);
    // Y el que sigue estando, sí.
    const otro = fichaDe(await crear({ ...FICHA, nombreVisible: 'Felipe' }));
    expect((await listar('?activos=1')).some((p) => p.id === otro.id)).toBe(
      true,
    );
  });

  it('editar un profesor que no existe responde 404', async () => {
    await editar(999999, { activo: false }).expect(404);
  });

  it('solo el admin ve y toca las fichas', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/profesores')
      .set('Cookie', cookieSocio)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/admin/profesores')
      .send(FICHA)
      .expect(401);
  });

  describe('la cuenta del profesor (T217)', () => {
    /** Una cuenta con sesión, y su id. */
    const cuenta = async (sufijo: string) => {
      await crearCuenta(sufijo);
      const { id } = await prisma.usuario.findUniqueOrThrow({
        where: { email: `${sufijo}${DOMINIO}` },
        select: { id: true },
      });
      return { id, cookie: await entrar(sufijo) };
    };

    const profesorIdDe = async (cookie: string) =>
      (
        (
          await request(app.getHttpServer())
            .get('/api/yo')
            .set('Cookie', cookie)
            .expect(200)
        ).body as { profesorId: number | null }
      ).profesorId;

    const vincular = (id: number, cuerpo: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post(`/api/admin/profesores/${id}/cuenta`)
        .set('Cookie', cookieAdmin)
        .send(cuerpo);

    afterEach(async () => {
      await prisma.usuario.deleteMany({
        where: { email: { endsWith: `-cuenta${DOMINIO}` } },
      });
    });

    it('vincular una ficha sin cuenta hace profesor al usuario en su petición siguiente (29)', async () => {
      const ana = await cuenta('ana-cuenta');
      const id = await fichaSinCuenta();
      expect(await profesorIdDe(ana.cookie)).toBeNull();

      const respuesta = await vincular(id, { usuarioId: ana.id }).expect(200);

      expect(fichaDe(respuesta)).toMatchObject({ id, usuarioId: ana.id });
      expect(await profesorIdDe(ana.cookie)).toBe(id);
    });

    it('la lista dice qué fichas tienen cuenta', async () => {
      const ana = await cuenta('ana-cuenta');
      const conCuenta = fichaDe(
        await crear({ ...FICHA, usuarioId: ana.id }),
      ).id;
      const sinCuenta = await fichaSinCuenta('B');

      const lista = (await listar()) as (FichaPublicada & {
        usuarioId: number | null;
      })[];

      expect(lista.find((p) => p.id === conCuenta)?.usuarioId).toBe(ana.id);
      expect(lista.find((p) => p.id === sinCuenta)?.usuarioId).toBeNull();
    });

    it('una ficha que ya tiene cuenta no se vuelve a vincular: 409', async () => {
      const ana = await cuenta('ana-cuenta');
      const beto = await cuenta('beto-cuenta');
      const id = await fichaSinCuenta();
      await vincular(id, { usuarioId: ana.id }).expect(200);

      await vincular(id, { usuarioId: beto.id }).expect(409);

      expect(await profesorIdDe(beto.cookie)).toBeNull();
    });

    it('un usuario que ya tiene ficha no recibe otra: 409', async () => {
      const ana = await cuenta('ana-cuenta');
      const primera = await fichaSinCuenta();
      const segunda = await fichaSinCuenta('B');
      await vincular(primera, { usuarioId: ana.id }).expect(200);

      await vincular(segunda, { usuarioId: ana.id }).expect(409);
    });

    it('un usuario o una ficha que no existen responden 404; sin usuario, 400', async () => {
      const ana = await cuenta('ana-cuenta');
      const id = await fichaSinCuenta();

      await vincular(id, { usuarioId: 999_999_999 }).expect(404);
      await vincular(999_999_999, { usuarioId: ana.id }).expect(404);
      await vincular(id, {}).expect(400);
    });

    it('**quitarle la cuenta a una ficha ya no existe** (T297): DELETE responde 404', async () => {
      // Desde T297 se quita el Profesor desactivando la ficha (Personas), y la ficha no
      // suelta su cuenta.
      const ana = await cuenta('ana-cuenta');
      const id = fichaDe(await crear({ ...FICHA, usuarioId: ana.id })).id;

      await request(app.getHttpServer())
        .delete(`/api/admin/profesores/${id}/cuenta`)
        .set('Cookie', cookieAdmin)
        .expect(404);
      expect(await profesorIdDe(ana.cookie)).toBe(id);
    });

    it('el alta acepta la cuenta: la ficha nace vinculada', async () => {
      const ana = await cuenta('ana-cuenta');

      const respuesta = await crear({ ...FICHA, usuarioId: ana.id });

      expect(respuesta.status).toBe(201);
      expect(await profesorIdDe(ana.cookie)).toBe(fichaDe(respuesta).id);
    });

    it('el alta con una cuenta que ya es profesor responde 409, y sin crear nada', async () => {
      const ana = await cuenta('ana-cuenta');
      await crear({ ...FICHA, usuarioId: ana.id });
      const antes = await prisma.profesor.count();

      expect((await crear({ ...FICHA, usuarioId: ana.id })).status).toBe(409);
      expect(await prisma.profesor.count()).toBe(antes);
    });

    it('vincular es solo del admin', async () => {
      const id = await fichaSinCuenta();

      await request(app.getHttpServer())
        .post(`/api/admin/profesores/${id}/cuenta`)
        .set('Cookie', cookieSocio)
        .send({ usuarioId: 1 })
        .expect(403);
    });
  });
});
