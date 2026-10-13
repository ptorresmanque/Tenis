import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  EstadoReserva,
  EstadoSocio,
  MotivoBloqueo,
  Superficie,
} from '../src/generated/prisma/client';
import { EnviadorCorreo } from '../src/identidad/correo';
import { UsuarioActual } from '../src/identidad/usuario-actual';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReservaDelAdminService } from '../src/reservas/reserva-del-admin.service';
import { ReservaNoSocioService } from '../src/reservas/reserva-no-socio.service';
import { ReservaRepository } from '../src/reservas/reserva.repository';
import { ReservasService } from '../src/reservas/reservas.service';
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
});
