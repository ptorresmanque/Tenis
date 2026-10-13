import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  DuracionesSocioPico,
  EstadoSocio,
  Superficie,
} from '../src/generated/prisma/client';
import { EnviadorCorreo } from '../src/identidad/correo';
import { UsuarioActual } from '../src/identidad/usuario-actual';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';
import { DisponibilidadPublicaService } from '../src/reservas/disponibilidad-publica.service';
import { ModificacionService } from '../src/reservas/modificacion.service';
import { ReservaDelAdminService } from '../src/reservas/reserva-del-admin.service';
import { ReservaNoSocioService } from '../src/reservas/reserva-no-socio.service';
import { ReservasService } from '../src/reservas/reservas.service';

/**
 * T212. Las duraciones que el socio puede tomar en horario prime
 * (`SPEC-reservas.md` § Duración del socio en horario prime, criterios 39–41).
 *
 * El club quiere más socios jugando en prime y no más tiempo por socio: hoy solo deja
 * tomar 1 hora. Una reserva toca prime si cualquier parte de su rango cae ahí.
 */
describe('Duraciones del socio en horario prime', () => {
  let modulo: TestingModule;
  let prisma: PrismaService;
  let canchaId: number;

  const NOMBRE = 'Cancha T212';
  const DOMINIO = '@t212.ejemplo.cl';
  // Un lunes que ningún otro test usa. Prime desde las 19:00.
  const DIA = '2039-06-20';
  const a = (hora: string) => instanteEnElClub(DIA, hora);

  const configurar = (duracionesSocioPico: DuracionesSocioPico) =>
    prisma.configuracionClub.update({
      where: { id: 1 },
      data: { duracionesSocioPico },
    });

  let siguiente = 0;
  /** Un socio al día, listo para reservar. Uno por reserva: el cupo diario es de 1. */
  const unSocio = async (): Promise<UsuarioActual> => {
    const n = (siguiente += 1);
    const usuario = await prisma.usuario.create({
      data: {
        email: `socio-${n}${DOMINIO}`,
        nombre: `Socio ${n}`,
        apellido: 'De prueba',
        telefono: '56911112222',
        emailVerificado: true,
        socio: {
          create: {
            numeroSocio: `T212-${n}`,
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

  const reservar = async (hora: string, duracionMin: 60 | 90) =>
    modulo.get(ReservasService).reservarComoSocio(await unSocio(), {
      canchaId,
      inicio: a(hora),
      duracionMin,
      acompanantes: [{ nombre: 'Ana Invitada' }],
    });

  const motivoDe = async (promesa: Promise<unknown>) => {
    const error: unknown = await promesa.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    return (error as ConflictException).getResponse() as {
      motivo: string;
      message: string;
    };
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
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({ where: { nombre: NOMBRE } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await configurar(DuracionesSocioPico.UNA_HORA);
    await modulo.close();
  });

  beforeEach(async () => {
    await prisma.cancha.deleteMany({ where: { nombre: NOMBRE } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await configurar(DuracionesSocioPico.UNA_HORA);

    canchaId = (
      await prisma.cancha.create({
        data: {
          nombre: NOMBRE,
          superficie: Superficie.CEMENTO,
          horarios: {
            create: {
              diaSemana: 1,
              horaApertura: '08:00',
              horaCierre: '23:00',
            },
          },
          franjas: {
            create: [
              {
                horaDesde: '08:00',
                horaHasta: '19:00',
                montoClp: 12000,
                montoClp90: 16000,
                vigenteDesde: new Date('2026-01-01'),
              },
              {
                horaDesde: '19:00',
                horaHasta: '23:00',
                esPico: true,
                montoClp: 20000,
                montoClp90: 28000,
                vigenteDesde: new Date('2026-01-01'),
              },
            ],
          },
        },
        select: { id: true },
      })
    ).id;
  });

  describe('con solo 1 hora (39)', () => {
    it('la hora y media que empieza en prime se rechaza, y dice por qué', async () => {
      expect(await motivoDe(reservar('19:00', 90))).toEqual({
        motivo: 'DURACION_EN_PRIME',
        message:
          'En horario prime los socios reservan de 1 hora. Esta reserva de 1 hora y ' +
          'media toca ese horario: elige 1 hora.',
      });
    });

    it('la de 18:30 a 20:00 también, aunque empiece en horario normal', async () => {
      expect((await motivoDe(reservar('18:30', 90))).motivo).toBe(
        'DURACION_EN_PRIME',
      );
    });

    it('la de 18:30 a 19:30 sí, y no gasta cupo prime: empieza en normal', async () => {
      const reserva = await reservar('18:30', 60);

      expect(reserva.esPico).toBe(false);
    });
  });

  describe('lo que el club elige (40)', () => {
    it('con solo 1 hora y media se invierte', async () => {
      await configurar(DuracionesSocioPico.HORA_Y_MEDIA);

      expect((await motivoDe(reservar('19:00', 60))).motivo).toBe(
        'DURACION_EN_PRIME',
      );
      await expect(reservar('20:00', 90)).resolves.toBeDefined();
    });

    it('con las dos, pasan las dos', async () => {
      await configurar(DuracionesSocioPico.AMBAS);

      await expect(reservar('19:00', 60)).resolves.toBeDefined();
      await expect(reservar('20:00', 90)).resolves.toBeDefined();
    });

    it('cambiar la regla no toca las reservas ya tomadas', async () => {
      await configurar(DuracionesSocioPico.AMBAS);
      const tomada = await reservar('19:00', 90);

      await configurar(DuracionesSocioPico.UNA_HORA);

      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: tomada.id } }),
      ).toMatchObject({ estado: 'CONFIRMADA', fin: a('20:30') });
    });
  });

  describe('en los otros caminos (41)', () => {
    it('alargar a 1 hora y media una reserva que entraría en prime se rechaza', async () => {
      const socio = await unSocio();
      const suya = await modulo.get(ReservasService).reservarComoSocio(socio, {
        canchaId,
        inicio: a('18:00'),
        duracionMin: 60,
        acompanantes: [{ nombre: 'Ana Invitada' }],
      });

      expect(
        (
          await motivoDe(
            modulo
              .get(ModificacionService)
              .modificar(
                suya.id,
                { canchaId, inicio: a('18:00'), duracionMin: 90 },
                socio,
              ),
          )
        ).motivo,
      ).toBe('DURACION_EN_PRIME');
    });

    it('el mesón tampoco le toma al socio 1 hora y media en prime', async () => {
      const socio = await unSocio();

      expect(
        (
          await motivoDe(
            modulo.get(ReservaDelAdminService).crear({
              canchaId,
              inicio: a('19:00'),
              duracionMin: 90,
              socioId: socio.socioId,
              acompanantes: [{ nombre: 'Ana Invitada' }],
            }),
          )
        ).motivo,
      ).toBe('DURACION_EN_PRIME');
    });

    it('al visitante no se le aplica: paga la hora y media que la franja vende', async () => {
      await expect(
        modulo.get(ReservaNoSocioService).iniciar(
          {
            canchaId,
            inicio: a('19:00'),
            duracionMin: 90,
            nombre: 'Camila Visitante',
            email: 'camila@ejemplo.cl',
            telefono: '56955556666',
            acompanantes: [{ nombre: 'Beto Rival' }],
          },
          'http://localhost/retorno',
        ),
      ).resolves.toMatchObject({ montoClp: 28000 });
    });
  });

  describe('la grilla dice qué puede tomar el socio', () => {
    const bloque = async (hora: string, duracionMin: 60 | 90) => {
      const dia = await modulo
        .get(DisponibilidadPublicaService)
        .delDia(DIA, duracionMin);

      return dia
        .find((g) => g.cancha.id === canchaId)!
        .bloques.find((b) => b.inicio.getTime() === a(hora).getTime())!;
    };

    it('con solo 1 hora, la hora y media que toca prime no es para el socio', async () => {
      expect(await bloque('18:30', 90)).toMatchObject({ socioPuede: false });
      expect(await bloque('17:30', 90)).toMatchObject({ socioPuede: true });
      expect(await bloque('19:00', 60)).toMatchObject({ socioPuede: true });
    });

    it('con solo 1 hora y media, es la hora en prime la que no', async () => {
      await configurar(DuracionesSocioPico.HORA_Y_MEDIA);

      expect(await bloque('19:00', 60)).toMatchObject({ socioPuede: false });
      expect(await bloque('19:00', 90)).toMatchObject({ socioPuede: true });
    });
  });
});
