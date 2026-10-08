import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

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
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T109. Cada vez que la reserva de un visitante cambia de hora, cancha o duración, sale un
 * aviso a su correo con la hora de antes y la de después (decisión 7: ante cualquier
 * cambio, desde el enlace o desde el club).
 *
 * Es lo que cierra el `ponytail` del enlace (`SPEC-reservas.md` § Cambiar de hora): quien
 * tenga el enlace reenviado puede mover la reserva, y el dueño se entera.
 *
 * Lunes 14 de septiembre de 2037, a las 18:00 del club.
 */
describe('El aviso de cambio de la reserva de un visitante', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pasarela: PasarelaFake;
  let canchaId: number;
  let cookieAdmin: string;

  const NOMBRE_CANCHA = 'Cancha T109';
  const DOMINIO = '@t109.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const FECHA = '2037-09-14';

  const enviados: CorreoSaliente[] = [];

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  /** Una reserva de visitante de 18:00 a 19:00, pagada en línea. */
  const reservaDeVisitante = async () => {
    const inicio = instanteEnElClub(FECHA, '18:00');
    const reserva = await prisma.reserva.create({
      data: {
        folio: `T109${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        canchaId,
        inicio,
        fin: instanteEnElClub(FECHA, '19:00'),
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'Camila Rojas',
        email: `camila${DOMINIO}`,
        telefono: '+56955556666',
      },
      select: { id: true, token: true, folio: true },
    });
    await prisma.transaccion.create({
      data: {
        referencia: `T109-${reserva.id}`,
        concepto: ConceptoPago.RESERVA,
        conceptoId: reserva.id,
        montoClp: 12000,
        pasarela: 'doble',
        estado: EstadoTransaccion.AUTORIZADA,
        inicioBloqueOriginal: inicio,
      },
    });

    return reserva;
  };

  const aLas = (hora: string) => instanteEnElClub(FECHA, hora).toISOString();

  const pagarDiferencia = async (token: string) => {
    const pago = await request(servidor())
      .post(`/api/reservas/publica/${token}/diferencia`)
      .send({ canchaId, inicio: aLas('18:00'), duracionMin: 90 })
      .expect(201);

    return (pago.body as { tokenPasarela: string }).tokenPasarela;
  };

  const volverDeWebpay = (tokenPasarela: string) =>
    request(servidor())
      .get(`/api/reservas/retorno-diferencia?token_ws=${tokenPasarela}`)
      .expect(302);

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
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

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
    pasarela = app.get(PasarelaPago);

    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await request(servidor())
      .post('/api/auth/registro')
      .send({
        email: `jefa${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: 'Jefa',
        apellido: 'Del club',
      });
    await prisma.usuario.update({
      where: { email: `jefa${DOMINIO}` },
      data: { esAdmin: true },
    });
    const login = await request(servidor())
      .post('/api/auth/login')
      .send({ email: `jefa${DOMINIO}`, contrasena: CONTRASENA });
    cookieAdmin = (login.headers['set-cookie'] as unknown as string[])[0];
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({ where: { nombre: NOMBRE_CANCHA } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    pasarela.reiniciar();
    await prisma.cancha.deleteMany({ where: { nombre: NOMBRE_CANCHA } });

    const cancha = await prisma.cancha.create({
      data: {
        nombre: NOMBRE_CANCHA,
        superficie: Superficie.CEMENTO,
        horarios: {
          create: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
            diaSemana,
            horaApertura: '08:00',
            horaCierre: '22:00',
          })),
        },
        franjas: {
          create: {
            horaDesde: '08:00',
            horaHasta: '22:00',
            montoClp: 12000,
            montoClp90: 16000,
            vigenteDesde: new Date('2026-01-01'),
          },
        },
      },
      select: { id: true },
    });
    canchaId = cancha.id;
    enviados.length = 0;
  });

  it('**mover desde el enlace sin diferencia manda un aviso con la hora de antes y la de después**', async () => {
    const reserva = await reservaDeVisitante();

    await request(servidor())
      .patch(`/api/reservas/publica/${reserva.token}`)
      .send({ canchaId, inicio: aLas('19:00') })
      .expect(200);

    expect(enviados).toHaveLength(1);
    expect(enviados[0].para).toBe(`camila${DOMINIO}`);
    expect(enviados[0].asunto).toContain(reserva.folio);
    expect(enviados[0].cuerpo).toContain('de 18:00 a 19:00');
    expect(enviados[0].cuerpo).toContain('de 19:00 a 20:00');
  });

  it('**con diferencia, el aviso sale al volver de Webpay autorizado, no al iniciar el pago**', async () => {
    const reserva = await reservaDeVisitante();

    const tokenPasarela = await pagarDiferencia(reserva.token);
    expect(enviados).toHaveLength(0);

    await volverDeWebpay(tokenPasarela);

    expect(enviados).toHaveLength(1);
    expect(enviados[0].cuerpo).toContain('de 18:00 a 19:30 (1 hora y media)');
  });

  it('la recarga de la vuelta no repite el aviso', async () => {
    const reserva = await reservaDeVisitante();
    const tokenPasarela = await pagarDiferencia(reserva.token);

    await volverDeWebpay(tokenPasarela);
    await volverDeWebpay(tokenPasarela);

    expect(enviados).toHaveLength(1);
  });

  it('**una diferencia rechazada no manda aviso: la reserva no cambió** (T90)', async () => {
    const reserva = await reservaDeVisitante();
    const tokenPasarela = await pagarDiferencia(reserva.token);
    pasarela.respuesta = 'RECHAZADA';

    await volverDeWebpay(tokenPasarela);

    expect(enviados).toHaveLength(0);
  });

  it('**el club mueve la reserva desde el panel y también sale el aviso**', async () => {
    const reserva = await prisma.reserva.findFirstOrThrow({
      where: { id: (await reservaDeVisitante()).id },
      select: { id: true },
    });

    await request(servidor())
      .patch(`/api/reservas/${reserva.id}`)
      .set('Cookie', cookieAdmin)
      .send({ canchaId, inicio: aLas('20:00') })
      .expect(200);

    expect(enviados).toHaveLength(1);
    expect(enviados[0].cuerpo).toContain('de 20:00 a 21:00');
  });

  it('volver a elegir la misma hora no avisa un cambio que no hubo', async () => {
    // La grilla de mover no cuenta la propia reserva, así que su hora aparece libre.
    const reserva = await reservaDeVisitante();

    await request(servidor())
      .patch(`/api/reservas/publica/${reserva.token}`)
      .send({ canchaId, inicio: aLas('18:00') })
      .expect(200);

    expect(enviados).toHaveLength(0);
  });

  it('la reserva de un socio no recibe este aviso: la ve en "Mis reservas"', async () => {
    const socio = await prisma.usuario.create({
      data: {
        email: `socia${DOMINIO}`,
        nombre: 'Socia',
        apellido: 'Del club',
        socio: {
          create: {
            numeroSocio: `T109-${Date.now()}`,
            estado: EstadoSocio.ACTIVO,
            fechaIngreso: new Date('2026-01-01'),
            alDiaHasta: new Date('2040-01-01'),
          },
        },
      },
      select: { socio: { select: { id: true } } },
    });
    const reserva = await prisma.reserva.create({
      data: {
        folio: 'T109SOC',
        canchaId,
        inicio: instanteEnElClub(FECHA, '10:00'),
        fin: instanteEnElClub(FECHA, '11:00'),
        estado: EstadoReserva.CONFIRMADA,
        socioId: socio.socio!.id,
        nombre: 'Socia Del club',
        email: `socia${DOMINIO}`,
        telefono: '+56911112222',
        acompanantes: { create: [{ nombre: 'Invitada' }] },
      },
      select: { id: true },
    });

    await request(servidor())
      .patch(`/api/reservas/${reserva.id}`)
      .set('Cookie', cookieAdmin)
      .send({ canchaId, inicio: aLas('11:00') })
      .expect(200);

    expect(enviados).toHaveLength(0);
  });
});
