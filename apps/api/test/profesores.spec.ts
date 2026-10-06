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

  const crear = async (datos: Record<string, unknown> = FICHA) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/profesores')
      .set('Cookie', cookieAdmin)
      .send(datos);

    if (respuesta.status === 201) {
      creados.push((respuesta.body as FichaPublicada).id);
    }

    return respuesta;
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
    expect(respuesta.body).toMatchObject({ ...FICHA, activo: true });

    const lista = await listar();
    expect(lista.some((p) => p.nombreVisible === 'Ana Silva')).toBe(true);
  });

  it('**el profesor no necesita cuenta: el club lo anota, no lo hace entrar**', async () => {
    // Exigirle usuario obligaría a crear credenciales que nadie usa para poder anotar
    // un teléfono. Ver `SPEC-clases.md` § Out of scope.
    const ficha = await prisma.profesor.findUniqueOrThrow({
      where: { id: fichaDe(await crear()).id },
    });
    expect(ficha.usuarioId).toBeNull();
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
});
