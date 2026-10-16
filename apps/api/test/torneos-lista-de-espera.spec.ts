import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { sembrarCategoriasDeJuego } from '../src/arranque';
import {
  ConceptoPago,
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
  EstadoTorneo,
  MedioPagoInscripcion,
} from '../src/generated/prisma/client';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { PrismaService } from '../src/prisma/prisma.service';
import { CategoriasDelTorneo } from '../src/torneos/categorias-del-torneo.service';
import { ComprobantesDeInscripcion } from '../src/torneos/comprobantes.service';
import { InscripcionesAbandonadas } from '../src/torneos/inscripciones-abandonadas.service';
import { InscripcionesATorneo } from '../src/torneos/inscripciones.service';
import { ListaDeEspera } from '../src/torneos/lista-de-espera.service';
import { TorneosPublicos } from '../src/torneos/torneos-publicos.service';
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
      medioPago?: MedioPagoInscripcion;
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
        medioPago: pago.medioPago ?? null,
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

  const REFERENCIA = 'lista-de-espera-';

  const limpiar = async () => {
    await prisma.transaccion.deleteMany({
      where: { referencia: { startsWith: REFERENCIA } },
    });
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

  /**
   * T330 (LE2). **Cada camino que libera un cupo se lo ofrece al primero de la fila**, al
   * terminar: si uno se olvida, el cupo queda libre y nadie se entera.
   */
  describe('los caminos que liberan cupo (T330)', () => {
    /** Un cuadro de un lugar, tomado por `inscrito`, con uno esperando. */
    const lleno = async (
      pago: Parameters<typeof anotar>[3] = {},
      montoInscripcionClp = 15_000,
    ) => {
      const cuadro = await crearCuadro({ cupo: 1, montoInscripcionClp });
      const inscrito = await anotar(
        cuadro,
        EstadoInscripcionTorneo.INSCRITA,
        0,
        pago,
      );
      const esperando = await anotar(
        cuadro,
        EstadoInscripcionTorneo.LISTA_ESPERA,
        1,
      );

      return { cuadro, inscrito, esperando };
    };

    const recibioLaOferta = async (esperando: {
      id: number;
      email: string | null;
    }) => {
      const { cupoOfrecidoHasta } =
        await prisma.inscripcionTorneo.findUniqueOrThrow({
          where: { id: esperando.id },
        });
      expect(cupoOfrecidoHasta).toBeInstanceOf(Date);
      expect(para(esperando.email).map((correo) => correo.asunto)).toEqual([
        expect.stringContaining('Se abrió un cupo'),
      ]);
    };

    /** Una transacción de Webpay que no se autorizó, de la inscripción. */
    const transaccionDe = (inscripcionId: number) =>
      prisma.transaccion.create({
        data: {
          referencia: `${REFERENCIA}${inscripcionId}`,
          concepto: ConceptoPago.INSCRIPCION_TORNEO,
          conceptoId: inscripcionId,
          montoClp: 15_000,
          pasarela: 'doble',
          estado: 'RECHAZADA',
        },
      });

    const conWebpay = {
      medioPago: MedioPagoInscripcion.WEBPAY,
      estadoPago: EstadoPagoInscripcion.PENDIENTE,
    };

    it('**retirar a un inscrito**', async () => {
      const { cuadro, inscrito, esperando } = await lleno();

      await app.get(InscripcionesATorneo).retirar(cuadro.cuadroId, inscrito.id);

      await recibioLaOferta(esperando);
    });

    it('**rechazar un comprobante**', async () => {
      const { inscrito, esperando } = await lleno({
        medioPago: MedioPagoInscripcion.TRANSFERENCIA,
        comprobanteRuta: 'comprobantes/no-cuadra.jpg',
      });

      await app
        .get(ComprobantesDeInscripcion)
        .rechazar(inscrito.id, 'El monto no cuadra.');

      await recibioLaOferta(esperando);
    });

    it('**subir el cupo de la categoría**', async () => {
      const { cuadro, esperando } = await lleno();

      await app
        .get(CategoriasDelTorneo)
        .editar(cuadro.torneoId, cuadro.cuadroId, { cupo: 2 });

      await recibioLaOferta(esperando);
    });

    it('**el barrido de 15 minutos**, que suelta al que eligió Webpay y no pagó', async () => {
      // `anotar` lo inscribe el 1 de octubre: hace rato que pasó su ventana de pago.
      const { cuadro, esperando } = await lleno(conWebpay);

      await app
        .get(InscripcionesAbandonadas)
        .liberar({ torneoCategoriaId: cuadro.cuadroId });

      await recibioLaOferta(esperando);
    });

    it('**«Anular compra» en Webpay**', async () => {
      const { inscrito, esperando } = await lleno(conWebpay);
      const transaccion = await transaccionDe(inscrito.id);

      await app
        .get(InscripcionesAbandonadas)
        .anularDesdeRetorno(transaccion.referencia);

      await recibioLaOferta(esperando);
    });

    it('**el pago rechazado**', async () => {
      const { inscrito, esperando } = await lleno(conWebpay);
      const transaccion = await transaccionDe(inscrito.id);

      await app
        .get(InscripcionesAbandonadas)
        .soltarPorTransaccion(transaccion.id);

      await recibioLaOferta(esperando);
    });

    it('**volver atrás desde Webpay sin pagar**', async () => {
      const { inscrito, esperando } = await lleno(conWebpay);

      await app.get(InscripcionesAbandonadas).soltarPorToken(inscrito.token);

      await recibioLaOferta(esperando);
    });

    it('retirar al que esperaba sin oferta no le ofrece nada a nadie: no se abrió un lugar', async () => {
      const { cuadro, esperando } = await lleno();
      const ultimo = await anotar(
        cuadro,
        EstadoInscripcionTorneo.LISTA_ESPERA,
        2,
      );

      await app
        .get(InscripcionesATorneo)
        .retirar(cuadro.cuadroId, esperando.id);

      expect(enviados).toEqual([]);
      expect(
        (
          await prisma.inscripcionTorneo.findUniqueOrThrow({
            where: { id: ultimo.id },
          })
        ).cupoOfrecidoHasta,
      ).toBeNull();
    });
  });

  /**
   * T331 (LE3 y LE9). **Una oferta ocupa su lugar**, como un pago pendiente: quien llega queda en
   * espera, el sitio no lo cuenta como libre y «Promover» no se lo da a otro.
   */
  describe('una oferta ocupa cupo (T331)', () => {
    /** Un cuadro de un lugar, con ese lugar ofrecido al primero de la fila. */
    const ofrecido = async () => {
      const cuadro = await crearCuadro({ cupo: 1 });
      const conOferta = await anotar(
        cuadro,
        EstadoInscripcionTorneo.LISTA_ESPERA,
        0,
      );
      const segundo = await anotar(
        cuadro,
        EstadoInscripcionTorneo.LISTA_ESPERA,
        1,
      );
      await lista.ofrecerCupos(cuadro.cuadroId);

      return { cuadro, conOferta, segundo };
    };

    it('**quien llega mientras hay una oferta queda en espera**', async () => {
      const { cuadro } = await ofrecido();
      const nuevo = await prisma.jugador.create({
        data: { nombre: 'Recién llegado', apellido: APELLIDO },
      });

      const hecha = await app
        .get(InscripcionesATorneo)
        .inscribir(cuadro.cuadroId, { jugadorId: nuevo.id, email: null });

      expect(hecha.estado).toBe('LISTA_ESPERA');
    });

    it('**los cupos libres del sitio descuentan la oferta**', async () => {
      const { cuadro } = await ofrecido();

      const torneo = (await app.get(TorneosPublicos).calendario(2027)).find(
        (uno) => uno.id === cuadro.torneoId,
      );

      expect(torneo?.categorias[0].cuposLibres).toBe(0);
    });

    it('**«Promover» a otro con el lugar ofrecido lo rechaza, y dice a quién se le ofreció**', async () => {
      const { cuadro, conOferta, segundo } = await ofrecido();
      const { jugador } = await prisma.inscripcionTorneo.findUniqueOrThrow({
        where: { id: conOferta.id },
        select: { jugador: { select: { nombre: true } } },
      });

      const promover = app
        .get(InscripcionesATorneo)
        .promover(cuadro.cuadroId, segundo.id);

      await expect(promover).rejects.toThrow(jugador.nombre);
      await expect(promover).rejects.toThrow('ofrecido');
    });

    it('**«Promover» al que tiene la oferta sí, y la oferta se va**: por ejemplo, pagó en el mesón', async () => {
      const { cuadro, conOferta } = await ofrecido();

      await app
        .get(InscripcionesATorneo)
        .promover(cuadro.cuadroId, conOferta.id);

      expect(
        await prisma.inscripcionTorneo.findUniqueOrThrow({
          where: { id: conOferta.id },
          select: { estado: true, cupoOfrecidoHasta: true },
        }),
      ).toEqual({ estado: 'INSCRITA', cupoOfrecidoHasta: null });
    });
  });

  /**
   * T335 (E2, E6 y LE6). **El cron pasa el turno**: la oferta vencida sale de la lista, con su
   * correo, y el cupo va al siguiente. Si la persona está pagando en Webpay, espera.
   */
  describe('el cron pasa el turno (T335)', () => {
    const HACE_UN_MINUTO = () => new Date(Date.now() - 60_000);

    /** Un cuadro de un lugar, ofrecido al primero, con otro esperando detrás. */
    const ofrecido = async () => {
      const cuadro = await crearCuadro({ cupo: 1 });
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
      await lista.ofrecerCupos(cuadro.cuadroId);
      enviados.length = 0;

      return { cuadro, primero, segundo };
    };

    const vencer = (id: number) =>
      prisma.inscripcionTorneo.update({
        where: { id },
        data: { cupoOfrecidoHasta: HACE_UN_MINUTO() },
      });

    const como = (id: number) =>
      prisma.inscripcionTorneo.findUniqueOrThrow({
        where: { id },
        select: { estado: true, cupoOfrecidoHasta: true },
      });

    it('**la oferta vencida sale de la lista, con su correo, y el siguiente recibe la suya**', async () => {
      const { primero, segundo } = await ofrecido();
      await vencer(primero.id);

      await lista.vencerOfertas();

      // Retirada y con la oferta guardada: es el motivo del retiro (E2).
      expect(await como(primero.id)).toEqual({
        estado: 'RETIRADA',
        cupoOfrecidoHasta: expect.any(Date) as unknown,
      });
      expect(para(primero.email).map((correo) => correo.asunto)).toEqual([
        expect.stringContaining('Se venció tu plazo'),
      ]);
      expect((await como(segundo.id)).cupoOfrecidoHasta).toBeInstanceOf(Date);
      expect(para(segundo.email).map((correo) => correo.asunto)).toEqual([
        expect.stringContaining('Se abrió un cupo'),
      ]);
    });

    it('**con un pago de Webpay en curso, espera**: no le quita el cupo a quien está pagando', async () => {
      const { primero, segundo } = await ofrecido();
      await vencer(primero.id);
      await prisma.transaccion.create({
        data: {
          referencia: `${REFERENCIA}${primero.id}`,
          concepto: ConceptoPago.INSCRIPCION_TORNEO,
          conceptoId: primero.id,
          montoClp: 15_000,
          pasarela: 'doble',
        },
      });

      await lista.vencerOfertas();

      expect((await como(primero.id)).estado).toBe('LISTA_ESPERA');
      expect((await como(segundo.id)).cupoOfrecidoHasta).toBeNull();
      expect(enviados).toEqual([]);
    });

    it('una oferta vigente no se toca', async () => {
      const { primero } = await ofrecido();

      await lista.vencerOfertas();

      expect((await como(primero.id)).estado).toBe('LISTA_ESPERA');
      expect(enviados).toEqual([]);
    });

    it('**también ofrece el cupo libre que nadie ofreció**, por si un camino falló a medias', async () => {
      // Un retiro que quedó escrito sin que su oferta saliera: el cron lo repara en la vuelta
      // siguiente, en vez de dejar el cupo libre con gente esperando.
      const cuadro = await crearCuadro({ cupo: 1 });
      const esperando = await anotar(
        cuadro,
        EstadoInscripcionTorneo.LISTA_ESPERA,
        0,
      );

      await lista.vencerOfertas();

      expect((await como(esperando.id)).cupoOfrecidoHasta).toBeInstanceOf(Date);
    });

    it('con la inscripción cerrada no ofrece nada', async () => {
      const cuadro = await crearCuadro({
        cupo: 1,
        cierreInscripcion: new Date('2026-01-01T00:00:00.000Z'),
      });
      const esperando = await anotar(
        cuadro,
        EstadoInscripcionTorneo.LISTA_ESPERA,
        0,
      );

      await lista.vencerOfertas();

      expect((await como(esperando.id)).cupoOfrecidoHasta).toBeNull();
    });
  });
});
