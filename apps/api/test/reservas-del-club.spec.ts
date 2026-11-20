import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  ConceptoPago,
  EstadoReserva,
  EstadoSocio,
  EstadoTransaccion,
  Superficie,
} from '../src/generated/prisma/client';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { UsuarioActual } from '../src/identidad/usuario-actual';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';
import { ModificacionService } from '../src/reservas/modificacion.service';

/**
 * T386 (`SPEC-panel.md` § Reservas del panel, RD4, RD5 y asunciones 9 y 10). Lo que el club
 * hace con la reserva de otro desde el panel:
 *
 * - **mueve sin el plazo del socio**, que sigue rigiendo para el socio;
 * - **cancela y el titular se entera por correo**, y quien cancela la suya no recibe nada;
 * - **lo que ya terminó no se mueve ni se cancela**, lo pida quien lo pida.
 *
 * Lunes 14 de septiembre de 2037, de 18:00 a 19:00 en el club. El reloj de cada caso va en
 * el `ahora`, como en `reservas-modificacion.spec.ts`.
 */
describe('El club mueve y cancela reservas desde el panel', () => {
  let modulo: TestingModule;
  let modificacion: ModificacionService;
  let prisma: PrismaService;
  let pasarela: PasarelaFake;
  let canchaId: number;
  let socioId: number;

  const NOMBRE_CANCHA = 'Cancha T386';
  const DOMINIO = '@t386.ejemplo.cl';
  const FECHA = '2037-09-14';
  const INICIO = instanteEnElClub(FECHA, '18:00');
  const FIN = instanteEnElClub(FECHA, '19:00');
  const A_LAS_20 = instanteEnElClub(FECHA, '20:00');

  const enviados: CorreoSaliente[] = [];

  const horasAntes = (horas: number) =>
    new Date(INICIO.getTime() - horas * 60 * 60 * 1000);
  const DESPUES_DE_JUGAR = instanteEnElClub(FECHA, '19:30');

  const usuario = (parche: Partial<UsuarioActual>): UsuarioActual => ({
    id: 1,
    nombre: 'Alguien',
    apellido: 'Del club',
    email: `alguien${DOMINIO}`,
    telefono: null,
    esAdmin: false,
    esGestor: false,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
    ...parche,
  });

  /** El admin que atiende el mesón, sin ficha de socio. */
  const admin = usuario({ esAdmin: true });
  /** El socio dueño de la reserva, con su sesión. */
  const elSocio = () =>
    usuario({ socioId, socioActivo: true, socioAlDia: true });

  /** La reserva del socio, con un invitado, como la deja `reservarComoSocio`. */
  const suReserva = () =>
    prisma.reserva.create({
      data: {
        folio: `T386S${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        canchaId,
        inicio: INICIO,
        fin: FIN,
        estado: EstadoReserva.CONFIRMADA,
        socioId,
        nombre: 'Sofía Socia',
        email: `sofia${DOMINIO}`,
        telefono: '',
        acompanantes: { create: { nombre: 'Ana Invitada' } },
      },
    });

  /** La de un visitante que pagó en línea, con su pago autorizado en la pasarela. */
  const reservaPagada = async () => {
    const reserva = await prisma.reserva.create({
      data: {
        folio: `T386V${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        canchaId,
        inicio: INICIO,
        fin: FIN,
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'Camila Visitante',
        email: `camila${DOMINIO}`,
        telefono: '+56955556666',
      },
    });
    const orden = await pasarela.iniciar({
      referencia: `T386-${reserva.id}`,
      montoClp: 12000,
      urlRetorno: 'https://club.local/retorno',
    });
    await pasarela.confirmar(orden.tokenPasarela);
    await prisma.transaccion.create({
      data: {
        referencia: `T386-${reserva.id}-${Date.now()}`,
        concepto: ConceptoPago.RESERVA,
        conceptoId: reserva.id,
        montoClp: 12000,
        pasarela: 'doble',
        estado: EstadoTransaccion.AUTORIZADA,
        tokenPasarela: orden.tokenPasarela,
        inicioBloqueOriginal: INICIO,
      },
    });

    return reserva;
  };

  /** La que el mesón tomó para un visitante que no dejó correo. */
  const delMesonSinCorreo = () =>
    prisma.reserva.create({
      data: {
        folio: `T386M${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        canchaId,
        inicio: INICIO,
        fin: FIN,
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'Pedro Del Mesón',
        email: '',
        telefono: '',
      },
    });

  beforeAll(async () => {
    modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .overrideProvider(EnviadorCorreo)
      .useValue({
        enviar: (correo: CorreoSaliente) => {
          enviados.push(correo);
          return Promise.resolve();
        },
      })
      .compile();

    await modulo.init();
    modificacion = modulo.get(ModificacionService);
    prisma = modulo.get(PrismaService);
    pasarela = modulo.get(PasarelaPago);
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({ where: { nombre: NOMBRE_CANCHA } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await modulo.close();
  });

  beforeEach(async () => {
    enviados.length = 0;
    pasarela.reiniciar();
    // Las ventanas de siempre, fijadas acá: `tenis_test` dura entre corridas, y otra
    // prueba cortada a la mitad puede haberlas dejado en otro número.
    await prisma.configuracionClub.update({
      where: { id: 1 },
      data: { horasMinModificacion: 6, horasReembolsoTotal: 24 },
    });
    await prisma.cancha.deleteMany({ where: { nombre: NOMBRE_CANCHA } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
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

    const socia = await prisma.usuario.create({
      data: {
        email: `sofia${DOMINIO}`,
        nombre: 'Sofía',
        apellido: 'Socia',
        emailVerificado: true,
        socio: {
          create: {
            numeroSocio: `T386-${Date.now()}`,
            estado: EstadoSocio.ACTIVO,
            fechaIngreso: new Date('2026-01-01'),
            alDiaHasta: new Date('2099-01-01'),
          },
        },
      },
      select: { socio: { select: { id: true } } },
    });
    socioId = socia.socio!.id;
  });

  describe('mover sin el plazo del socio (RD4)', () => {
    it('**el socio, a menos de 6 horas, no mueve su hora**', async () => {
      const reserva = await suReserva();

      await expect(
        modificacion.modificar(
          reserva.id,
          { canchaId, inicio: A_LAS_20 },
          elSocio(),
          horasAntes(3),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { motivo: 'FUERA_DE_PLAZO' },
      });
    });

    it('**el club sí se la mueve, en el mismo momento**', async () => {
      const reserva = await suReserva();

      const movida = await modificacion.modificar(
        reserva.id,
        { canchaId, inicio: A_LAS_20 },
        admin,
        horasAntes(3),
      );

      expect(movida.inicio).toEqual(A_LAS_20);
    });

    it('la hora que ya pasó sigue cerrada también para el club', async () => {
      const reserva = await suReserva();

      await expect(
        modificacion.modificar(
          reserva.id,
          { canchaId, inicio: instanteEnElClub(FECHA, '09:00') },
          admin,
          horasAntes(3),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { motivo: 'BLOQUE_EN_EL_PASADO' },
      });
    });
  });

  describe('lo que ya terminó no se toca (asunción 9)', () => {
    it('**el club no mueve una reserva que ya se jugó**', async () => {
      const reserva = await suReserva();

      await expect(
        modificacion.modificar(
          reserva.id,
          { canchaId, inicio: instanteEnElClub('2037-09-21', '18:00') },
          admin,
          DESPUES_DE_JUGAR,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { motivo: 'YA_TERMINO', message: 'Esa reserva ya terminó.' },
      });
    });

    it('ni la cancela', async () => {
      const reserva = await reservaPagada();

      await expect(
        modificacion.cancelar(reserva.id, admin, DESPUES_DE_JUGAR),
      ).rejects.toMatchObject({
        status: 409,
        response: { motivo: 'YA_TERMINO' },
      });
      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } }),
      ).toMatchObject({ estado: EstadoReserva.CONFIRMADA });
      expect(pasarela.anulaciones).toHaveLength(0);
    });

    it('el socio tampoco cancela la suya después de jugarla', async () => {
      const reserva = await suReserva();

      await expect(
        modificacion.cancelar(reserva.id, elSocio(), DESPUES_DE_JUGAR),
      ).rejects.toMatchObject({
        status: 409,
        response: { motivo: 'YA_TERMINO' },
      });
    });

    it('la que está corriendo todavía se cancela', async () => {
      const reserva = await suReserva();

      await expect(
        modificacion.cancelar(
          reserva.id,
          admin,
          instanteEnElClub(FECHA, '18:30'),
        ),
      ).resolves.toMatchObject({ folio: reserva.folio });
    });
  });

  describe('el correo al cancelar (RD5)', () => {
    it('**el club cancela la del socio: le llega un correo con su cupo de vuelta**', async () => {
      const reserva = await suReserva();

      await modificacion.cancelar(reserva.id, admin, horasAntes(48));

      expect(enviados).toHaveLength(1);
      expect(enviados[0].para).toBe(`sofia${DOMINIO}`);
      expect(enviados[0].cuerpo).toContain(
        `Cancelamos tu reserva ${reserva.folio}.`,
      );
      expect(enviados[0].cuerpo).toContain('ya no cuenta en tus cupos');
    });

    it('**el club cancela la del visitante con tiempo: el correo dice que se devolvió**', async () => {
      const reserva = await reservaPagada();

      await modificacion.cancelar(reserva.id, admin, horasAntes(48));

      expect(enviados).toHaveLength(1);
      expect(enviados[0].para).toBe(`camila${DOMINIO}`);
      expect(enviados[0].cuerpo).toContain('Te devolvimos todo lo que pagaste');
    });

    it('a menos de 24 horas, el correo dice que no se devuelve y por qué', async () => {
      const reserva = await reservaPagada();

      await modificacion.cancelar(reserva.id, admin, horasAntes(12));

      expect(enviados).toHaveLength(1);
      expect(enviados[0].cuerpo).toContain('El pago no se devuelve');
    });

    it('**el socio que cancela la suya no recibe correo**: ya sabe lo que hizo', async () => {
      const reserva = await suReserva();

      await modificacion.cancelar(reserva.id, elSocio(), horasAntes(48));

      expect(enviados).toHaveLength(0);
    });

    it('el admin que además es socio y cancela la suya, tampoco', async () => {
      const reserva = await suReserva();
      const adminSocio = usuario({
        esAdmin: true,
        socioId,
        socioActivo: true,
        socioAlDia: true,
      });

      await modificacion.cancelar(reserva.id, adminSocio, horasAntes(48));

      expect(enviados).toHaveLength(0);
    });

    it('la del mesón sin correo se cancela igual, sin mandar nada', async () => {
      const reserva = await delMesonSinCorreo();

      await expect(
        modificacion.cancelar(reserva.id, admin, horasAntes(48)),
      ).resolves.toMatchObject({ huboDevolucion: false });
      expect(enviados).toHaveLength(0);
    });
  });
});
