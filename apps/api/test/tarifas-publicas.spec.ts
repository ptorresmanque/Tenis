import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { Superficie } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T39: cuánto sale una hora y a qué hora abre el club, sin tener que preguntar.
 *
 * Es la mitad de lo que el perfil pide publicar —"no existe un lugar donde publicar
 * tarifas, horarios, ubicación"— y hoy solo se ve bloque por bloque en la grilla, que
 * sirve para reservar y no para responder **"¿cuánto sale una hora los sábados?"**.
 *
 * Nada de esto es sensible: es el precio de lista que el club quiere que se sepa.
 * Tenerlo detrás de una cuenta es la barrera de entrada de la problemática 2.5.
 */
describe('GET /api/tarifas y GET /api/horarios', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let canchaId: number;

  const NOMBRE_CANCHA = 'Cancha de tarifas';

  const tarifas = async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/tarifas')
      .expect(200);

    return respuesta.body as {
      canchaId: number | null;
      cancha: string | null;
      diaSemana: number | null;
      horaDesde: string;
      horaHasta: string;
      esPico: boolean;
      montoClp: number;
      montoClp90: number | null;
    }[];
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
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });

    const cancha = await prisma.cancha.create({
      data: {
        nombre: NOMBRE_CANCHA,
        superficie: Superficie.CEMENTO,
        techada: true,
        iluminacion: true,
        activa: true,
        horarios: {
          create: { diaSemana: 6, horaApertura: '09:00', horaCierre: '20:00' },
        },
        franjas: {
          create: [
            {
              horaDesde: '09:00',
              horaHasta: '18:00',
              montoClp: 14000,
              esPico: false,
              vigenteDesde: new Date('2026-01-01'),
            },
            {
              horaDesde: '18:00',
              horaHasta: '20:00',
              montoClp: 22000,
              montoClp90: 30000,
              esPico: true,
              vigenteDesde: new Date('2026-01-01'),
            },
            // Cerrada: el precio del año pasado no es lo que alguien pregunta.
            {
              horaDesde: '09:00',
              horaHasta: '20:00',
              montoClp: 9000,
              esPico: false,
              vigenteDesde: new Date('2025-01-01'),
              vigenteHasta: new Date('2025-12-31'),
            },
          ],
        },
      },
      select: { id: true },
    });

    canchaId = cancha.id;
  });

  it('**responde sin cuenta**: es la barrera que esto viene a sacar', async () => {
    const lista = await tarifas();

    expect(lista.length).toBeGreaterThan(0);
  });

  it('trae la tarifa con su franja, su monto y si es pico', async () => {
    const lista = await tarifas();
    const pico = lista.find(
      (f) => f.canchaId === canchaId && f.horaDesde === '18:00',
    );

    expect(pico).toMatchObject({
      horaHasta: '20:00',
      montoClp: 22000,
      esPico: true,
      cancha: NOMBRE_CANCHA,
    });
  });

  it('trae el precio de 1 hora y media donde existe, y nulo donde no (T81)', async () => {
    // Nulo y no inventado: la página publica solo el de 1 hora en esa franja, porque
    // ahí la hora y media no se vende (`SPEC-catalogo-canchas.md` § Las tarifas son
    // públicas).
    const lista = await tarifas();
    const suyas = lista.filter((f) => f.canchaId === canchaId);

    expect(suyas.map((f) => [f.horaDesde, f.montoClp, f.montoClp90])).toEqual([
      ['09:00', 14000, null],
      ['18:00', 22000, 30000],
    ]);
  });

  it('**las franjas cerradas no salen**: la pregunta pública es qué vale hoy', async () => {
    const lista = await tarifas();

    expect(lista.some((f) => f.montoClp === 9000)).toBe(false);
  });

  it('dice de qué cancha es cada tarifa, y cuál rige en todas', async () => {
    // Sin el nombre, una lista de rangos y montos no se puede leer: el club tiene
    // tarifas propias por cancha y una general, y se ven igual.
    const lista = await tarifas();

    expect(lista.some((f) => f.canchaId === null && f.cancha === null)).toBe(
      true,
    );
    expect(lista.some((f) => f.cancha === NOMBRE_CANCHA)).toBe(true);
  });

  it('la tarifa de una cancha desactivada no se publica', async () => {
    // Una cancha que el club sacó de circulación no tiene precio que anunciar, y
    // publicarlo hace que alguien pregunte por una hora que no existe.
    await prisma.cancha.update({
      where: { id: canchaId },
      data: { activa: false },
    });

    const lista = await tarifas();

    expect(lista.some((f) => f.canchaId === canchaId)).toBe(false);
  });

  it('el horario de apertura también es público', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/horarios')
      .expect(200);

    const cuerpo = respuesta.body as {
      general: {
        diaSemana: number;
        horaApertura: string;
        horaCierre: string;
      }[];
      porCancha: { cancha: string; horarios: { diaSemana: number }[] }[];
    };

    expect(cuerpo.general.length).toBeGreaterThan(0);
    expect(
      cuerpo.porCancha.find((c) => c.cancha === NOMBRE_CANCHA)?.horarios[0],
    ).toMatchObject({
      diaSemana: 6,
      horaApertura: '09:00',
      horaCierre: '20:00',
    });
  });
});
