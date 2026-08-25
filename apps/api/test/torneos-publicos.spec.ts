import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoTorneo } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T53: los torneos que se ven desde la calle.
 *
 * El calendario es de las pocas cosas que un tercero mira antes de asociarse, y el
 * cuadro es el mismo mural del club en el teléfono de quien está en la cancha de al
 * lado.
 *
 * Lo que este archivo cuida por encima de todo: que **no salga el teléfono de nadie**.
 * El club lo tiene para llamar a un jugador, no para publicarlo.
 */
describe('GET /api/torneos/publicos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let torneoId: number;

  const DOMINIO = '@torneos-publicos.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Copa publicada';
  const APELLIDO = 'DelMural';
  const TELEFONO = '+56999998888';

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: APELLIDO,
      })
      .expect(201);

    await prisma.usuario.update({
      where: { email: `${sufijo}${DOMINIO}` },
      data: { esAdmin },
    });
  };

  const entrar = async (sufijo: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA })
      .expect(204);

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  interface TorneoPublico {
    id: number;
    nombre: string;
    categoria: string;
    fechaInicio: string;
    estado: string;
    cupo: number;
    cuposLibres: number;
  }

  const calendario = async (consulta = '') => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/torneos/publicos${consulta}`)
      .expect(200);

    return respuesta.body as TorneoPublico[];
  };

  const cuadro = async (id = torneoId) => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/torneos/${id}/cuadro`)
      .expect(200);

    return respuesta.body as {
      nombre: string;
      estado: string;
      inscritos: string[];
      partidos: {
        ronda: number;
        ronda_nombre: string;
        jugadorA: string | null;
        ganador: string | null;
        marcador: string | null;
      }[];
    };
  };

  const limpiar = async () => {
    await prisma.partido.deleteMany({});
    await prisma.inscripcionTorneo.deleteMany({});
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatPub' } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
  };

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
    await limpiar();
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();

    await crearCuenta('jefe', true);
    cookieAdmin = await entrar('jefe');

    const categoria = await prisma.categoriaTorneo.create({
      data: { nombre: `CatPub ${Date.now()}`, puntosCampeon: 250 },
      select: { id: true },
    });

    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}`,
        categoriaId: categoria.id,
        fechaInicio: new Date('2026-12-01T00:00:00.000Z'),
        fechaFin: new Date('2026-12-07T00:00:00.000Z'),
        cierreInscripcion: new Date('2026-11-25T00:00:00.000Z'),
        cupo: 4,
      },
      select: { id: true },
    });
    torneoId = torneo.id;

    // Los cuatro jugadores llevan teléfono: es lo que no puede salir publicado.
    for (const nombre of ['Ana', 'Beto', 'Cata', 'Dani']) {
      const jugador = await request(app.getHttpServer())
        .post('/api/admin/jugadores')
        .set('Cookie', cookieAdmin)
        .send({ nombre, apellido: APELLIDO, telefono: TELEFONO })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/admin/torneos/${torneoId}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .send({ jugadorId: (jugador.body as { id: number }).id })
        .expect(201);
    }
  });

  it('**el calendario se ve sin cuenta**', async () => {
    const torneos = await calendario('?anio=2026');
    const suyo = torneos.find((t) => t.id === torneoId);

    expect(suyo?.nombre).toContain(MARCA);
    expect(suyo?.categoria).toContain('CatPub');
  });

  it('dice cuántos cupos quedan, que es lo que decide si alguien pregunta', async () => {
    const suyo = (await calendario('?anio=2026')).find(
      (t) => t.id === torneoId,
    );

    expect(suyo?.cupo).toBe(4);
    expect(suyo?.cuposLibres).toBe(0);
  });

  it('**ninguna respuesta pública trae un teléfono**', async () => {
    // El club tiene el teléfono de un jugador para llamarlo, no para publicarlo. Se
    // comprueba sobre el JSON entero: un campo nuevo que lo filtre entra sin que nadie
    // se acuerde de actualizar este test.
    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/cuadro`)
      .set('Cookie', cookieAdmin)
      .expect(201);

    const delCalendario = JSON.stringify(await calendario('?anio=2026'));
    const delCuadro = JSON.stringify(await cuadro());

    expect(delCalendario).not.toContain(TELEFONO);
    expect(delCuadro).not.toContain(TELEFONO);
    expect(delCuadro).not.toContain('telefono');
  });

  it('**la lista de inscritos sale con nombre y apellido**', async () => {
    const publicado = await cuadro();

    expect(publicado.inscritos).toHaveLength(4);
    expect(publicado.inscritos[0]).toContain(APELLIDO);
  });

  it('antes de armar el cuadro hay inscritos y todavía no hay partidos', async () => {
    // Es lo que la gente quiere saber en ese momento: quiénes se anotaron.
    const publicado = await cuadro();

    expect(publicado.estado).toBe(EstadoTorneo.INSCRIPCION);
    expect(publicado.partidos).toHaveLength(0);
  });

  it('**el cuadro se publica con los resultados que ya se cargaron**', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/cuadro`)
      .set('Cookie', cookieAdmin)
      .expect(201);

    const interno = await request(app.getHttpServer())
      .get(`/api/admin/torneos/${torneoId}/cuadro`)
      .set('Cookie', cookieAdmin)
      .expect(200);
    const semi = (
      interno.body as {
        partidos: { id: number; ronda: number; jugadorAId: number }[];
      }
    ).partidos.find((p) => p.ronda === 1)!;

    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/partidos/${semi.id}/resultado`)
      .set('Cookie', cookieAdmin)
      .send({ ganadorId: semi.jugadorAId, marcador: '6-4 6-2' })
      .expect(200);

    const publicado = await cuadro();
    const jugado = publicado.partidos.find((p) => p.marcador !== null);

    expect(jugado?.marcador).toBe('6-4 6-2');
    expect(jugado?.ganador).toContain(APELLIDO);
    expect(jugado?.ronda_nombre).toBe('Semifinal');
  });

  it('**un torneo cancelado no se publica**', async () => {
    // No se va a jugar: en el calendario es ruido en la pantalla que alguien mira
    // para decidir si se asocia.
    await prisma.torneo.update({
      where: { id: torneoId },
      data: { estado: EstadoTorneo.CANCELADO },
    });

    expect(
      (await calendario('?anio=2026')).some((t) => t.id === torneoId),
    ).toBe(false);
    await request(app.getHttpServer())
      .get(`/api/torneos/${torneoId}/cuadro`)
      .expect(404);
  });

  it('el calendario es de un año: lo del año que viene no se mezcla', async () => {
    expect(
      (await calendario('?anio=2025')).some((t) => t.id === torneoId),
    ).toBe(false);
  });

  it('un año ilegible se cae al actual en vez de fallar', async () => {
    await request(app.getHttpServer())
      .get('/api/torneos/publicos?anio=nomeacuerdo')
      .expect(200);
  });

  it('las fechas salen como fecha civil, no como instante', async () => {
    const suyo = (await calendario('?anio=2026')).find(
      (t) => t.id === torneoId,
    );

    expect(suyo?.fechaInicio).toBe('2026-12-01');
  });
});
