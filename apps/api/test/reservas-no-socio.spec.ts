import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoReserva, Superficie } from '../src/generated/prisma/client';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventosDeReserva } from '../src/reservas/eventos';
import { ReservaNoSocioService } from '../src/reservas/reserva-no-socio.service';

/**
 * T23. El corazón de la demo: un visitante sin cuenta reserva una hora y la paga.
 *
 * El bloque queda tomado mientras está pagando y vuelve a la grilla si el pago no
 * llega. Todo contra el doble de pasarela, que para eso se construyó antes que el
 * adaptador de Webpay (T16).
 */
describe('Reserva de no-socio con pago', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pasarela: PasarelaFake;
  let canchaId: number;

  /** Los correos que salieron (T108). `falla` simula un sendmail caído. */
  const enviados: CorreoSaliente[] = [];
  let falla: Error | null = null;
  const enviador = {
    enviar: (correo: CorreoSaliente) => {
      if (falla) return Promise.reject(falla);
      enviados.push(correo);
      return Promise.resolve();
    },
  };

  const NOMBRE_CANCHA = 'Cancha T23 pago';
  // Lunes de agosto, sin cambio de hora de por medio. El club en UTC-4.
  // Y en el futuro: la API no reserva horas que ya empezaron. 2037 repite el
  // calendario de 2026, así que los días de la semana no cambian.
  const LUNES = '2037-08-17';
  const A_LAS_10 = '2037-08-17T14:00:00.000Z';

  const datosDelVisitante = {
    nombre: 'Camila Visitante',
    email: 'camila@ejemplo.cl',
    telefono: '+56955556666',
  };

  /** Lo que estos tests leen de la respuesta. supertest la entrega como `any`. */
  const reservarYPagar = async (parche: Record<string, unknown> = {}) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/reservas/no-socio')
      .send({ canchaId, inicio: A_LAS_10, ...datosDelVisitante, ...parche });

    return respuesta as Omit<typeof respuesta, 'body'> & {
      body: {
        urlRedireccion: string;
        folio: string;
        reservaId: number;
        motivo: string;
      };
    };
  };

  const volverDeWebpay = (token: string) =>
    request(app.getHttpServer()).get(`/api/reservas/retorno?token_ws=${token}`);

  /** El token que la pasarela le entregó a la última reserva iniciada. */
  const tokenDe = async (reservaId: number) => {
    const transaccion = await prisma.transaccion.findFirstOrThrow({
      where: { concepto: 'RESERVA', conceptoId: reservaId },
    });

    return transaccion.tokenPasarela!;
  };

  const bloqueLibre = async () => {
    const respuesta = await request(app.getHttpServer()).get(
      `/api/disponibilidad?cancha=${canchaId}&fecha=${LUNES}`,
    );

    return !(respuesta.body as { inicio: string; reservado: boolean }[]).find(
      (b) => b.inicio === A_LAS_10,
    )!.reservado;
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .overrideProvider(EnviadorCorreo)
      .useValue(enviador)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
    pasarela = app.get(PasarelaPago);
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await app.close();
  });

  beforeEach(async () => {
    pasarela.reiniciar();
    enviados.length = 0;
    falla = null;
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });

    const cancha = await prisma.cancha.create({
      data: {
        nombre: NOMBRE_CANCHA,
        superficie: Superficie.ARCILLA,
        horarios: {
          create: { diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' },
        },
        franjas: {
          create: {
            horaDesde: '08:00',
            horaHasta: '22:00',
            montoClp: 12000,
            vigenteDesde: new Date('2026-01-01'),
          },
        },
      },
      select: { id: true },
    });
    canchaId = cancha.id;
  });

  it('reservar sin sesión pide solo nombre, correo y teléfono', async () => {
    const respuesta = await reservarYPagar();

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.urlRedireccion).toBeTruthy();
    expect(respuesta.body.folio).toBeTruthy();

    const reserva = await prisma.reserva.findUniqueOrThrow({
      where: { id: respuesta.body.reservaId },
    });

    // Esperando el pago, no confirmada: nadie tiene la cancha hasta que pague.
    expect(reserva).toMatchObject({
      estado: EstadoReserva.PENDIENTE_PAGO,
      socioId: null,
      nombre: 'Camila Visitante',
      telefono: '+56955556666',
    });
  });

  it('los acompañantes del visitante quedan guardados con la reserva (T105)', async () => {
    const respuesta = await reservarYPagar({
      acompanantes: [{ nombre: 'Ana Pérez' }, { nombre: 'Beto' }],
    });

    expect(respuesta.status).toBe(201);
    const guardados = await prisma.acompananteReserva.findMany({
      where: { reservaId: respuesta.body.reservaId },
      orderBy: { id: 'asc' },
    });
    expect(guardados.map((a) => [a.nombre, a.socioId])).toEqual([
      ['Ana Pérez', null],
      ['Beto', null],
    ]);
  });

  it('el monto lo calcula el servidor y el del cliente se ignora', async () => {
    // `SPEC.md` § Boundaries: nunca confiar en un precio que venga del cliente. Es el
    // guardia que T16 dejó anotado para acá, donde por fin hay un borde real.
    const respuesta = await reservarYPagar({ montoClp: 1, monto: 1 });

    const transaccion = await prisma.transaccion.findFirstOrThrow({
      where: { concepto: 'RESERVA', conceptoId: respuesta.body.reservaId },
    });

    expect(transaccion.montoClp).toBe(12000);
    expect(pasarela.ordenes[0].montoClp).toBe(12000);
  });

  it('el bloque queda tomado mientras el pago está pendiente', async () => {
    await reservarYPagar();

    expect(await bloqueLibre()).toBe(false);
  });

  it('nadie más puede reservar ese bloque mientras tanto', async () => {
    await reservarYPagar();

    const segunda = await reservarYPagar({ email: 'otro@ejemplo.cl' });

    expect(segunda.status).toBe(409);
    expect(segunda.body.motivo).toBe('BLOQUE_TOMADO');
  });

  it('un visitante reserva empezando a la media hora (T78)', async () => {
    const respuesta = await reservarYPagar({
      inicio: '2037-08-17T14:30:00.000Z',
    });

    expect(respuesta.status).toBe(201);
    const reserva = await prisma.reserva.findUniqueOrThrow({
      where: { id: (respuesta.body as { reservaId: number }).reservaId },
    });
    // 10:30 a 11:30 del club: una hora, aunque no empiece en punto.
    expect([reserva.inicio.toISOString(), reserva.fin.toISOString()]).toEqual([
      '2037-08-17T14:30:00.000Z',
      '2037-08-17T15:30:00.000Z',
    ]);
  });

  it('la hora que pisa a medias otra ya tomada se rechaza como tomada (T78)', async () => {
    // 10:00–11:00 contra 10:30–11:30: no empiezan a la misma hora y se pisan igual.
    // Lo ataja el índice por rango de T76, no una consulta previa.
    await reservarYPagar();

    const segunda = await reservarYPagar({
      inicio: '2037-08-17T14:30:00.000Z',
      email: 'otro@ejemplo.cl',
    });

    expect(segunda.status).toBe(409);
    expect((segunda.body as { motivo: string }).motivo).toBe('BLOQUE_TOMADO');
  });

  /** T82. El visitante elige 1 hora o 1 hora y media y paga el precio de esa duración. */
  describe('con 1 hora y media', () => {
    const conPrecioDeHoraYMedia = (montoClp90: number) =>
      prisma.franjaHoraria.updateMany({
        where: { canchaId },
        data: { montoClp90 },
      });
    const pagado = async (reservaId: number) =>
      (
        await prisma.transaccion.findFirstOrThrow({
          where: { concepto: 'RESERVA', conceptoId: reservaId },
        })
      ).montoClp;
    const idDe = (respuesta: { body: unknown }) =>
      (respuesta.body as { reservaId: number }).reservaId;

    it('**cobra el precio de 1 hora y media y la reserva dura 90 minutos**', async () => {
      await conPrecioDeHoraYMedia(16000);

      const respuesta = await reservarYPagar({ duracionMin: 90 });

      expect(respuesta.status).toBe(201);
      const reserva = await prisma.reserva.findUniqueOrThrow({
        where: { id: idDe(respuesta) },
      });
      expect(reserva.fin.getTime() - reserva.inicio.getTime()).toBe(
        90 * 60 * 1000,
      );
      expect(await pagado(idDe(respuesta))).toBe(16000);
    });

    it('la que empieza en valle y termina en pico se cobra entera a valle', async () => {
      await prisma.franjaHoraria.deleteMany({ where: { canchaId } });
      await prisma.franjaHoraria.createMany({
        data: [
          {
            canchaId,
            horaDesde: '08:00',
            horaHasta: '18:00',
            montoClp: 12000,
            montoClp90: 16000,
            vigenteDesde: new Date('2026-01-01'),
          },
          {
            canchaId,
            horaDesde: '18:00',
            horaHasta: '22:00',
            esPico: true,
            montoClp: 20000,
            montoClp90: 27000,
            vigenteDesde: new Date('2026-01-01'),
          },
        ],
      });

      // 17:30 a 19:00 del club: empieza en valle y termina en pico.
      const respuesta = await reservarYPagar({
        inicio: '2037-08-17T21:30:00.000Z',
        duracionMin: 90,
      });

      expect(respuesta.status).toBe(201);
      expect(await pagado(idDe(respuesta))).toBe(16000);
      const reserva = await prisma.reserva.findUniqueOrThrow({
        where: { id: idDe(respuesta) },
      });
      expect(reserva.esPico).toBe(false);
    });

    it('**donde la franja no tiene ese precio se rechaza, aunque se pida a mano**', async () => {
      // La grilla no la ofrece, pero la API no confía en la grilla.
      const respuesta = await reservarYPagar({ duracionMin: 90 });

      expect(respuesta.status).toBe(409);
      expect(respuesta.body).toMatchObject({
        motivo: 'SIN_TARIFA',
        message: 'Esa duración no se vende en ese horario.',
      });
      expect(await prisma.reserva.count({ where: { canchaId } })).toBe(0);
    });

    it('una duración que no es 60 ni 90 responde 400', async () => {
      for (const duracionMin of [45, 120, '90abc', [90], true]) {
        const respuesta = await reservarYPagar({ duracionMin });
        expect([duracionMin, respuesta.status]).toEqual([duracionMin, 400]);
      }
    });

    it('sin duración, la reserva es de 1 hora, como siempre', async () => {
      const respuesta = await reservarYPagar();
      const reserva = await prisma.reserva.findUniqueOrThrow({
        where: { id: idDe(respuesta) },
      });

      expect(reserva.fin.getTime() - reserva.inicio.getTime()).toBe(
        60 * 60 * 1000,
      );
    });
  });

  it('pago autorizado: la reserva queda confirmada y se ve el folio', async () => {
    const inicio = await reservarYPagar();
    const token = await tokenDe(inicio.body.reservaId);

    const retorno = await volverDeWebpay(token);

    // Webpay vuelve por GET y el navegador viene con el usuario: se redirige a la
    // SPA con el folio, no se responde un JSON que nadie va a ver (T17).
    expect(retorno.status).toBe(302);
    expect(retorno.headers.location).toContain(inicio.body.folio);

    expect(
      await prisma.reserva.findUniqueOrThrow({
        where: { id: inicio.body.reservaId },
      }),
    ).toMatchObject({ estado: EstadoReserva.CONFIRMADA });
  });

  it('confirmar el pago avisa al panel del admin (T26)', async () => {
    // **El evento de la demo**: la reserva del visitante aparece sola en el panel. La
    // confirmación es un `updateMany` dentro de la transacción del pago y no pasa por
    // el repositorio, así que sin un aviso propio el panel se queda mostrando
    // "esperando el pago" hasta que alguien recargue.
    const inicio = await reservarYPagar();
    const { reservaId } = inicio.body as { reservaId: number };
    const token = await tokenDe(reservaId);

    const avisos: string[] = [];
    const suscripcion = app
      .get(EventosDeReserva)
      .flujo.subscribe((cambio) => avisos.push(cambio.fecha));

    await volverDeWebpay(token);
    suscripcion.unsubscribe();

    expect(avisos).toContain(LUNES);
  });

  it('volver dos veces del pago no crea dos reservas ni cobra dos veces', async () => {
    const inicio = await reservarYPagar();
    const token = await tokenDe(inicio.body.reservaId);

    await volverDeWebpay(token);
    const segunda = await volverDeWebpay(token);

    // La idempotencia de T18 sostiene la recarga de la página de retorno.
    expect(segunda.status).toBe(302);
    expect(pasarela.confirmaciones).toHaveLength(1);
    expect(await prisma.reserva.count({ where: { canchaId } })).toBe(1);
  });

  /** T108. La confirmación sale al confirmarse el pago, y una sola vez. */
  describe('el correo de confirmación (T108)', () => {
    it('**una reserva pagada genera una confirmación, con el enlace de la reserva**', async () => {
      const inicio = await reservarYPagar({
        acompanantes: [{ nombre: 'Beto Rival' }],
      });
      await volverDeWebpay(await tokenDe(inicio.body.reservaId));

      const reserva = await prisma.reserva.findUniqueOrThrow({
        where: { id: inicio.body.reservaId },
      });
      expect(enviados).toHaveLength(1);
      expect(enviados[0].para).toBe('camila@ejemplo.cl');
      expect(enviados[0].cuerpo).toContain(reserva.folio);
      expect(enviados[0].cuerpo).toContain(`/r/${reserva.token}`);
      expect(enviados[0].cuerpo).toContain('Juegas con: Beto Rival');
    });

    it('**el aviso de pago repetido no manda un segundo correo**', async () => {
      // Webpay puede repetir el retorno, y la persona puede recargar la página: el correo
      // sale solo si el `updateMany` de PENDIENTE_PAGO a CONFIRMADA cambió una fila.
      const inicio = await reservarYPagar();
      const token = await tokenDe(inicio.body.reservaId);

      await volverDeWebpay(token);
      await volverDeWebpay(token);

      expect(enviados).toHaveLength(1);
    });

    it('iniciar el pago no manda nada: la reserva todavía no está confirmada', async () => {
      await reservarYPagar();

      expect(enviados).toHaveLength(0);
    });

    it('un pago rechazado no manda confirmación', async () => {
      pasarela.respuesta = 'RECHAZADA';
      const inicio = await reservarYPagar();
      await volverDeWebpay(await tokenDe(inicio.body.reservaId));

      expect(enviados).toHaveLength(0);
    });

    it('**si el correo falla, la reserva queda confirmada y el log dice el folio**', async () => {
      falla = new Error('sendmail no responde');
      const errores = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const inicio = await reservarYPagar();

      const vuelta = await volverDeWebpay(await tokenDe(inicio.body.reservaId));

      const reserva = await prisma.reserva.findUniqueOrThrow({
        where: { id: inicio.body.reservaId },
      });
      expect(vuelta.status).toBe(302);
      expect(reserva.estado).toBe(EstadoReserva.CONFIRMADA);
      expect(errores.mock.calls.flat().join(' ')).toContain(reserva.folio);
      errores.mockRestore();
    });
  });

  it('pago rechazado: el bloque vuelve a estar disponible', async () => {
    pasarela.respuesta = 'RECHAZADA';
    const inicio = await reservarYPagar();
    const token = await tokenDe(inicio.body.reservaId);

    await volverDeWebpay(token);

    expect(
      await prisma.reserva.findUniqueOrThrow({
        where: { id: inicio.body.reservaId },
      }),
    ).toMatchObject({ estado: EstadoReserva.EXPIRADA });
    expect(await bloqueLibre()).toBe(true);
  });

  it('quien anula en Webpay vuelve sin token y el bloque se libera', async () => {
    // Webpay manda `TBK_TOKEN` cuando la persona aprieta "anular compra", y como
    // orden de compra devuelve **la referencia de la transacción**, que es lo que
    // viajó como `buyOrder` — no el folio de la reserva, que Webpay nunca vio.
    const inicio = await reservarYPagar();
    const { referencia } = await prisma.transaccion.findFirstOrThrow({
      where: { concepto: 'RESERVA', conceptoId: inicio.body.reservaId },
      select: { referencia: true },
    });

    const retorno = await request(app.getHttpServer()).get(
      `/api/reservas/retorno?TBK_TOKEN=abc&TBK_ORDEN_COMPRA=${referencia}`,
    );

    expect(retorno.status).toBe(302);
    expect(
      await prisma.reserva.findUniqueOrThrow({
        where: { id: inicio.body.reservaId },
      }),
    ).toMatchObject({ estado: EstadoReserva.EXPIRADA });
  });

  it('si la pasarela no acepta la orden, no queda una reserva fantasma', async () => {
    pasarela.fallarAlIniciar = true;

    const respuesta = await reservarYPagar();

    expect(respuesta.status).toBeGreaterThanOrEqual(400);
    // El bloque tiene que volver a la grilla enseguida: esperar los 15 minutos del
    // barrido por una pasarela que ni siquiera aceptó la orden es una hora perdida.
    expect(await bloqueLibre()).toBe(true);
  });

  it('un bloque en mantención no se puede reservar ni pagar', async () => {
    await prisma.bloqueo.create({
      data: {
        canchaId,
        inicio: new Date(A_LAS_10),
        fin: new Date('2037-08-17T15:00:00.000Z'),
        motivo: 'MANTENCION',
      },
    });

    expect((await reservarYPagar()).status).toBe(409);
  });

  it('una hora que ya empezó no se vende ni se cobra', async () => {
    // La grilla ofrecía las horas de la mañana a media tarde: a las 16:40 se podía
    // pagar la de las 08:00. `ahora` va inyectado para no depender del reloj.
    const ahora = new Date(new Date(A_LAS_10).getTime() + 40 * 60 * 1000);
    const transaccionesAntes = await prisma.transaccion.count();

    await expect(
      app.get(ReservaNoSocioService).iniciar(
        {
          canchaId,
          inicio: new Date(A_LAS_10),
          duracionMin: 60,
          ...datosDelVisitante,
          acompanantes: [],
        },
        'http://localhost/api/reservas/retorno',
        ahora,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        motivo: 'BLOQUE_EN_EL_PASADO',
        message: 'Esa hora ya pasó. Elige una que todavía no haya empezado.',
      },
    });

    expect(await prisma.reserva.count({ where: { canchaId } })).toBe(0);
    expect(await prisma.transaccion.count()).toBe(transaccionesAntes);
  });

  it('rechaza datos de contacto incompletos antes de tocar la pasarela', async () => {
    const respuesta = await reservarYPagar({ email: 'no-es-un-correo' });

    expect(respuesta.status).toBe(400);
    expect(pasarela.ordenes).toHaveLength(0);
  });

  it('un objeto en lugar de un nombre se rechaza, no se guarda como "[object Object]"', async () => {
    // `String({})` da "[object Object]", que no está vacío y pasaba la validación: la
    // reserva quedaba a nombre de eso y el panel del club lo mostraba tal cual. Lo
    // señalaba `no-base-to-string` en el lint, que llevaba tiempo sin mirarse.
    const respuesta = await reservarYPagar({ nombre: { a: 1 } });

    expect(respuesta.status).toBe(400);
    expect(pasarela.ordenes).toHaveLength(0);
    expect(await prisma.reserva.count({ where: { canchaId } })).toBe(0);
  });

  it('un arreglo en el teléfono tampoco pasa', async () => {
    // `String(['+569', '1234'])` da "+569,1234": pasaba entero como teléfono.
    const respuesta = await reservarYPagar({ telefono: ['+569', '1234'] });

    expect(respuesta.status).toBe(400);
  });

  it('un token de retorno desconocido no rompe la página', async () => {
    const retorno = await volverDeWebpay('token-que-no-existe');

    // Redirige con el error a la vista, no un 500: del otro lado hay alguien que
    // acaba de pagar y necesita entender qué pasó.
    expect(retorno.status).toBe(302);
    expect(retorno.headers.location).toMatch(/error/);
  });
});
