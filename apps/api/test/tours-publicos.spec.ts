import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T194: lo público de los tours, sin sesión (`SPEC-tours.md` § API).
 *
 * Todo lo del tour se ve: nombre, descripción, imagen, temporadas, niveles con su tabla
 * y galería. **Lo que no sale** es lo del panel —en cuántos torneos se usa cada nivel— y,
 * como siempre, la ruta de un archivo en el disco.
 */
describe('Tours públicos', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const MARCA = 'Tour público de prueba';

  interface TourEnLista {
    id: number;
    nombre: string;
    extracto: string;
    imagen: { miniatura: string; web: string } | null;
    temporadaVigente: { id: number; nombre: string } | null;
  }

  interface TourPublico {
    id: number;
    descripcion: string;
    temporadaVigenteId: number | null;
    temporadas: {
      id: number;
      nombre: string;
      niveles: Record<string, unknown>[];
    }[];
    fotos: unknown[];
  }

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  /** Una fecha civil a tantos días de hoy, para no depender del día en que corre. */
  const aDias = (dias: number) => {
    const fecha = new Date();
    fecha.setUTCDate(fecha.getUTCDate() + dias);
    return new Date(`${fecha.toISOString().slice(0, 10)}T00:00:00.000Z`);
  };

  /** Un tour con una temporada pasada y una en curso, la en curso con un nivel. */
  const unTour = async (descripcion = '') => {
    const tour = await prisma.tour.create({
      data: { nombre: `${MARCA} ${Date.now()}${Math.random()}`, descripcion },
    });
    await prisma.temporadaTour.create({
      data: {
        tourId: tour.id,
        nombre: 'Pasada',
        fechaInicio: aDias(-500),
        fechaFin: aDias(-300),
      },
    });
    const enCurso = await prisma.temporadaTour.create({
      data: {
        tourId: tour.id,
        nombre: 'En curso',
        fechaInicio: aDias(-100),
        fechaFin: aDias(100),
        niveles: {
          create: {
            nombre: '500',
            puntosCampeon: 500,
            puntosFinalista: 300,
            puntosSemifinal: 180,
            puntosCuartos: 90,
            puntosOctavos: 45,
            puntosDieciseisavos: 20,
            puntosTreintaidosavos: 10,
          },
        },
      },
    });

    return { tour, enCurso };
  };

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
    await prisma.tour.deleteMany({ where: { nombre: { startsWith: MARCA } } });
  });

  afterAll(async () => {
    await prisma.tour.deleteMany({ where: { nombre: { startsWith: MARCA } } });
    await app.close();
  });

  it('**la lista se ve sin cuenta**, con la temporada vigente de cada tour', async () => {
    const { tour, enCurso } = await unTour('La liga del club.');

    const lista = (await request(servidor()).get('/api/tours').expect(200))
      .body as TourEnLista[];
    const suyo = lista.find((t) => t.id === tour.id);

    expect(suyo).toMatchObject({
      id: tour.id,
      nombre: tour.nombre,
      extracto: 'La liga del club.',
      imagen: null,
      temporadaVigente: { id: enCurso.id, nombre: 'En curso' },
    });
  });

  it('**el extracto corta la descripción larga en una palabra** y lo dice con «…»', async () => {
    const larga = `${'Una liga con muchas temporadas y niveles distintos. '.repeat(10)}Fin.`;
    const { tour } = await unTour(larga);

    const lista = (await request(servidor()).get('/api/tours').expect(200))
      .body as TourEnLista[];
    const extracto = lista.find((t) => t.id === tour.id)!.extracto;

    expect(extracto.length).toBeLessThanOrEqual(161);
    expect(extracto.endsWith('…')).toBe(true);
    expect(larga.startsWith(extracto.slice(0, -1))).toBe(true);
    expect(extracto.slice(0, -1)).not.toMatch(/\s$/);
  });

  it('**la ficha trae todo lo público**, y la temporada vigente elegida', async () => {
    const { tour, enCurso } = await unTour('Primera línea.\nSegunda.');

    const ficha = (
      await request(servidor()).get(`/api/tours/${tour.id}`).expect(200)
    ).body as TourPublico;

    expect(ficha.descripcion).toBe('Primera línea.\nSegunda.');
    expect(ficha.temporadaVigenteId).toBe(enCurso.id);
    expect(ficha.temporadas.map((t) => t.nombre)).toEqual([
      'En curso',
      'Pasada',
    ]);
    expect(ficha.temporadas[0].niveles[0]).toEqual({
      id: expect.any(Number) as number,
      nombre: '500',
      tabla: {
        campeon: 500,
        finalista: 300,
        semifinal: 180,
        cuartos: 90,
        octavos: 45,
        dieciseisavos: 20,
        treintaidosavos: 10,
      },
    });
  });

  it('**no publica lo del panel** —en cuántos torneos se usa cada nivel— ni rutas del disco', async () => {
    const { tour } = await unTour();

    const cuerpo = JSON.stringify(
      (await request(servidor()).get(`/api/tours/${tour.id}`).expect(200)).body,
    );

    expect(cuerpo).not.toContain('torneos');
    expect(cuerpo).not.toContain('Terminados');
    expect(cuerpo).not.toContain('.jpg');
  });

  it('un tour sin temporadas tiene la vigente nula', async () => {
    const tour = await prisma.tour.create({
      data: { nombre: `${MARCA} vacío`, descripcion: '' },
    });

    const ficha = (
      await request(servidor()).get(`/api/tours/${tour.id}`).expect(200)
    ).body as TourPublico;

    expect(ficha.temporadaVigenteId).toBeNull();
    expect(ficha.temporadas).toEqual([]);
  });

  it('un tour que no existe responde 404', async () => {
    await request(servidor()).get('/api/tours/999999').expect(404);
  });
});
