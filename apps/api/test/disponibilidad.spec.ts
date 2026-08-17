import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { MotivoBloqueo, Superficie } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { sembrarCatalogo } from '../prisma/seed-catalogo';

/**
 * T12. El endpoint público de disponibilidad: la consulta que sostiene la pantalla
 * principal. Es de lectura y no pide sesión — un visitante tiene que poder mirar
 * los horarios y el precio antes de decidir si se registra.
 *
 * La cancha del test trae horario y tarifas propias, **distintas de las generales
 * del seed**, que es lo que permite ver cuál de las dos ganó.
 */
describe('GET /api/disponibilidad', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let canchaId: number;

  const NOMBRE = 'Cancha T12';
  // Un lunes de agosto: el club en UTC-4, sin cambios de hora de por medio.
  const LUNES = '2026-08-17';
  const MARTES = '2026-08-18';

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);

    // El horario general de los siete días, para que el caso "esta cancha no tiene
    // horario propio ese día" tenga con qué resolverse. Idempotente.
    await sembrarCatalogo(prisma);
  });

  afterAll(async () => {
    // Por prefijo: algún test crea una cancha auxiliar, y si su assert falla antes
    // de borrarla, la siguiente corrida choca con el único sobre el nombre.
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE } },
    });
    await app.close();
  });

  beforeEach(async () => {
    // Por prefijo: algún test crea una cancha auxiliar, y si su assert falla antes
    // de borrarla, la siguiente corrida choca con el único sobre el nombre.
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE } },
    });

    const cancha = await prisma.cancha.create({
      data: {
        nombre: NOMBRE,
        superficie: Superficie.ARCILLA,
        // Lunes 09:00–21:00, contra las 08:00–22:00 generales del seed: si ganara
        // el general, saldrían 14 bloques en vez de 12.
        horarios: {
          create: { diaSemana: 1, horaApertura: '09:00', horaCierre: '21:00' },
        },
        // Tarifas propias, más caras que las generales por la misma razón.
        franjas: {
          create: [
            {
              horaDesde: '08:00',
              horaHasta: '18:00',
              montoClp: 15000,
              vigenteDesde: new Date('2026-01-01T00:00:00.000Z'),
            },
            {
              horaDesde: '18:00',
              horaHasta: '22:00',
              esPico: true,
              montoClp: 25000,
              vigenteDesde: new Date('2026-01-01T00:00:00.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });

    canchaId = cancha.id;
  });

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  interface BloqueRespondido {
    inicio: string;
    fin: string;
    canchaId: number;
    montoClp: number;
    esPico: boolean;
    bloqueado: boolean;
    motivoBloqueo: string | null;
  }

  const pedir = async (consulta: string): Promise<BloqueRespondido[]> => {
    const respuesta = await request(servidor())
      .get(`/api/disponibilidad?${consulta}`)
      .expect(200);

    return respuesta.body as BloqueRespondido[];
  };

  const delLunes = () => pedir(`cancha=${canchaId}&fecha=${LUNES}`);

  it('responde sin sesión, con el horario propio de la cancha', async () => {
    // 12 y no 14: gana el horario de la cancha sobre el general del club.
    expect(await delLunes()).toHaveLength(12);
  });

  it('devuelve cada bloque con su hora, su precio y si es pico', async () => {
    const bloques = await delLunes();

    // Las 09:00 del club en agosto son las 13:00Z.
    expect(bloques[0]).toEqual({
      inicio: '2026-08-17T13:00:00.000Z',
      fin: '2026-08-17T14:00:00.000Z',
      canchaId,
      montoClp: 15000,
      esPico: false,
      bloqueado: false,
      motivoBloqueo: null,
    });

    // El bloque de las 18:00 —22:00Z— ya es pico y cuesta más. Sin esto el precio
    // sería el mismo todo el día y en la grilla no se notaría.
    expect(
      bloques.find((b) => b.inicio === '2026-08-17T22:00:00.000Z'),
    ).toMatchObject({ montoClp: 25000, esPico: true });
  });

  it('sin horario propio ese día, abre en el horario general del club', async () => {
    // El martes esta cancha no tiene horario suyo: vale el del club, 08:00–22:00.
    const bloques = await pedir(`cancha=${canchaId}&fecha=${MARTES}`);

    expect(bloques).toHaveLength(14);
    expect(bloques[0].inicio).toBe('2026-08-18T12:00:00.000Z');
    // Las tarifas propias siguen siendo suyas: no se heredan del horario.
    expect(bloques[0].montoClp).toBe(15000);
  });

  it('marca los bloques que un bloqueo cubre, y dice por qué', async () => {
    await prisma.bloqueo.create({
      data: {
        canchaId,
        inicio: new Date('2026-08-17T14:00:00.000Z'),
        fin: new Date('2026-08-17T16:00:00.000Z'),
        motivo: MotivoBloqueo.MANTENCION,
        descripcion: 'Riego',
      },
    });

    const bloques = await delLunes();

    expect(bloques.filter((b) => b.bloqueado).map((b) => b.inicio)).toEqual([
      '2026-08-17T14:00:00.000Z',
      '2026-08-17T15:00:00.000Z',
    ]);
    expect(bloques.find((b) => b.bloqueado)?.motivoBloqueo).toBe('MANTENCION');
  });

  it('un bloqueo de otra cancha no ensucia esta grilla', async () => {
    const otra = await prisma.cancha.create({
      data: { nombre: `${NOMBRE} bis`, superficie: Superficie.CEMENTO },
      select: { id: true },
    });

    await prisma.bloqueo.create({
      data: {
        canchaId: otra.id,
        inicio: new Date('2026-08-17T14:00:00.000Z'),
        fin: new Date('2026-08-17T16:00:00.000Z'),
        motivo: MotivoBloqueo.TORNEO,
      },
    });

    expect((await delLunes()).some((b) => b.bloqueado)).toBe(false);

    await prisma.cancha.delete({ where: { id: otra.id } });
  });

  describe('GET /api/canchas', () => {
    it('lista las canchas activas y no las desactivadas', async () => {
      const activas = async () => {
        const respuesta = await request(servidor())
          .get('/api/canchas')
          .expect(200);

        return (respuesta.body as { id: number }[]).map((c) => c.id);
      };

      expect(await activas()).toContain(canchaId);

      await prisma.cancha.update({
        where: { id: canchaId },
        data: { activa: false },
      });

      // Si una cancha desactivada siguiera en la lista, aparecería en la grilla
      // como una columna que después responde 404 al pedir sus bloques.
      expect(await activas()).not.toContain(canchaId);
    });

    it('trae lo que la grilla necesita para rotular la columna', async () => {
      const respuesta = await request(servidor())
        .get('/api/canchas')
        .expect(200);
      const cancha = (respuesta.body as { id: number }[]).find(
        (c) => c.id === canchaId,
      );

      expect(cancha).toEqual({
        id: canchaId,
        nombre: NOMBRE,
        superficie: 'ARCILLA',
        techada: false,
        iluminacion: false,
      });
    });
  });

  describe('entradas que no sirven', () => {
    const fallar = (consulta: string, codigo: number) =>
      request(servidor()).get(`/api/disponibilidad?${consulta}`).expect(codigo);

    it('rechaza una fecha con forma equivocada', async () => {
      await fallar(`cancha=${canchaId}&fecha=17-08-2026`, 400);
      await fallar(`cancha=${canchaId}`, 400);
    });

    it('rechaza un día que no existe en vez de correrlo al mes siguiente', async () => {
      // `new Date` acepta el 30 de febrero y lo desborda al 2 de marzo: sin esto
      // la respuesta sería la del 2 de marzo sin que nada avisara.
      await fallar(`cancha=${canchaId}&fecha=2026-02-30`, 400);
    });

    it('rechaza una cancha que no es un número', async () => {
      await fallar(`cancha=todas&fecha=${LUNES}`, 400);
    });

    it('responde 404 por una cancha que no existe', async () => {
      await fallar(`cancha=999999&fecha=${LUNES}`, 404);
    });

    it('responde 404 por una cancha desactivada', async () => {
      // Desactivar no borra el historial, pero sí saca la cancha de la grilla
      // pública: si siguiera apareciendo, alguien reservaría una cancha cerrada.
      await prisma.cancha.update({
        where: { id: canchaId },
        data: { activa: false },
      });

      await fallar(`cancha=${canchaId}&fecha=${LUNES}`, 404);
    });
  });
});
