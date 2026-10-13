import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import { Clases } from '../src/clases/clases.service';
import {
  ConceptoPago,
  EstadoReserva,
  EstadoSocio,
  EstadoTransaccion,
  MotivoBloqueo,
  NivelClase,
  Superficie,
} from '../src/generated/prisma/client';
import { EnviadorCorreo } from '../src/identidad/correo';
import { UsuarioActual } from '../src/identidad/usuario-actual';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';
import { CierreDeCanchaController } from '../src/reservas/cierre-de-cancha.controller';
import { DisponibilidadPublicaService } from '../src/reservas/disponibilidad-publica.service';
import { TopeDeLuzController } from '../src/reservas/tope-de-luz.controller';
import { ReservaDelAdminService } from '../src/reservas/reserva-del-admin.service';
import { ReservaNoSocioService } from '../src/reservas/reserva-no-socio.service';
import { ModificacionService } from '../src/reservas/modificacion.service';
import { ReservaRepository } from '../src/reservas/reserva.repository';
import { ReservasService } from '../src/reservas/reservas.service';
import { RetornoDeDiferencia } from '../src/reservas/retorno-diferencia.service';
import { TopeDeLuz } from '../src/reservas/tope-de-luz';

/**
 * T203. El tope de canchas con luz en las reservas que nacen (`SPEC-reservas.md` § Tope
 * de canchas con luz, criterios 42–45).
 *
 * La instalación del club se corta con más de dos canchas iluminadas a la vez. El caso
 * que importa es el concurrente: dos personas toman a la vez la última cancha con luz, y
 * el índice por rango no lo ve porque cada cancha tiene su clave.
 */
describe('Tope de canchas con luz: las reservas que nacen', () => {
  let modulo: TestingModule;
  let prisma: PrismaService;
  let reservas: ReservaRepository;
  /** Las cuatro canchas con luz de la prueba, y una sin luz. */
  let luz: number[];
  let sinLuz: number;

  const PREFIJO = 'Cancha T203';
  const DOMINIO = '@t203.ejemplo.cl';
  // Un lunes que ningún otro test usa: el tope mira todas las canchas con luz de la
  // base, también las del seed, así que una reserva ajena a la misma hora contaría.
  const DIA = '2039-06-13';
  const a = (hora: string) => instanteEnElClub(DIA, hora);

  const tomar = (
    canchaId: number,
    desde: string,
    hasta: string,
    estado: EstadoReserva = EstadoReserva.CONFIRMADA,
  ) =>
    reservas.crear({
      canchaId,
      inicio: a(desde),
      fin: a(hasta),
      esPico: false,
      estado,
      nombre: 'Visitante de prueba',
      email: 'visitante@ejemplo.cl',
      telefono: '56900000000',
    });

  const configurarTope = (tope: number | null, desde = '19:00') =>
    prisma.configuracionClub.update({
      where: { id: 1 },
      data: { topeCanchasConLuz: tope, topeCanchasConLuzDesde: desde },
    });

  const crearCancha = async (nombre: string, iluminacion: boolean) => {
    const cancha = await prisma.cancha.create({
      data: {
        nombre,
        superficie: Superficie.CEMENTO,
        iluminacion,
        horarios: {
          create: { diaSemana: 1, horaApertura: '08:00', horaCierre: '23:00' },
        },
        franjas: {
          create: {
            horaDesde: '08:00',
            horaHasta: '23:00',
            montoClp: 12000,
            montoClp90: 16000,
            vigenteDesde: new Date('2026-01-01'),
          },
        },
      },
      select: { id: true },
    });

    return cancha.id;
  };

  /** Un socio al día, listo para reservar, como lo arma el mesón. */
  const socioQueReserva = async (n: number): Promise<UsuarioActual> => {
    const usuario = await prisma.usuario.create({
      data: {
        email: `socio-${n}${DOMINIO}`,
        nombre: `Socio ${n}`,
        apellido: 'De prueba',
        telefono: '56911112222',
        emailVerificado: true,
        socio: {
          create: {
            numeroSocio: `T203-${n}`,
            estado: EstadoSocio.ACTIVO,
            fechaIngreso: new Date('2026-01-01'),
            alDiaHasta: new Date('2040-01-01'),
          },
        },
      },
      select: { id: true, socio: { select: { id: true } } },
    });

    return {
      id: usuario.id,
      nombre: `Socio ${n}`,
      apellido: 'De prueba',
      email: `socio-${n}${DOMINIO}`,
      telefono: '56911112222',
      esAdmin: false,
      socioId: usuario.socio!.id,
      socioActivo: true,
      socioAlDia: true,
      profesorId: null,
    };
  };

  const reservarComoSocio = (
    yo: UsuarioActual,
    canchaId: number,
    hora: string,
  ) =>
    modulo.get(ReservasService).reservarComoSocio(yo, {
      canchaId,
      inicio: a(hora),
      duracionMin: 60,
      acompanantes: [{ nombre: 'Ana Invitada' }],
    });

  /** Lo que la API le responde a quien perdió: el cuerpo del 409. */
  const cuerpoDel = (error: unknown) =>
    (error as ConflictException).getResponse() as {
      motivo: string;
      message: string;
    };

  beforeAll(async () => {
    modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .overrideProvider(EnviadorCorreo)
      .useValue({ enviar: () => Promise.resolve() })
      .compile();
    await modulo.init();

    prisma = modulo.get(PrismaService);
    reservas = modulo.get(ReservaRepository);
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: PREFIJO } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    // Como lo deja la migración, para el archivo que venga después.
    await configurarTope(2, '19:00');
    await modulo.close();
  });

  beforeEach(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: PREFIJO } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await configurarTope(2, '19:00');

    luz = [];
    for (const n of [1, 2, 3, 4]) {
      luz.push(await crearCancha(`${PREFIJO} ${n}`, true));
    }
    sinLuz = await crearCancha(`${PREFIJO} sin luz`, false);
  });

  it('la migración deja el tope en 2 desde las 19:00', async () => {
    // Por el valor por omisión de las columnas y no por la fila, que el beforeEach ya
    // escribió: es lo que recibe la fila de fedal.cl al aplicar la migración.
    const columnas = await prisma.$queryRaw<
      { nombre: string; omision: string }[]
    >`SELECT COLUMN_NAME AS nombre, COLUMN_DEFAULT AS omision
        FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'configuracion_club'
         AND COLUMN_NAME LIKE 'tope_canchas_con_luz%'
       ORDER BY COLUMN_NAME`;

    expect(columnas).toEqual([
      { nombre: 'tope_canchas_con_luz', omision: '2' },
      { nombre: 'tope_canchas_con_luz_desde', omision: "'19:00'" },
    ]);
  });

  describe('qué se rechaza (42, 43)', () => {
    beforeEach(async () => {
      await tomar(luz[0], '20:00', '21:00');
      await tomar(luz[1], '20:00', '21:00');
    });

    it('con dos canchas con luz ocupadas a las 20:00, la tercera se rechaza', async () => {
      await expect(tomar(luz[2], '20:00', '21:00')).rejects.toBeInstanceOf(
        TopeDeLuz,
      );
      expect(await prisma.reserva.count({ where: { canchaId: luz[2] } })).toBe(
        0,
      );
    });

    it('la misma hora en una cancha sin luz se acepta', async () => {
      await expect(tomar(sinLuz, '20:00', '21:00')).resolves.toBeDefined();
    });

    it('una que empieza a las 19:30 y pisa las 20:00 se rechaza', async () => {
      await expect(tomar(luz[2], '19:30', '20:30')).rejects.toBeInstanceOf(
        TopeDeLuz,
      );
    });

    it('una que termina justo cuando las otras empiezan se acepta', async () => {
      await expect(tomar(luz[2], '19:00', '20:00')).resolves.toBeDefined();
    });
  });

  it('antes de la hora del tope no se limita: a las 18:00 caben las cuatro', async () => {
    for (const cancha of luz) {
      await tomar(cancha, '18:00', '19:00');
    }

    expect(
      await prisma.reserva.count({ where: { canchaId: { in: luz } } }),
    ).toBe(4);
  });

  it('una de 18:30 a 20:00 se mide desde las 19:00, y una de 17:30 a 19:00 no se mide (43)', async () => {
    await tomar(luz[0], '19:00', '20:00');
    await tomar(luz[1], '19:00', '20:00');

    await expect(tomar(luz[2], '18:30', '20:00')).rejects.toBeInstanceOf(
      TopeDeLuz,
    );
    await expect(tomar(luz[2], '17:30', '19:00')).resolves.toBeDefined();
  });

  describe('qué ocupa una cancha (44)', () => {
    it('una reserva esperando pago cuenta', async () => {
      await tomar(luz[0], '20:00', '21:00', EstadoReserva.PENDIENTE_PAGO);
      await tomar(luz[1], '20:00', '21:00');

      await expect(tomar(luz[2], '20:00', '21:00')).rejects.toBeInstanceOf(
        TopeDeLuz,
      );
    });

    it('las canceladas y las expiradas no cuentan', async () => {
      await tomar(luz[0], '20:00', '21:00', EstadoReserva.CANCELADA);
      await tomar(luz[1], '20:00', '21:00', EstadoReserva.EXPIRADA);
      await tomar(luz[2], '20:00', '21:00');

      await expect(tomar(luz[3], '20:00', '21:00')).resolves.toBeDefined();
    });

    it.each([MotivoBloqueo.CLASE, MotivoBloqueo.TORNEO])(
      'un bloqueo de %s enciende la cancha',
      async (motivo) => {
        await prisma.bloqueo.create({
          data: {
            canchaId: luz[0],
            inicio: a('20:00'),
            fin: a('21:00'),
            motivo,
          },
        });
        await tomar(luz[1], '20:00', '21:00');

        await expect(tomar(luz[2], '20:00', '21:00')).rejects.toBeInstanceOf(
          TopeDeLuz,
        );
      },
    );

    it.each([MotivoBloqueo.MANTENCION, MotivoBloqueo.OTRO])(
      'un bloqueo de %s no la enciende',
      async (motivo) => {
        await prisma.bloqueo.create({
          data: {
            canchaId: luz[0],
            inicio: a('20:00'),
            fin: a('21:00'),
            motivo,
          },
        });
        await tomar(luz[1], '20:00', '21:00');

        await expect(tomar(luz[2], '20:00', '21:00')).resolves.toBeDefined();
      },
    );
  });

  it('con el tope apagado no se rechaza nada por luz', async () => {
    await configurarTope(null);

    for (const cancha of luz) {
      await tomar(cancha, '20:00', '21:00');
    }

    expect(
      await prisma.reserva.count({ where: { canchaId: { in: luz } } }),
    ).toBe(4);
  });

  it('el tope y su hora se leen de la configuración', async () => {
    await configurarTope(1, '20:00');
    await tomar(luz[0], '19:00', '20:00');
    await tomar(luz[1], '19:00', '20:00');
    await tomar(luz[0], '20:00', '21:00');

    await expect(tomar(luz[1], '20:30', '21:30')).rejects.toBeInstanceOf(
      TopeDeLuz,
    );
  });

  describe('los mensajes', () => {
    beforeEach(async () => {
      await tomar(luz[0], '20:00', '21:00');
      await tomar(luz[1], '20:00', '21:00');
    });

    it('al socio le responde 409 TOPE_DE_LUZ sin nombrar canchas', async () => {
      const socio = await socioQueReserva(1);
      const error: unknown = await reservarComoSocio(
        socio,
        luz[2],
        '20:00',
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(cuerpoDel(error)).toEqual({
        motivo: 'TOPE_DE_LUZ',
        message:
          'A esa hora ya están ocupadas todas las canchas con luz que el club puede encender. Elige otra hora.',
      });
    });

    it('al visitante que paga en línea, lo mismo', async () => {
      const error: unknown = await modulo
        .get(ReservaNoSocioService)
        .iniciar(
          {
            canchaId: luz[2],
            inicio: a('20:00'),
            duracionMin: 60,
            nombre: 'Camila Visitante',
            email: 'camila@ejemplo.cl',
            telefono: '56955556666',
            acompanantes: [{ nombre: 'Beto Rival' }],
          },
          'http://localhost/retorno',
        )
        .catch((e: unknown) => e);

      expect(cuerpoDel(error)).toEqual({
        motivo: 'TOPE_DE_LUZ',
        message:
          'A esa hora ya están ocupadas todas las canchas con luz que el club puede encender. Elige otra hora.',
      });
      // Sin reserva no hay pago que iniciar: nadie va a Webpay por una hora imposible.
      expect(await prisma.reserva.count({ where: { canchaId: luz[2] } })).toBe(
        0,
      );
    });

    it('al mesón le nombra las canchas, la hora y el tope', async () => {
      const error: unknown = await modulo
        .get(ReservaDelAdminService)
        .crear({
          canchaId: luz[2],
          inicio: a('20:00'),
          duracionMin: 60,
          nombre: 'Llegó al mesón',
          email: 'meson@ejemplo.cl',
          telefono: '56977778888',
        })
        .catch((e: unknown) => e);

      expect(cuerpoDel(error)).toEqual({
        motivo: 'TOPE_DE_LUZ',
        message: `A las 20:00 ya están ocupadas ${PREFIJO} 1 y ${PREFIJO} 2, y el tope de canchas con luz es 2.`,
      });
    });

    it('al mesón que reserva para un socio, también', async () => {
      const socio = await socioQueReserva(2);
      const error: unknown = await modulo
        .get(ReservaDelAdminService)
        .crear({
          canchaId: luz[2],
          inicio: a('20:00'),
          duracionMin: 60,
          socioId: socio.socioId,
          acompanantes: [{ nombre: 'Ana Invitada' }],
        })
        .catch((e: unknown) => e);

      expect(cuerpoDel(error).message).toContain(`${PREFIJO} 1 y ${PREFIJO} 2`);
    });
  });

  describe('dos a la vez por la última cancha con luz (45)', () => {
    it('por el camino del visitante, entra una sola', async () => {
      for (let ronda = 0; ronda < 5; ronda++) {
        await prisma.reserva.deleteMany({ where: { canchaId: { in: luz } } });
        await tomar(luz[0], '20:00', '21:00');

        const resultados = await Promise.allSettled(
          [luz[1], luz[2], luz[3]].map((cancha) =>
            tomar(cancha, '20:00', '21:00'),
          ),
        );

        expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(
          1,
        );
        // Ningún 500: todo rechazo es el del tope, no un deadlock ni un error crudo.
        for (const rechazo of resultados.filter(
          (r) => r.status === 'rejected',
        )) {
          expect(rechazo.reason).toBeInstanceOf(TopeDeLuz);
        }
        expect(
          await prisma.reserva.count({ where: { canchaId: { in: luz } } }),
        ).toBe(2);
      }
    });

    it('por el camino del socio, que lee sus cupos antes de llegar al tope, entra una sola', async () => {
      // Es el caso que prueba la lectura con candado: la transacción del socio ya sacó su
      // foto de la base al contar sus cupos, y con una lectura común contaría sin ver a
      // quien entró recién.
      const socios = await Promise.all(
        [1, 2, 3].map((n) => socioQueReserva(n)),
      );

      for (let ronda = 0; ronda < 5; ronda++) {
        await prisma.reserva.deleteMany({ where: { canchaId: { in: luz } } });
        await tomar(luz[0], '20:00', '21:00');

        const resultados = await Promise.allSettled(
          socios.map((socio, i) =>
            reservarComoSocio(socio, luz[i + 1], '20:00'),
          ),
        );

        expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(
          1,
        );
        for (const rechazo of resultados.filter(
          (r) => r.status === 'rejected',
        )) {
          expect(cuerpoDel(rechazo.reason).motivo).toBe('TOPE_DE_LUZ');
        }
        expect(
          await prisma.reserva.count({ where: { canchaId: { in: luz } } }),
        ).toBe(2);
      }
    });
  });

  describe('al mover una reserva y al volver de pagar la diferencia (T204)', () => {
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

    const mover = (
      reservaId: number,
      canchaId: number,
      hora: string,
      yo: UsuarioActual = admin,
      duracionMin?: 60 | 90,
    ) =>
      modulo
        .get(ModificacionService)
        .modificar(reservaId, { canchaId, inicio: a(hora), duracionMin }, yo);

    /** Una hora de visitante pagada en línea: la que se cambia desde el enlace. */
    const pagadaEnLinea = async (
      canchaId: number,
      desde: string,
      hasta: string,
    ) => {
      const reserva = await tomar(canchaId, desde, hasta);
      await prisma.transaccion.create({
        data: {
          referencia: `T204-${reserva.id}-${Date.now()}`,
          concepto: ConceptoPago.RESERVA,
          conceptoId: reserva.id,
          montoClp: 12000,
          pasarela: 'doble',
          estado: EstadoTransaccion.AUTORIZADA,
          inicioBloqueOriginal: reserva.inicio,
        },
      });

      return reserva;
    };

    const alargarYPagar = (token: string, canchaId: number, hora: string) =>
      modulo
        .get(ModificacionService)
        .pagarDiferenciaPorToken(
          token,
          { canchaId, inicio: a(hora), duracionMin: 90 },
          'https://club.local/api/reservas/retorno-diferencia',
        );

    it('una de las que llenan el tope se cambia a otra cancha con luz a la misma hora (46)', async () => {
      const suya = await tomar(luz[0], '20:00', '21:00');
      await tomar(luz[1], '20:00', '21:00');

      const movida = await mover(suya.id, luz[2], '20:00');

      expect(movida.canchaId).toBe(luz[2]);
    });

    it('la del socio, también: lo que se mueve no se cuenta contra sí mismo', async () => {
      const socio = await socioQueReserva(1);
      const suya = await reservarComoSocio(socio, luz[0], '20:00');
      await tomar(luz[1], '20:00', '21:00');

      const movida = await mover(suya.id, luz[2], '20:00', socio);

      expect(movida.canchaId).toBe(luz[2]);
    });

    it('una de otra hora no puede pasar a las 20:00 en una tercera cancha con luz', async () => {
      await tomar(luz[0], '20:00', '21:00');
      await tomar(luz[1], '20:00', '21:00');
      const socio = await socioQueReserva(1);
      const suya = await reservarComoSocio(socio, luz[2], '18:00');

      const error: unknown = await mover(suya.id, luz[2], '20:00', socio).catch(
        (e: unknown) => e,
      );

      expect(cuerpoDel(error)).toEqual({
        motivo: 'TOPE_DE_LUZ',
        message:
          'A esa hora ya están ocupadas todas las canchas con luz que el club puede encender. Elige otra hora.',
      });
      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: suya.id } }),
      ).toMatchObject({ inicio: a('18:00') });
    });

    it('al admin que la mueve le nombra las canchas', async () => {
      await tomar(luz[0], '20:00', '21:00');
      await tomar(luz[1], '20:00', '21:00');
      const otra = await tomar(luz[2], '18:00', '19:00');

      const error: unknown = await mover(otra.id, luz[2], '20:00').catch(
        (e: unknown) => e,
      );

      expect(cuerpoDel(error).message).toBe(
        `A las 20:00 ya están ocupadas ${PREFIJO} 1 y ${PREFIJO} 2, y el tope de canchas con luz es 2.`,
      );
    });

    it('alargarla a 1 hora y media sobre un tramo lleno se rechaza', async () => {
      await tomar(luz[0], '19:30', '20:30');
      await tomar(luz[1], '19:30', '20:30');
      const socio = await socioQueReserva(1);
      const suya = await reservarComoSocio(socio, luz[2], '18:30');

      const error: unknown = await mover(
        suya.id,
        luz[2],
        '18:30',
        socio,
        90,
      ).catch((e: unknown) => e);

      expect(cuerpoDel(error).motivo).toBe('TOPE_DE_LUZ');
    });

    it('pedir el cambio pagado hacia una hora con el tope lleno se rechaza antes de ir a Webpay', async () => {
      await tomar(luz[0], '19:30', '20:30');
      await tomar(luz[1], '19:30', '20:30');
      const reserva = await pagadaEnLinea(luz[2], '18:30', '19:30');

      const error: unknown = await alargarYPagar(
        reserva.token,
        luz[2],
        '18:30',
      ).catch((e: unknown) => e);

      expect(cuerpoDel(error).motivo).toBe('TOPE_DE_LUZ');
      expect(
        await prisma.transaccion.count({
          where: {
            conceptoId: reserva.id,
            estado: EstadoTransaccion.PENDIENTE,
          },
        }),
      ).toBe(0);
    });

    it('si el tope se llena mientras paga la diferencia, se queda en su hora y se le devuelve entera (47)', async () => {
      await tomar(luz[0], '19:30', '20:30');
      const reserva = await pagadaEnLinea(luz[2], '18:30', '19:30');
      const pago = await alargarYPagar(reserva.token, luz[2], '18:30');

      // Mientras está en Webpay, otra persona toma la segunda cancha con luz.
      await tomar(luz[1], '19:30', '20:30');

      const vuelta = await modulo
        .get(RetornoDeDiferencia)
        .confirmar(pago.tokenPasarela);

      expect(vuelta).toMatchObject({ estado: 'SIN_CAMBIO', devueltoClp: 4000 });
      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } }),
      ).toMatchObject({
        inicio: a('18:30'),
        fin: a('19:30'),
        cambioTransaccionId: null,
      });
    });
  });

  describe('las clases, que pasan por el cierre de la cancha (T205)', () => {
    let profesorId: number;

    const unaClase = (canchaId: number, desde: string, hasta: string) => ({
      canchaId,
      profesorId,
      fecha: DIA,
      inicio: a(desde),
      fin: a(hasta),
      cupoMaximo: 6,
      nivel: NivelClase.INICIACION,
      notas: null,
    });

    const clases = () => modulo.get(Clases);

    beforeEach(async () => {
      await prisma.profesor.deleteMany({
        where: { nombreVisible: 'Profe T205' },
      });
      profesorId = (
        await prisma.profesor.create({
          data: {
            nombreVisible: 'Profe T205',
            telefono: '56933334444',
            especialidad: 'Iniciación',
          },
          select: { id: true },
        })
      ).id;
    });

    afterAll(async () => {
      // Sus clases y series primero: la ficha no se borra en cascada.
      await prisma.clase.deleteMany({
        where: { profesor: { nombreVisible: 'Profe T205' } },
      });
      await prisma.serieDeClases.deleteMany({
        where: { profesor: { nombreVisible: 'Profe T205' } },
      });
      await prisma.profesor.deleteMany({
        where: { nombreVisible: 'Profe T205' },
      });
    });

    it('una clase a las 20:00 en una tercera cancha con luz no se agenda, y la simulación ya lo decía (clases 9)', async () => {
      await tomar(luz[0], '20:00', '21:00');
      await tomar(luz[1], '20:00', '21:00');

      const previa: unknown = await clases()
        .afectadas(unaClase(luz[2], '20:00', '21:00'))
        .catch((e: unknown) => e);
      const agendada: unknown = await clases()
        .agendar(unaClase(luz[2], '20:00', '21:00'))
        .catch((e: unknown) => e);

      const esperado = {
        motivo: 'TOPE_DE_LUZ',
        message: `A las 20:00 ya están ocupadas ${PREFIJO} 1 y ${PREFIJO} 2, y el tope de canchas con luz es 2.`,
      };
      expect(cuerpoDel(previa)).toEqual(esperado);
      expect(cuerpoDel(agendada)).toEqual(esperado);
      expect(await prisma.clase.count({ where: { profesorId } })).toBe(0);
      expect(await prisma.bloqueo.count({ where: { canchaId: luz[2] } })).toBe(
        0,
      );
    });

    it('cancelar las reservas de su propia cancha no la libera: el tope lo llenan las otras', async () => {
      await tomar(luz[0], '20:00', '21:00');
      await tomar(luz[1], '20:00', '21:00');
      const debajo = await tomar(luz[2], '18:00', '19:00');
      await prisma.reserva.update({
        where: { id: debajo.id },
        data: { inicio: a('20:00'), fin: a('21:00') },
      });

      const error: unknown = await clases()
        .agendar(unaClase(luz[2], '20:00', '21:00'))
        .catch((e: unknown) => e);

      expect(cuerpoDel(error).motivo).toBe('TOPE_DE_LUZ');
      // Y la reserva de abajo sigue viva: el tope corta antes de cancelar nada.
      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: debajo.id } }),
      ).toMatchObject({ estado: EstadoReserva.CONFIRMADA });
    });

    it('mover una clase a otra cancha con luz a la misma hora no la cuenta contra sí misma', async () => {
      const clase = await clases().agendar(unaClase(luz[0], '20:00', '21:00'));
      await tomar(luz[1], '20:00', '21:00');

      await clases().mover(clase.id, {
        canchaId: luz[2],
        fecha: DIA,
        inicio: a('20:00'),
        fin: a('21:00'),
      });

      expect(
        await prisma.clase.findUniqueOrThrow({ where: { id: clase.id } }),
      ).toMatchObject({ canchaId: luz[2] });
    });

    it('mover una clase de las 18:00 a las 20:00 sobre el tope se rechaza', async () => {
      await tomar(luz[0], '20:00', '21:00');
      await tomar(luz[1], '20:00', '21:00');
      const clase = await clases().agendar(unaClase(luz[2], '18:00', '19:00'));

      const error: unknown = await clases()
        .mover(clase.id, { fecha: DIA, inicio: a('20:00'), fin: a('21:00') })
        .catch((e: unknown) => e);

      expect(cuerpoDel(error).motivo).toBe('TOPE_DE_LUZ');
      expect(
        await prisma.clase.findUniqueOrThrow({ where: { id: clase.id } }),
      ).toMatchObject({ inicio: a('18:00') });
    });

    describe('en una serie (clases 10)', () => {
      const unaSerie = () => ({
        canchaId: luz[2],
        profesorId,
        diasSemana: [1],
        horaDesde: '20:00',
        horaHasta: '21:00',
        desde: DIA,
        hasta: '2039-06-20',
        cupoMaximo: 6,
        nivel: NivelClase.INICIACION,
        notas: null,
      });

      beforeEach(async () => {
        // El tope lleno solo el primer lunes.
        await tomar(luz[0], '20:00', '21:00');
        await tomar(luz[1], '20:00', '21:00');
      });

      it('la fecha que pasaría el tope sale como choque, y la otra no', async () => {
        const fechas = await clases().simularSerie(unaSerie());

        expect(fechas.map(({ fecha, choque }) => ({ fecha, choque }))).toEqual([
          {
            fecha: DIA,
            choque: `A las 20:00 ya están ocupadas ${PREFIJO} 1 y ${PREFIJO} 2, y el tope de canchas con luz es 2.`,
          },
          { fecha: '2039-06-20', choque: null },
        ]);
      });

      it('confirmarla sin saltar esa fecha responde FALTA_DECIDIR, y saltándola se agenda la otra', async () => {
        const sinDecidir: unknown = await clases()
          .agendarSerie(unaSerie(), {})
          .catch((e: unknown) => e);

        expect(cuerpoDel(sinDecidir).motivo).toBe('FALTA_DECIDIR');
        expect(cuerpoDel(sinDecidir).message).toContain('solo se puede saltar');

        const agendada = await clases().agendarSerie(unaSerie(), {
          [DIA]: 'saltar',
        });

        expect(agendada.clases.map(({ fecha }) => fecha)).toEqual([
          '2039-06-20',
        ]);
      });
    });

    it('una clase y una reserva a la vez por la última cancha con luz: entra una (45, el camino del cierre)', async () => {
      for (let ronda = 0; ronda < 5; ronda++) {
        await prisma.clase.deleteMany({ where: { profesorId } });
        await prisma.bloqueo.deleteMany({ where: { canchaId: { in: luz } } });
        await prisma.reserva.deleteMany({ where: { canchaId: { in: luz } } });
        await tomar(luz[0], '20:00', '21:00');

        const resultados = await Promise.allSettled([
          clases().agendar(unaClase(luz[1], '20:00', '21:00')),
          tomar(luz[2], '20:00', '21:00'),
        ]);

        expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(
          1,
        );
        const [rechazo] = resultados.filter((r) => r.status === 'rejected');
        expect(
          rechazo.reason instanceof TopeDeLuz ||
            cuerpoDel(rechazo.reason).motivo === 'TOPE_DE_LUZ',
        ).toBe(true);
      }
    });
  });

  describe('el cierre desde el panel de bloqueos (T206)', () => {
    const cierre = () => modulo.get(CierreDeCanchaController);
    const unCierre = (
      motivo: string,
      horaDesde = '09:00',
      horaHasta = '23:00',
    ) => ({
      canchaId: luz[2],
      fechaDesde: DIA,
      horaDesde,
      fechaHasta: DIA,
      horaHasta,
      motivo,
    });

    beforeEach(async () => {
      await tomar(luz[0], '20:00', '21:00');
      await tomar(luz[1], '20:00', '21:00');
    });

    it('la simulación de un bloqueo de torneo avisa el tope antes de mostrar a quién afecta', async () => {
      const error: unknown = await cierre()
        .simular(unCierre('TORNEO'))
        .catch((e: unknown) => e);

      expect(cuerpoDel(error)).toEqual({
        motivo: 'TOPE_DE_LUZ',
        message: `A las 20:00 ya están ocupadas ${PREFIJO} 1 y ${PREFIJO} 2, y el tope de canchas con luz es 2.`,
      });
    });

    it('un bloqueo de torneo de 9:00 a 23:00 sobre una tercera cancha con luz no se pone', async () => {
      const error: unknown = await cierre()
        .cerrar(unCierre('TORNEO'))
        .catch((e: unknown) => e);

      expect(cuerpoDel(error).motivo).toBe('TOPE_DE_LUZ');
      expect(await prisma.bloqueo.count({ where: { canchaId: luz[2] } })).toBe(
        0,
      );
    });

    it('uno de torneo que termina a las 19:00 sí, y uno de otro motivo de noche también', async () => {
      await cierre().cerrar(unCierre('TORNEO', '09:00', '19:00'));
      await cierre().cerrar(unCierre('OTRO', '19:00', '23:00'));

      expect(await prisma.bloqueo.count({ where: { canchaId: luz[2] } })).toBe(
        2,
      );
    });

    it('la simulación de una mantención no mira el tope: apaga la cancha', async () => {
      await expect(cierre().simular(unCierre('MANTENCION'))).resolves.toEqual({
        afectadas: [],
      });
    });
  });

  describe('la grilla (T207)', () => {
    const grilla = () => modulo.get(DisponibilidadPublicaService);

    /** El bloque de una cancha a una hora, tal como lo devuelve el día entero. */
    const enElDia = async (
      canchaId: number,
      hora: string,
      duracionMin: 60 | 90 = 60,
      excluyendo?: number,
    ) => {
      const dia = await grilla().delDia(DIA, duracionMin, excluyendo);
      const bloque = dia
        .find((g) => g.cancha.id === canchaId)
        ?.bloques.find((b) => b.inicio.getTime() === a(hora).getTime());

      return bloque!;
    };

    let deLaPrimera: { id: number };

    beforeEach(async () => {
      deLaPrimera = await tomar(luz[0], '20:00', '21:00');
      await tomar(luz[1], '20:00', '21:00');
    });

    it('la tercera cancha con luz se ve ocupada a las 20:00, sin precio (48)', async () => {
      expect(await enElDia(luz[2], '20:00')).toMatchObject({
        reservado: true,
        topeDeLuz: true,
        montoClp: 0,
      });
    });

    it('y también en la hora y media que empieza a las 19:30, que pisa las 20:00', async () => {
      expect(await enElDia(luz[2], '19:30', 90)).toMatchObject({
        topeDeLuz: true,
      });
      expect(await enElDia(luz[2], '18:30', 90)).toMatchObject({
        reservado: false,
        topeDeLuz: false,
      });
    });

    it('a las 19:00 sigue libre, y una cancha sin luz también a las 20:00', async () => {
      expect(await enElDia(luz[2], '19:00')).toMatchObject({
        reservado: false,
        topeDeLuz: false,
      });
      expect(await enElDia(sinLuz, '20:00')).toMatchObject({
        reservado: false,
        topeDeLuz: false,
      });
    });

    it('la cancha que ya está tomada se ve tomada, no como tope de luz', async () => {
      expect(await enElDia(luz[0], '20:00')).toMatchObject({
        reservado: true,
        topeDeLuz: false,
      });
    });

    it('la grilla para mover una de las dos ofrece la tercera a la misma hora', async () => {
      expect(await enElDia(luz[2], '20:00', 60, deLaPrimera.id)).toMatchObject({
        reservado: false,
        topeDeLuz: false,
      });
    });

    it('una cancha sola dice lo mismo que el día entero', async () => {
      const dia = await grilla().delDia(DIA, 60);

      for (const cancha of [...luz, sinLuz]) {
        expect(await grilla().de(cancha, DIA, 60)).toEqual(
          dia.find((g) => g.cancha.id === cancha)!.bloques,
        );
      }
    });
  });

  describe('las horas que ya superan el tope (T208)', () => {
    const excesos = () => modulo.get(TopeDeLuzController).excesos();

    beforeEach(async () => {
      // Tomadas con el tope apagado, como las que ya existían el día del despliegue.
      await configurarTope(null);
      for (const cancha of [luz[0], luz[1], luz[2]]) {
        await tomar(cancha, '20:00', '21:00');
      }
    });

    it('encender el tope no cancela ninguna, y la lista muestra ese intervalo con lo que ocupa cada cancha (49)', async () => {
      await configurarTope(2);

      expect(
        await prisma.reserva.count({
          where: { canchaId: { in: luz }, estado: EstadoReserva.CONFIRMADA },
        }),
      ).toBe(3);
      const delDia = (await excesos()).find(
        (exceso) => exceso.desde.getTime() === a('20:00').getTime(),
      );
      expect(delDia?.hasta).toEqual(a('21:00'));
      expect(delDia?.ocupaciones.map(({ cancha }) => cancha)).toEqual([
        `${PREFIJO} 1`,
        `${PREFIJO} 2`,
        `${PREFIJO} 3`,
      ]);
      expect(delDia?.ocupaciones[0].detalle).toMatch(
        /^Reserva [A-Z0-9]+ de Visitante de prueba$/,
      );
    });

    it('con el tope apagado la lista sale vacía', async () => {
      expect(await excesos()).toEqual([]);
    });
  });
});
