import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import {
  ConceptoPago,
  EstadoReserva,
  EstadoSocio,
  EstadoTransaccion,
  Superficie,
} from '../src/generated/prisma/client';
import { UsuarioActual } from '../src/identidad/usuario-actual';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';
import { ModificacionService } from '../src/reservas/modificacion.service';
import { PrismaService as Prisma } from '../src/prisma/prisma.service';

/**
 * T24. Mover y cancelar, con las dos ventanas del club.
 *
 * El caso que no se puede fallar es el último: reagendar y cancelar acto seguido no
 * puede cobrar una devolución que no correspondía. Es plata del club.
 */
describe('Modificación y cancelación de reservas', () => {
  let modulo: TestingModule;
  let modificacion: ModificacionService;
  let pasarela: PasarelaFake;
  let prisma: Prisma;
  let canchaId: number;
  let otraCanchaId: number;

  const NOMBRE_CANCHA = 'Cancha T24';
  // Un lunes lejano, para que las ventanas se midan contra instantes controlados.
  const LUNES_20 = new Date('2026-09-08T00:00:00.000Z');
  const MARTES_20 = new Date('2026-09-09T00:00:00.000Z');

  const admin: UsuarioActual = {
    id: 1,
    nombre: 'Admin',
    apellido: 'Del Club',
    email: 'admin@ejemplo.cl',
    telefono: null,
    esAdmin: true,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
  };

  const horasAntes = (instante: Date, horas: number) =>
    new Date(instante.getTime() - horas * 60 * 60 * 1000);

  /** Una reserva de no-socio ya pagada, con su transacción autorizada. */
  const unaReservaPagada = async (inicio = LUNES_20) => {
    const reserva = await prisma.reserva.create({
      data: {
        folio: `T24${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        canchaId,
        inicio,
        fin: new Date(inicio.getTime() + 60 * 60 * 1000),
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'Visitante',
        email: 'visitante@ejemplo.cl',
        telefono: '+56900000000',
      },
    });

    const inicio_ = await pasarela.iniciar({
      referencia: `T24-${reserva.id}`,
      montoClp: 12000,
      urlRetorno: 'https://club.local/retorno',
    });
    await pasarela.confirmar(inicio_.tokenPasarela);

    await prisma.transaccion.create({
      data: {
        referencia: `T24-${reserva.id}-${Date.now()}`,
        concepto: ConceptoPago.RESERVA,
        conceptoId: reserva.id,
        montoClp: 12000,
        pasarela: 'doble',
        estado: EstadoTransaccion.AUTORIZADA,
        tokenPasarela: inicio_.tokenPasarela,
        // El bloque que se compró: es contra este que se mide el reembolso.
        inicioBloqueOriginal: inicio,
      },
    });

    return reserva;
  };

  /**
   * El segundo pago de una reserva: la diferencia que cobrará T89 al alargarla. Nace con
   * el `inicioBloqueOriginal` de la compra, así que no corre la ventana de reembolso.
   */
  const conLaDiferenciaPagada = async (reserva: {
    id: number;
    inicio: Date;
  }) => {
    const orden = await pasarela.iniciar({
      referencia: `T86-${reserva.id}`,
      montoClp: 4000,
      urlRetorno: 'https://club.local/retorno',
    });
    await pasarela.confirmar(orden.tokenPasarela);

    await prisma.transaccion.create({
      data: {
        referencia: `T86-${reserva.id}-${Date.now()}`,
        concepto: ConceptoPago.RESERVA,
        conceptoId: reserva.id,
        montoClp: 4000,
        pasarela: 'doble',
        estado: EstadoTransaccion.AUTORIZADA,
        tokenPasarela: orden.tokenPasarela,
        inicioBloqueOriginal: reserva.inicio,
      },
    });
  };

  const estadosDeSusPagos = async (reservaId: number) =>
    (
      await prisma.transaccion.findMany({
        where: { concepto: ConceptoPago.RESERVA, conceptoId: reservaId },
        orderBy: { id: 'asc' },
        select: { estado: true },
      })
    ).map(({ estado }) => estado);

  beforeAll(async () => {
    modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .compile();

    await modulo.init();
    modificacion = modulo.get(ModificacionService);
    pasarela = modulo.get(PasarelaPago);
    prisma = modulo.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await modulo.close();
  });

  beforeEach(async () => {
    pasarela.reiniciar();
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });

    const horario = {
      create: [
        { diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' },
        { diaSemana: 2, horaApertura: '08:00', horaCierre: '22:00' },
      ],
    };
    const franja = {
      create: {
        horaDesde: '08:00',
        horaHasta: '22:00',
        montoClp: 12000,
        vigenteDesde: new Date('2026-01-01'),
      },
    };

    const cancha = await prisma.cancha.create({
      data: {
        nombre: NOMBRE_CANCHA,
        superficie: Superficie.ARCILLA,
        horarios: horario,
        franjas: franja,
      },
      select: { id: true },
    });
    const otra = await prisma.cancha.create({
      data: {
        nombre: `${NOMBRE_CANCHA} bis`,
        superficie: Superficie.CEMENTO,
        horarios: horario,
        franjas: franja,
      },
      select: { id: true },
    });

    canchaId = cancha.id;
    otraCanchaId = otra.id;
  });

  describe('modificar', () => {
    it('mover con más de 6 horas por delante funciona', async () => {
      const reserva = await unaReservaPagada();

      const movida = await modificacion.modificar(
        reserva.id,
        { canchaId: otraCanchaId, inicio: MARTES_20 },
        admin,
        horasAntes(LUNES_20, 10),
      );

      expect(movida.canchaId).toBe(otraCanchaId);
      expect(movida.inicio).toEqual(MARTES_20);
    });

    it('**mover una reserva de 1 hora y media la deja de 1 hora y media** (T82)', async () => {
      // Hasta que T87 deje elegir la duración al mover, moverla la conserva. Antes el
      // destino se buscaba en la grilla de 1 hora y la reserva quedaba de 60 minutos
      // sin que nadie lo notara.
      const lunes18 = new Date('2026-09-07T21:00:00.000Z');
      const martes18 = new Date('2026-09-08T21:00:00.000Z');
      const larga = await prisma.reserva.create({
        data: {
          folio: 'T82LARGA',
          canchaId,
          inicio: lunes18,
          fin: new Date(lunes18.getTime() + 90 * 60 * 1000),
          estado: EstadoReserva.CONFIRMADA,
          nombre: 'Socio',
          email: 'socio@ejemplo.cl',
          telefono: '',
        },
      });

      const movida = await modificacion.modificar(
        larga.id,
        { canchaId, inicio: martes18 },
        admin,
        horasAntes(lunes18, 30),
      );

      expect(movida.inicio).toEqual(martes18);
      expect(movida.fin.getTime() - movida.inicio.getTime()).toBe(
        90 * 60 * 1000,
      );
    });

    it('a menos de 6 horas del inicio, no', async () => {
      const reserva = await unaReservaPagada();

      await expect(
        modificacion.modificar(
          reserva.id,
          { canchaId: otraCanchaId, inicio: MARTES_20 },
          admin,
          horasAntes(LUNES_20, 5),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('el bloque viejo vuelve a la grilla y el nuevo queda tomado', async () => {
      const reserva = await unaReservaPagada();

      await modificacion.modificar(
        reserva.id,
        { canchaId: otraCanchaId, inicio: MARTES_20 },
        admin,
        horasAntes(LUNES_20, 10),
      );

      // La misma fila cambia de bloque: la hora original queda libre sin dejar una
      // reserva cancelada de por medio.
      const enElBloqueViejo = await prisma.reserva.count({
        where: { canchaId, inicio: LUNES_20, estado: EstadoReserva.CONFIRMADA },
      });

      expect(enElBloqueViejo).toBe(0);
    });

    it('no se puede mover a una hora que ya pasó', async () => {
      // Sin este guardia el socio tiene una cancelación encubierta: mueve la reserva
      // de mañana a ayer, el bloque de mañana vuelve a la grilla, el cupo de ese día
      // queda libre otra vez —`contarDelDia` cuenta por la fecha del bloque— y la
      // reserva desaparece de `mias()`, que solo lista las futuras. El catálogo no
      // filtra horas pasadas: calcula los bloques del día que se le pida.
      const reserva = await unaReservaPagada();
      // Las 11:00 del club, moviendo a las 09:00 del mismo día. La reserva empieza a
      // las 21:00, así que la ventana de las 6 horas está holgada: lo único que
      // decide acá es que el destino ya pasó.
      const ahora = horasAntes(LUNES_20, 10);
      const yaPaso = new Date('2026-09-07T12:00:00.000Z');

      await expect(
        modificacion.modificar(
          reserva.id,
          { canchaId, inicio: yaPaso },
          admin,
          ahora,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          motivo: 'BLOQUE_EN_EL_PASADO',
          message: 'Esa hora ya pasó. Elige una que todavía no haya empezado.',
        },
      });

      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } }),
      ).toMatchObject({ inicio: LUNES_20 });
    });

    it('no se puede mover a una hora que otro ya tomó', async () => {
      const reserva = await unaReservaPagada();
      await prisma.reserva.create({
        data: {
          folio: 'T24OCUP',
          canchaId: otraCanchaId,
          inicio: MARTES_20,
          fin: new Date(MARTES_20.getTime() + 60 * 60 * 1000),
          estado: EstadoReserva.CONFIRMADA,
          nombre: 'Otro',
          email: 'otro@ejemplo.cl',
          telefono: '+56900000000',
        },
      });

      await expect(
        modificacion.modificar(
          reserva.id,
          { canchaId: otraCanchaId, inicio: MARTES_20 },
          admin,
          horasAntes(LUNES_20, 10),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('una reserva pagada no cambia de tarifa al moverse', () => {
    /** Una cancha cuya hora de las 21:00 vale $20.000, no $12.000. */
    const unaCanchaCara = async () => {
      const cara = await prisma.cancha.create({
        data: {
          nombre: `${NOMBRE_CANCHA} cara`,
          superficie: Superficie.CEMENTO,
          horarios: {
            create: [
              { diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' },
              { diaSemana: 2, horaApertura: '08:00', horaCierre: '22:00' },
            ],
          },
          franjas: {
            create: {
              horaDesde: '08:00',
              horaHasta: '22:00',
              montoClp: 20000,
              esPico: true,
              vigenteDesde: new Date('2026-01-01'),
            },
          },
        },
        select: { id: true },
      });

      return cara.id;
    };

    it('mover a un bloque más caro se rechaza en vez de regalar la diferencia', async () => {
      // Pagó $12.000 por una hora valle. Movida a una de $20.000, el club entrega una
      // hora que vende más cara sin cobrar nada, y si después se cancela dentro de
      // plazo devuelve $12.000 por algo que valía $20.000.
      const reserva = await unaReservaPagada();
      const cara = await unaCanchaCara();

      await expect(
        modificacion.modificar(
          reserva.id,
          { canchaId: cara, inicio: MARTES_20 },
          admin,
          horasAntes(LUNES_20, 30),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('el rechazo dice los dos montos y qué hacer', async () => {
      const reserva = await unaReservaPagada();
      const cara = await unaCanchaCara();

      await expect(
        modificacion.modificar(
          reserva.id,
          { canchaId: cara, inicio: MARTES_20 },
          admin,
          horasAntes(LUNES_20, 30),
        ),
      ).rejects.toMatchObject({
        response: {
          motivo: 'CAMBIA_LA_TARIFA',
          message: expect.stringContaining('20.000'),
        },
      });
    });

    it('la reserva del socio se mueve igual: no pagó nada que cuadrar', async () => {
      // El socio no compra la hora, la descuenta de su cupo. Aplicarle esta regla le
      // impediría mover su hora a un horario pico sin razón alguna.
      const cara = await unaCanchaCara();
      const suya = await prisma.reserva.create({
        data: {
          folio: 'T24SOC2',
          canchaId,
          inicio: LUNES_20,
          fin: new Date(LUNES_20.getTime() + 60 * 60 * 1000),
          estado: EstadoReserva.CONFIRMADA,
          nombre: 'Socio',
          email: 'socio@ejemplo.cl',
          telefono: '',
        },
      });

      const movida = await modificacion.modificar(
        suya.id,
        { canchaId: cara, inicio: MARTES_20 },
        admin,
        horasAntes(LUNES_20, 30),
      );

      expect(movida.canchaId).toBe(cara);
    });
  });

  describe('los cupos del socio se reevalúan al mover', () => {
    // Sin esto, mover es la puerta de atrás de todas las reglas: se reserva una hora
    // que pasa los cupos y después se la lleva a donde no habría pasado.
    let socioId: number;

    const unSocio = async (
      sufijo: string,
      parche: { alDiaHasta?: Date } = {},
    ) => {
      const usuario = await prisma.usuario.create({
        data: {
          email: `socio-${sufijo}@t24mover.cl`,
          nombre: `Socio ${sufijo}`,
          apellido: 'De prueba',
          emailVerificado: true,
          socio: {
            create: {
              numeroSocio: `T24M-${sufijo}-${Date.now()}`,
              estado: EstadoSocio.ACTIVO,
              fechaIngreso: new Date('2026-01-01'),
              alDiaHasta: parche.alDiaHasta ?? new Date('2027-01-01'),
            },
          },
        },
        select: { socio: { select: { id: true } } },
      });

      return usuario.socio!.id;
    };

    /** Una reserva del socio en ese bloque, como la que crea `reservarComoSocio`. */
    const suReserva = async (inicio: Date, canchaDe = canchaId) =>
      prisma.reserva.create({
        data: {
          folio: `S${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          canchaId: canchaDe,
          inicio,
          fin: new Date(inicio.getTime() + 60 * 60 * 1000),
          estado: EstadoReserva.CONFIRMADA,
          socioId,
          nombre: 'Socio',
          email: 'socio@ejemplo.cl',
          telefono: '',
          acompanantes: { create: { nombre: 'Ana Invitada' } },
        },
      });

    beforeEach(async () => {
      await prisma.usuario.deleteMany({
        where: { email: { endsWith: '@t24mover.cl' } },
      });
      socioId = await unSocio('titular');
    });

    afterAll(async () => {
      await prisma.usuario.deleteMany({
        where: { email: { endsWith: '@t24mover.cl' } },
      });
    });

    it('no se puede mover a un día en el que ya tiene su hora', async () => {
      // El cupo diario es 1. Con dos reservas —lunes y martes— mover la del lunes al
      // martes lo dejaría con dos horas ese día, que es justo lo que el cupo impide.
      const delLunes = await suReserva(LUNES_20);
      await suReserva(MARTES_20);

      await expect(
        modificacion.modificar(
          delLunes.id,
          { canchaId: otraCanchaId, inicio: MARTES_20 },
          admin,
          horasAntes(LUNES_20, 30),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('el socio que quedó moroso después de reservar tampoco mueve su hora', async () => {
      // "Las que ya tenía se mantienen" (SPEC.md) es sobre conservarlas, no sobre
      // seguir usándolas como si estuviera al día.
      socioId = await unSocio('moroso', { alDiaHasta: new Date('2026-07-31') });
      const suya = await suReserva(LUNES_20);

      await expect(
        modificacion.modificar(
          suya.id,
          { canchaId: otraCanchaId, inicio: MARTES_20 },
          admin,
          horasAntes(LUNES_20, 30),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('dos movimientos simultáneos no lo dejan con dos horas el mismo día', async () => {
      // La misma carrera que se cerró al reservar, por el otro camino: dos peticiones
      // suyas evalúan a la vez, cada una se excluye a sí misma, las dos cuentan cero
      // reservas el martes y las dos pasan. El índice único no lo atrapa porque son
      // bloques distintos.
      const otroBloqueDelLunes = new Date(LUNES_20.getTime() - 60 * 60 * 1000);
      const otroBloqueDelMartes = new Date(
        MARTES_20.getTime() - 60 * 60 * 1000,
      );
      const primera = await suReserva(LUNES_20);
      const segunda = await suReserva(otroBloqueDelLunes);

      await Promise.allSettled([
        modificacion.modificar(
          primera.id,
          { canchaId: otraCanchaId, inicio: MARTES_20 },
          admin,
          horasAntes(otroBloqueDelLunes, 30),
        ),
        modificacion.modificar(
          segunda.id,
          { canchaId: otraCanchaId, inicio: otroBloqueDelMartes },
          admin,
          horasAntes(otroBloqueDelLunes, 30),
        ),
      ]);

      const elMartes = await prisma.reserva.count({
        where: {
          socioId,
          estado: EstadoReserva.CONFIRMADA,
          inicio: { gte: otroBloqueDelMartes, lte: MARTES_20 },
        },
      });

      expect(elMartes).toBe(1);
    });

    it('la reserva sin acompañantes anotados se mueve igual', async () => {
      // Declarar con quién se juega es una regla de reservar, no de mover: los
      // acompañantes no cambian al cambiar la hora. Aplicarla acá dejaría inmóvil a
      // toda reserva que el club anotó a mano, que es la que más suele necesitarlo.
      const suya = await prisma.reserva.create({
        data: {
          folio: 'T24SINAC',
          canchaId,
          inicio: LUNES_20,
          fin: new Date(LUNES_20.getTime() + 60 * 60 * 1000),
          estado: EstadoReserva.CONFIRMADA,
          socioId,
          nombre: 'Socio',
          email: 'socio@ejemplo.cl',
          telefono: '',
        },
      });

      const movida = await modificacion.modificar(
        suya.id,
        { canchaId: otraCanchaId, inicio: MARTES_20 },
        admin,
        horasAntes(LUNES_20, 30),
      );

      expect(movida.inicio).toEqual(MARTES_20);
    });

    describe('cambiar la duración (T87)', () => {
      // A las 18:00 del club y no a las 21:00 de `LUNES_20`: con 90 minutos, esa se
      // pasaría del cierre de las 22:00.
      const LUNES_18 = new Date(LUNES_20.getTime() - 3 * 60 * 60 * 1000);
      const NOVENTA = 90 * 60 * 1000;

      it('**el socio alarga su reserva de 1 hora a 1 hora y media, en la misma cancha y hora**', async () => {
        const suya = await suReserva(LUNES_18);

        const alargada = await modificacion.modificar(
          suya.id,
          { canchaId, inicio: LUNES_18, duracionMin: 90 },
          admin,
          horasAntes(LUNES_18, 30),
        );

        // La misma reserva, con su folio, y el fin corrido 30 minutos.
        expect(alargada).toMatchObject({
          id: suya.id,
          folio: suya.folio,
          inicio: LUNES_18,
        });
        expect(alargada.fin.getTime() - alargada.inicio.getTime()).toBe(
          NOVENTA,
        );
      });

      it('y la acorta de vuelta a 1 hora', async () => {
        const suya = await prisma.reserva.update({
          where: { id: (await suReserva(LUNES_18)).id },
          data: { fin: new Date(LUNES_18.getTime() + NOVENTA) },
        });

        const acortada = await modificacion.modificar(
          suya.id,
          { canchaId, inicio: LUNES_18, duracionMin: 60 },
          admin,
          horasAntes(LUNES_18, 30),
        );

        expect(acortada.fin.getTime() - acortada.inicio.getTime()).toBe(
          60 * 60 * 1000,
        );
      });

      it('**alargarla sobre una hora tomada responde BLOQUE_TOMADO, no un error crudo**', async () => {
        const suya = await suReserva(LUNES_18);
        // La de las 19:00, de otra persona: los 30 minutos que se agregan caen encima.
        await prisma.reserva.create({
          data: {
            folio: 'T87OTRA',
            canchaId,
            inicio: new Date(LUNES_18.getTime() + 60 * 60 * 1000),
            fin: new Date(LUNES_18.getTime() + 2 * 60 * 60 * 1000),
            estado: EstadoReserva.CONFIRMADA,
            nombre: 'Otra persona',
            email: 'otra@ejemplo.cl',
            telefono: '',
          },
        });

        await expect(
          modificacion.modificar(
            suya.id,
            { canchaId, inicio: LUNES_18, duracionMin: 90 },
            admin,
            horasAntes(LUNES_18, 30),
          ),
        ).rejects.toMatchObject({
          status: 409,
          response: { motivo: 'BLOQUE_TOMADO' },
        });
      });

      it('**pasarla a una hora pico se rechaza si ya tiene su cupo pico lleno**', async () => {
        const pico = await prisma.cancha.create({
          data: {
            nombre: `${NOMBRE_CANCHA} pico`,
            superficie: Superficie.CEMENTO,
            horarios: {
              create: [
                { diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' },
              ],
            },
            franjas: {
              create: {
                horaDesde: '08:00',
                horaHasta: '22:00',
                montoClp: 20000,
                montoClp90: 27000,
                esPico: true,
                vigenteDesde: new Date('2026-01-01'),
              },
            },
          },
          select: { id: true },
        });
        const suya = await suReserva(LUNES_18);
        // Sus dos pico de la semana, martes y miércoles: el cupo es de 2.
        for (const dias of [1, 2]) {
          const inicio = new Date(
            LUNES_18.getTime() + dias * 24 * 60 * 60 * 1000,
          );
          await prisma.reserva.create({
            data: {
              folio: `T87P${dias}`,
              canchaId,
              inicio,
              fin: new Date(inicio.getTime() + 60 * 60 * 1000),
              esPico: true,
              estado: EstadoReserva.CONFIRMADA,
              socioId,
              nombre: 'Socio',
              email: 'socio@ejemplo.cl',
              telefono: '',
            },
          });
        }

        await expect(
          modificacion.modificar(
            suya.id,
            { canchaId: pico.id, inicio: LUNES_18, duracionMin: 90 },
            admin,
            horasAntes(LUNES_18, 30),
          ),
        ).rejects.toMatchObject({
          status: 409,
          response: { motivo: 'CUPO_PICO' },
        });
      });

      it('sin duración en el pedido, la conserva', async () => {
        const suya = await prisma.reserva.update({
          where: { id: (await suReserva(LUNES_18)).id },
          data: { fin: new Date(LUNES_18.getTime() + NOVENTA) },
        });

        const movida = await modificacion.modificar(
          suya.id,
          { canchaId: otraCanchaId, inicio: LUNES_18 },
          admin,
          horasAntes(LUNES_18, 30),
        );

        expect(movida.fin.getTime() - movida.inicio.getTime()).toBe(NOVENTA);
      });
    });

    it('mover dentro del mismo día sigue siendo posible', async () => {
      // La reserva no puede contarse a sí misma: si lo hiciera, el cupo diario de 1
      // haría imposible cambiar la hora dentro del mismo día, que es lo más común.
      const suya = await suReserva(LUNES_20);
      const dosHorasAntes = new Date(LUNES_20.getTime() - 2 * 60 * 60 * 1000);

      const movida = await modificacion.modificar(
        suya.id,
        { canchaId: otraCanchaId, inicio: dosHorasAntes },
        admin,
        horasAntes(LUNES_20, 30),
      );

      expect(movida.inicio).toEqual(dosHorasAntes);
    });

    it('cambiarse de cancha a la misma hora no se lee como estar en dos canchas', async () => {
      // La regla mira si el socio está comprometido en otra cancha a esa hora, y la
      // reserva que se está moviendo lo está: sin excluirla, se rechaza a sí misma.
      const suya = await suReserva(LUNES_20);

      const movida = await modificacion.modificar(
        suya.id,
        { canchaId: otraCanchaId, inicio: LUNES_20 },
        admin,
        horasAntes(LUNES_20, 30),
      );

      expect(movida.canchaId).toBe(otraCanchaId);
    });
  });

  describe('cancelar', () => {
    it('con 24 horas o más se devuelve el 100%', async () => {
      const reserva = await unaReservaPagada();

      const resultado = await modificacion.cancelar(
        reserva.id,
        admin,
        horasAntes(LUNES_20, 30),
      );

      expect(resultado.huboDevolucion).toBe(true);
      // Una sola anulación, por el total: el club devuelve el 100% o nada
      // (`SPEC-pagos.md` § Reembolso).
      expect(pasarela.anulaciones).toHaveLength(1);
      expect(pasarela.anulaciones[0].montoClp).toBe(12000);
      expect(pasarela.anulaciones[0].tokenPasarela).toBeTruthy();
    });

    it('con menos de 24 horas no hay devolución, y se explica por qué', async () => {
      const reserva = await unaReservaPagada();

      const resultado = await modificacion.cancelar(
        reserva.id,
        admin,
        horasAntes(LUNES_20, 12),
      );

      expect(resultado.huboDevolucion).toBe(false);
      expect(resultado.motivo).toContain('24 horas');
      expect(pasarela.anulaciones).toHaveLength(0);
    });

    it('la reserva queda cancelada y el bloque libre en los dos casos', async () => {
      const reserva = await unaReservaPagada();

      await modificacion.cancelar(reserva.id, admin, horasAntes(LUNES_20, 12));

      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } }),
      ).toMatchObject({ estado: EstadoReserva.CANCELADA });
    });

    it('si la devolución falla, la reserva no queda cancelada', async () => {
      // Lo contrario deja a la persona sin cancha y sin plata: la reserva quedaría
      // CANCELADA, el reintento respondería "ya estaba cancelada" y la devolución no
      // ocurriría nunca. Es el mismo criterio que T19 fijó para anular: primero la
      // plata, después el estado.
      const reserva = await unaReservaPagada();
      pasarela.fallarAlAnular = true;

      await expect(
        modificacion.cancelar(reserva.id, admin, horasAntes(LUNES_20, 30)),
      ).rejects.toBeDefined();

      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } }),
      ).toMatchObject({ estado: EstadoReserva.CONFIRMADA });
    });

    it('no se cancela una reserva con el pago todavía en curso', async () => {
      // El caso que costaría plata de otro: el visitante está tecleando su tarjeta en
      // Webpay y el admin cancela la reserva desde el panel. Al volver, el pago se
      // autoriza igual, el `updateMany` de la confirmación no encuentra ninguna fila
      // PENDIENTE_PAGO que actualizar, y la pantalla le muestra "Reserva confirmada"
      // por una hora que ya no tiene. Queda cobrado y creyendo que jugó.
      //
      // No hace falta resolverlo a mano: si el pago no se completa, el barrido de T19
      // expira la transacción y con ella la reserva, y la hora vuelve a la grilla.
      const reserva = await prisma.reserva.create({
        data: {
          folio: 'T24PEND',
          canchaId,
          inicio: LUNES_20,
          fin: new Date(LUNES_20.getTime() + 60 * 60 * 1000),
          estado: EstadoReserva.PENDIENTE_PAGO,
          nombre: 'Visitante',
          email: 'visitante@ejemplo.cl',
          telefono: '+56900000000',
        },
      });
      await prisma.transaccion.create({
        data: {
          referencia: `T24-pend-${reserva.id}`,
          concepto: ConceptoPago.RESERVA,
          conceptoId: reserva.id,
          montoClp: 12000,
          pasarela: 'doble',
          estado: EstadoTransaccion.PENDIENTE,
          inicioBloqueOriginal: LUNES_20,
        },
      });

      await expect(
        modificacion.cancelar(reserva.id, admin, horasAntes(LUNES_20, 30)),
      ).rejects.toMatchObject({ status: 409 });

      // La hora sigue tomada: soltarla acá es lo que dejaría el cobro sin cancha.
      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } }),
      ).toMatchObject({ estado: EstadoReserva.PENDIENTE_PAGO });
    });

    describe('con la diferencia pagada: dos pagos (T86)', () => {
      it('**con 24 horas o más anula los dos: devolver es todo lo pagado**', async () => {
        const reserva = await unaReservaPagada();
        await conLaDiferenciaPagada(reserva);

        const resultado = await modificacion.cancelar(
          reserva.id,
          admin,
          horasAntes(LUNES_20, 30),
        );

        expect(resultado.huboDevolucion).toBe(true);
        expect(pasarela.anulaciones.map(({ montoClp }) => montoClp)).toEqual([
          12000, 4000,
        ]);
        expect(await estadosDeSusPagos(reserva.id)).toEqual([
          EstadoTransaccion.ANULADA,
          EstadoTransaccion.ANULADA,
        ]);
      });

      it('con menos de 24 horas no anula ninguno', async () => {
        const reserva = await unaReservaPagada();
        await conLaDiferenciaPagada(reserva);

        const resultado = await modificacion.cancelar(
          reserva.id,
          admin,
          horasAntes(LUNES_20, 12),
        );

        expect(resultado.huboDevolucion).toBe(false);
        expect(pasarela.anulaciones).toHaveLength(0);
      });

      it('**si falla la segunda devolución, no se cancela a medias; el reintento devuelve la que faltaba**', async () => {
        const reserva = await unaReservaPagada();
        await conLaDiferenciaPagada(reserva);
        pasarela.fallarEnLaAnulacionNumero = 2;

        await expect(
          modificacion.cancelar(reserva.id, admin, horasAntes(LUNES_20, 30)),
        ).rejects.toBeDefined();

        // La persona sigue con su cancha; la primera devolución ya salió.
        expect(
          await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } }),
        ).toMatchObject({ estado: EstadoReserva.CONFIRMADA });

        pasarela.fallarEnLaAnulacionNumero = null;
        const reintento = await modificacion.cancelar(
          reserva.id,
          admin,
          horasAntes(LUNES_20, 29),
        );

        // Ni dos veces la primera ni la segunda olvidada.
        expect(reintento.huboDevolucion).toBe(true);
        expect(pasarela.anulaciones.map(({ montoClp }) => montoClp)).toEqual([
          12000, 4000,
        ]);
        expect(await estadosDeSusPagos(reserva.id)).toEqual([
          EstadoTransaccion.ANULADA,
          EstadoTransaccion.ANULADA,
        ]);
      });
    });

    it('**no se mueve una reserva con el pago todavía en curso** (T87)', async () => {
      // Lo mismo que cancelar: el visitante está en Webpay y la hora cambia bajo sus pies.
      const reserva = await prisma.reserva.create({
        data: {
          folio: 'T87PEND',
          canchaId,
          inicio: LUNES_20,
          fin: new Date(LUNES_20.getTime() + 60 * 60 * 1000),
          estado: EstadoReserva.PENDIENTE_PAGO,
          nombre: 'Visitante',
          email: 'visitante@ejemplo.cl',
          telefono: '+56900000000',
        },
      });
      await prisma.transaccion.create({
        data: {
          referencia: `T87-pend-${reserva.id}`,
          concepto: ConceptoPago.RESERVA,
          conceptoId: reserva.id,
          montoClp: 12000,
          pasarela: 'doble',
          estado: EstadoTransaccion.PENDIENTE,
          inicioBloqueOriginal: LUNES_20,
        },
      });

      await expect(
        modificacion.modificar(
          reserva.id,
          { canchaId: otraCanchaId, inicio: MARTES_20 },
          admin,
          horasAntes(LUNES_20, 30),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { motivo: 'PAGO_EN_CURSO' },
      });
    });

    it('cancelar dos veces no devuelve dos veces', async () => {
      const reserva = await unaReservaPagada();

      await modificacion.cancelar(reserva.id, admin, horasAntes(LUNES_20, 30));

      await expect(
        modificacion.cancelar(reserva.id, admin, horasAntes(LUNES_20, 30)),
      ).rejects.toBeDefined();
      expect(pasarela.anulaciones).toHaveLength(1);
    });
  });

  it('**reagendar no reinicia la ventana de reembolso**', async () => {
    // **Test obligatorio** (`SPEC-pagos.md` § Success Criteria 10 y el riesgo del
    // plan). Reserva del lunes a las 20:00, faltan 12 horas. Se mueve al martes
    // —se puede, faltan más de 6— y se cancela acto seguido. Contra el bloque nuevo
    // sobrarían 24 horas; contra el que se compró, faltaban 12.
    const reserva = await unaReservaPagada(LUNES_20);
    const ahora = horasAntes(LUNES_20, 12);

    await modificacion.modificar(
      reserva.id,
      { canchaId: otraCanchaId, inicio: MARTES_20 },
      admin,
      ahora,
    );

    const resultado = await modificacion.cancelar(reserva.id, admin, ahora);

    expect(resultado.huboDevolucion).toBe(false);
    expect(pasarela.anulaciones).toHaveLength(0);
  });

  it('cancelar una reserva de socio no devuelve plata: le devuelve el cupo', async () => {
    const reserva = await prisma.reserva.create({
      data: {
        folio: 'T24SOCIO',
        canchaId,
        inicio: LUNES_20,
        fin: new Date(LUNES_20.getTime() + 60 * 60 * 1000),
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'Socio',
        email: 'socio@ejemplo.cl',
        telefono: '+56900000000',
      },
    });

    const resultado = await modificacion.cancelar(
      reserva.id,
      admin,
      horasAntes(LUNES_20, 48),
    );

    expect(resultado.huboDevolucion).toBe(false);
    expect(resultado.motivo).toBe('sin_pago');
  });

  describe('la grilla para mover (T87)', () => {
    // El lunes de `LUNES_20` en el club, y a las 18:00: con 90 minutos, la de las 21:00
    // se pasaría del cierre.
    const FECHA = '2026-09-07';
    const LUNES_18 = new Date(LUNES_20.getTime() - 3 * 60 * 60 * 1000);
    const enSuCancha = (
      grilla: { cancha: { id: number }; bloques: { inicio: Date }[] }[],
    ) => grilla.find((g) => g.cancha.id === canchaId)!.bloques;

    it('**no cuenta la reserva que se mueve: alargarla en el mismo lugar se ofrece**', async () => {
      // Sin esto la grilla marcaba ocupada la hora y media de las 18:00 por culpa de la
      // misma reserva que se quería alargar, y el caso principal de T87 no se podía elegir.
      const suya = await unaReservaPagada(LUNES_18);

      const grilla = await modificacion.grillaParaMover(
        suya.id,
        admin,
        FECHA,
        90,
      );

      expect(
        enSuCancha(grilla).find(
          (b) => b.inicio.getTime() === LUNES_18.getTime(),
        ),
      ).toMatchObject({ reservado: false });
    });

    it('las demás reservas siguen ocupando', async () => {
      const suya = await unaReservaPagada(LUNES_18);
      // La de las 19:00 es de otra persona: la hora y media de las 18:00 la pisa.
      await unaReservaPagada(new Date(LUNES_18.getTime() + 60 * 60 * 1000));

      const grilla = await modificacion.grillaParaMover(
        suya.id,
        admin,
        FECHA,
        90,
      );

      expect(
        enSuCancha(grilla).find(
          (b) => b.inicio.getTime() === LUNES_18.getTime(),
        ),
      ).toMatchObject({ reservado: true });
    });

    it('la de otro responde 404, como si no existiera', async () => {
      // Si no, cualquiera podría probar números y ver qué hora ocupa cada reserva.
      const ajena = await unaReservaPagada(LUNES_18);

      await expect(
        modificacion.grillaParaMover(
          ajena.id,
          { ...admin, esAdmin: false, socioId: 99999 },
          FECHA,
          90,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  it('una reserva ajena no se puede tocar, y responde como si no existiera', async () => {
    // Decir "existe pero no es tuya" ya cuenta que esa hora está tomada y por quién.
    const reserva = await unaReservaPagada();
    const otroSocio: UsuarioActual = {
      ...admin,
      esAdmin: false,
      socioId: 99999,
    };

    await expect(
      modificacion.cancelar(reserva.id, otroSocio, horasAntes(LUNES_20, 30)),
    ).rejects.toMatchObject({ status: 404 });
  });
});
