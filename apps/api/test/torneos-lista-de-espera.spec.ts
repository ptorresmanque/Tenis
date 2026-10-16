import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { sembrarCategoriasDeJuego } from '../src/arranque';
import {
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
  EstadoTorneo,
} from '../src/generated/prisma/client';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { PrismaService } from '../src/prisma/prisma.service';
import { ListaDeEspera } from '../src/torneos/lista-de-espera.service';
import { vencimientoDeLaOferta } from '../src/torneos/plazo-de-oferta';

/**
 * T329 (`SPEC-torneos.md` § Lista de espera sin cobro, E3, E4, E5, LE2, LE7 y LE8). Cuando se
 * abre un cupo, al primero de la fila se le guarda un plazo para tomarlo y se le avisa por
 * correo. Quien ya había pagado entra directo. Con la inscripción cerrada o el cuadro armado,
 * no se ofrece nada: lo resuelve el admin con «Promover».
 */
describe('ListaDeEspera.ofrecerCupos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let lista: ListaDeEspera;
  let cuartaId: number;
  let plazoOriginal: number;

  const enviados: CorreoSaliente[] = [];
  const enviador = {
    enviar: (correo: CorreoSaliente) => {
      enviados.push(correo);
      return Promise.resolve();
    },
  };

  const MARCA = 'Copa de la lista de espera';
  const APELLIDO = 'DeLaFila';
  const CIERRE = new Date('2027-11-25T00:00:00.000Z');

  /** Un torneo con una categoría de 4ª de `cupo` lugares, y su cuadro. */
  const crearCuadro = async ({
    cupo = 2,
    montoInscripcionClp = 15_000,
    cierreInscripcion = CIERRE,
  } = {}) => {
    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}${Math.random()}`,
        fechaInicio: new Date('2027-12-01T00:00:00.000Z'),
        fechaFin: new Date('2027-12-07T00:00:00.000Z'),
        cierreInscripcion,
        cuadros: {
          create: { categoriaJuegoId: cuartaId, cupo, montoInscripcionClp },
        },
      },
      select: { id: true, cuadros: { select: { id: true } } },
    });

    return { torneoId: torneo.id, cuadroId: torneo.cuadros[0].id };
  };

  let correlativo = 0;

  /** Anota a alguien en el cuadro, `minutos` después de las 10:00 del 1 de octubre. */
  const anotar = async (
    cuadro: { torneoId: number; cuadroId: number },
    estado: EstadoInscripcionTorneo,
    minutos: number,
    pago: {
      estadoPago?: EstadoPagoInscripcion;
      comprobanteRuta?: string;
    } = {},
  ) => {
    correlativo += 1;
    const jugador = await prisma.jugador.create({
      data: { nombre: `Jugador${correlativo}`, apellido: APELLIDO },
    });

    return prisma.inscripcionTorneo.create({
      data: {
        torneoId: cuadro.torneoId,
        torneoCategoriaId: cuadro.cuadroId,
        jugadorId: jugador.id,
        estado,
        estadoPago: pago.estadoPago ?? EstadoPagoInscripcion.PENDIENTE,
        comprobanteRuta: pago.comprobanteRuta ?? null,
        email: `jugador${correlativo}@lista.ejemplo.cl`,
        inscritaEn: new Date(
          Date.parse('2026-10-01T13:00:00.000Z') + minutos * 60_000,
        ),
      },
      select: { id: true, token: true, email: true },
    });
  };

  const laFila = (cuadroId: number) =>
    prisma.inscripcionTorneo.findMany({
      where: { torneoCategoriaId: cuadroId },
      orderBy: { inscritaEn: 'asc' },
      select: { id: true, estado: true, cupoOfrecidoHasta: true },
    });

  const para = (email: string | null) =>
    enviados.filter((correo) => correo.para === email);

  const limpiar = async () => {
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnviadorCorreo)
      .useValue(enviador)
      .compile();

    app = modulo.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    lista = app.get(ListaDeEspera);
    await sembrarCategoriasDeJuego(prisma);
    cuartaId = (
      await prisma.categoriaJuego.findUniqueOrThrow({ where: { nombre: '4ª' } })
    ).id;
    plazoOriginal = (await prisma.configuracionClub.findFirstOrThrow())
      .plazoCupoListaEsperaMin;
  });

  afterAll(async () => {
    await limpiar();
    await prisma.configuracionClub.updateMany({
      data: { plazoCupoListaEsperaMin: plazoOriginal },
    });
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();
    enviados.length = 0;
  });

  it('**un cupo libre y tres esperando: solo el primero recibe la oferta y su correo** (LE2)', async () => {
    const cuadro = await crearCuadro({ cupo: 2 });
    await anotar(cuadro, EstadoInscripcionTorneo.INSCRITA, 0);
    // Se anotan desordenados: manda la hora de inscripción, no el orden de las filas.
    const tercero = await anotar(
      cuadro,
      EstadoInscripcionTorneo.LISTA_ESPERA,
      30,
    );
    const primero = await anotar(
      cuadro,
      EstadoInscripcionTorneo.LISTA_ESPERA,
      10,
    );
    const segundo = await anotar(
      cuadro,
      EstadoInscripcionTorneo.LISTA_ESPERA,
      20,
    );

    await lista.ofrecerCupos(cuadro.cuadroId);

    const fila = await laFila(cuadro.cuadroId);
    const deQuien = (id: number) => fila.find((una) => una.id === id);
    expect(deQuien(primero.id)?.cupoOfrecidoHasta).not.toBeNull();
    expect(deQuien(primero.id)?.estado).toBe('LISTA_ESPERA');
    expect(deQuien(segundo.id)?.cupoOfrecidoHasta).toBeNull();
    expect(deQuien(tercero.id)?.cupoOfrecidoHasta).toBeNull();

    const [correo] = para(primero.email);
    expect(correo.asunto).toContain('Se abrió un cupo');
    expect(correo.cuerpo).toContain(`/torneos/inscripcion/${primero.token}`);
    expect(para(segundo.email)).toEqual([]);
    expect(para(tercero.email)).toEqual([]);
  });

  it('**el plazo es el del club, y corre de día**: vence cuando dice `vencimientoDeLaOferta`', async () => {
    await prisma.configuracionClub.updateMany({
      data: { plazoCupoListaEsperaMin: 60 },
    });
    const cuadro = await crearCuadro({ cupo: 1 });
    const primero = await anotar(
      cuadro,
      EstadoInscripcionTorneo.LISTA_ESPERA,
      0,
    );

    const antes = new Date();
    await lista.ofrecerCupos(cuadro.cuadroId);
    const despues = new Date();

    const { cupoOfrecidoHasta } =
      await prisma.inscripcionTorneo.findUniqueOrThrow({
        where: { id: primero.id },
      });
    expect(cupoOfrecidoHasta!.getTime()).toBeGreaterThanOrEqual(
      vencimientoDeLaOferta(antes, 60, CIERRE).getTime() - 1000,
    );
    expect(cupoOfrecidoHasta!.getTime()).toBeLessThanOrEqual(
      vencimientoDeLaOferta(despues, 60, CIERRE).getTime() + 1000,
    );
  });

  it('dos cupos libres, dos ofertas, en el orden de la fila', async () => {
    const cuadro = await crearCuadro({ cupo: 2 });
    const primero = await anotar(
      cuadro,
      EstadoInscripcionTorneo.LISTA_ESPERA,
      0,
    );
    const segundo = await anotar(
      cuadro,
      EstadoInscripcionTorneo.LISTA_ESPERA,
      1,
    );
    const tercero = await anotar(
      cuadro,
      EstadoInscripcionTorneo.LISTA_ESPERA,
      2,
    );

    await lista.ofrecerCupos(cuadro.cuadroId);

    const conOferta = (await laFila(cuadro.cuadroId))
      .filter((una) => una.cupoOfrecidoHasta !== null)
      .map((una) => una.id);
    expect(conOferta).toEqual([primero.id, segundo.id]);
    expect(para(tercero.email)).toEqual([]);
  });

  it('**una oferta ya dada ocupa su lugar**: volver a llamar no se la da a otro', async () => {
    const cuadro = await crearCuadro({ cupo: 1 });
    await anotar(cuadro, EstadoInscripcionTorneo.LISTA_ESPERA, 0);
    const segundo = await anotar(
      cuadro,
      EstadoInscripcionTorneo.LISTA_ESPERA,
      1,
    );

    await lista.ofrecerCupos(cuadro.cuadroId);
    await lista.ofrecerCupos(cuadro.cuadroId);

    expect(
      (await laFila(cuadro.cuadroId)).filter(
        (una) => una.cupoOfrecidoHasta !== null,
      ),
    ).toHaveLength(1);
    expect(para(segundo.email)).toEqual([]);
    expect(enviados).toHaveLength(1);
  });

  it('**quien ya pagó entra directo, con «Quedaste dentro»**, y el cupo queda tomado (LE8)', async () => {
    const cuadro = await crearCuadro({ cupo: 1 });
    const pagado = await anotar(
      cuadro,
      EstadoInscripcionTorneo.LISTA_ESPERA,
      0,
      {
        estadoPago: EstadoPagoInscripcion.PAGADA,
      },
    );
    const siguiente = await anotar(
      cuadro,
      EstadoInscripcionTorneo.LISTA_ESPERA,
      1,
    );

    await lista.ofrecerCupos(cuadro.cuadroId);

    const fila = await laFila(cuadro.cuadroId);
    expect(fila.find((una) => una.id === pagado.id)).toMatchObject({
      estado: 'INSCRITA',
      cupoOfrecidoHasta: null,
    });
    expect(
      fila.find((una) => una.id === siguiente.id)?.cupoOfrecidoHasta,
    ).toBeNull();
    expect(para(pagado.email).map((correo) => correo.asunto)).toEqual([
      expect.stringContaining('Quedaste dentro'),
    ]);
    expect(para(siguiente.email)).toEqual([]);
  });

  it('**el que subió su comprobante antes del cambio también entra directo** (E4)', async () => {
    const cuadro = await crearCuadro({ cupo: 1 });
    const transfirio = await anotar(
      cuadro,
      EstadoInscripcionTorneo.LISTA_ESPERA,
      0,
      {
        comprobanteRuta: 'comprobantes/de-antes.jpg',
      },
    );

    await lista.ofrecerCupos(cuadro.cuadroId);

    expect(
      await prisma.inscripcionTorneo.findUniqueOrThrow({
        where: { id: transfirio.id },
        select: { estado: true, estadoPago: true },
      }),
    ).toEqual({ estado: 'INSCRITA', estadoPago: 'PENDIENTE' });
  });

  it('**una categoría gratis también avisa y guarda el cupo** (E5)', async () => {
    const cuadro = await crearCuadro({ cupo: 1, montoInscripcionClp: 0 });
    const primero = await anotar(
      cuadro,
      EstadoInscripcionTorneo.LISTA_ESPERA,
      0,
      {
        estadoPago: EstadoPagoInscripcion.EXENTA,
      },
    );

    await lista.ofrecerCupos(cuadro.cuadroId);

    const [unica] = await laFila(cuadro.cuadroId);
    expect(unica.estado).toBe('LISTA_ESPERA');
    expect(unica.cupoOfrecidoHasta).toBeInstanceOf(Date);
    expect(para(primero.email)[0].asunto).toContain('Se abrió un cupo');
  });

  describe('**con la inscripción cerrada o el cuadro armado no se ofrece nada** (E3, LE7)', () => {
    it('cerrada por fecha', async () => {
      const cuadro = await crearCuadro({
        cupo: 1,
        cierreInscripcion: new Date('2026-01-01T00:00:00.000Z'),
      });
      await anotar(cuadro, EstadoInscripcionTorneo.LISTA_ESPERA, 0);

      await lista.ofrecerCupos(cuadro.cuadroId);

      expect((await laFila(cuadro.cuadroId))[0].cupoOfrecidoHasta).toBeNull();
      expect(enviados).toEqual([]);
    });

    it('con el cuadro armado', async () => {
      const cuadro = await crearCuadro({ cupo: 1 });
      await prisma.torneoCategoria.update({
        where: { id: cuadro.cuadroId },
        data: { semillaSorteo: 42 },
      });
      await anotar(cuadro, EstadoInscripcionTorneo.LISTA_ESPERA, 0);

      await lista.ofrecerCupos(cuadro.cuadroId);

      expect((await laFila(cuadro.cuadroId))[0].cupoOfrecidoHasta).toBeNull();
    });

    it('con el torneo cancelado', async () => {
      const cuadro = await crearCuadro({ cupo: 1 });
      await prisma.torneo.update({
        where: { id: cuadro.torneoId },
        data: { estado: EstadoTorneo.CANCELADO },
      });
      await anotar(cuadro, EstadoInscripcionTorneo.LISTA_ESPERA, 0);

      await lista.ofrecerCupos(cuadro.cuadroId);

      expect((await laFila(cuadro.cuadroId))[0].cupoOfrecidoHasta).toBeNull();
    });
  });

  it('**dos llamadas simultáneas no dan dos ofertas para un lugar**', async () => {
    // Retirar a uno y vencer el plazo de otro pueden llegar a la vez: sin el candado, las dos
    // cuentan el mismo lugar libre y se lo ofrecen a dos personas.
    const cuadro = await crearCuadro({ cupo: 1 });
    for (let minuto = 0; minuto < 3; minuto += 1) {
      await anotar(cuadro, EstadoInscripcionTorneo.LISTA_ESPERA, minuto);
    }

    await Promise.all([
      lista.ofrecerCupos(cuadro.cuadroId),
      lista.ofrecerCupos(cuadro.cuadroId),
      lista.ofrecerCupos(cuadro.cuadroId),
    ]);

    expect(
      (await laFila(cuadro.cuadroId)).filter(
        (una) => una.cupoOfrecidoHasta !== null,
      ),
    ).toHaveLength(1);
    expect(enviados).toHaveLength(1);
  });
});
