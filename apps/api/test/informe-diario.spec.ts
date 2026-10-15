import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { fechaDelClub, instanteEnElClub } from '../src/comun/tiempo';
import { EstadoReserva, Superficie } from '../src/generated/prisma/client';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { PrismaService } from '../src/prisma/prisma.service';
import { InformeDiario } from '../src/reportes/informe-diario.service';

/**
 * T275. La tanda del informe diario, la que corre el cron de cada hora: manda el de hoy a
 * cada admin y cada gestor una sola vez, al llegar a la hora configurada (A9).
 */
describe('La tanda del informe diario', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tanda: InformeDiario;

  const DOMINIO = '@informe-diario-t275.test';
  const CANCHA = 'Cancha T275';
  const DIA = '2042-03-12';
  const enviados: CorreoSaliente[] = [];

  /** Los correos a las cuentas de este archivo: en la base de prueba hay otras. */
  const nuestros = () =>
    enviados
      .filter((correo) => correo.para.endsWith(DOMINIO))
      .map((correo) => correo.para)
      .sort();

  const ponerHora = (activo: boolean, hora: number) =>
    prisma.configuracionClub.updateMany({
      data: { informeDiarioActivo: activo, informeDiarioHora: hora },
    });

  const limpiar = async () => {
    await prisma.cancha.deleteMany({ where: { nombre: CANCHA } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.informeDiarioEnviado.deleteMany({
      where: { fecha: fechaDelClub(DIA) },
    });
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnviadorCorreo)
      .useValue({
        enviar: (correo: CorreoSaliente) => {
          enviados.push(correo);
          return Promise.resolve();
        },
      })
      .compile();

    app = modulo.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    tanda = app.get(InformeDiario);

    await limpiar();
    for (const [quien, datos] of [
      ['admin', { esAdmin: true }],
      ['gestora', { esGestor: true }],
      ['socia', {}],
    ] as const) {
      await prisma.usuario.create({
        data: {
          email: `${quien}${DOMINIO}`,
          nombre: quien,
          apellido: 'T275',
          ...datos,
        },
      });
    }
    const { id: canchaId } = await prisma.cancha.create({
      data: { nombre: CANCHA, superficie: Superficie.CEMENTO },
    });
    await prisma.reserva.create({
      data: {
        folio: 'T275001',
        canchaId,
        inicio: instanteEnElClub(DIA, '19:00'),
        fin: instanteEnElClub(DIA, '20:00'),
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'Camila Visitante',
        email: `camila${DOMINIO}`,
        telefono: '+56911112222',
      },
    });
  });

  beforeEach(async () => {
    enviados.length = 0;
    await prisma.informeDiarioEnviado.deleteMany({
      where: { fecha: fechaDelClub(DIA) },
    });
    await ponerHora(true, 7);
  });

  afterAll(async () => {
    try {
      await ponerHora(true, 7);
      await limpiar();
    } finally {
      await app.close();
    }
  });

  it('antes de la hora no manda nada', async () => {
    expect(
      await tanda.correrTanda(instanteEnElClub(DIA, '06:59')),
    ).toMatchObject({
      estado: 'antes-de-la-hora',
    });
    expect(nuestros()).toEqual([]);
  });

  it('**a la hora, uno a cada admin y cada gestor, con lo del día**', async () => {
    expect(
      await tanda.correrTanda(instanteEnElClub(DIA, '07:05')),
    ).toMatchObject({
      estado: 'enviado',
    });

    expect(nuestros()).toEqual([`admin${DOMINIO}`, `gestora${DOMINIO}`]);
    const alAdmin = enviados.find(
      (correo) => correo.para === `admin${DOMINIO}`,
    )!;
    expect(alAdmin.asunto).toBe('Agenda del día: miércoles, 12 de marzo');
    expect(alAdmin.cuerpo).toContain(
      '19:00–20:00 · Cancha T275 · Camila Visitante (visitante)',
    );
  });

  it('**la corrida siguiente del mismo día no repite**', async () => {
    await tanda.correrTanda(instanteEnElClub(DIA, '07:05'));
    enviados.length = 0;

    expect(
      await tanda.correrTanda(instanteEnElClub(DIA, '08:05')),
    ).toMatchObject({
      estado: 'ya-salio',
    });
    expect(nuestros()).toEqual([]);
  });

  it('apagado no manda, aunque sea la hora', async () => {
    await ponerHora(false, 7);

    expect(
      await tanda.correrTanda(instanteEnElClub(DIA, '09:00')),
    ).toMatchObject({
      estado: 'apagado',
    });
    expect(nuestros()).toEqual([]);
  });

  it('con la hora cambiada, espera a la nueva', async () => {
    await ponerHora(true, 21);

    expect(
      (await tanda.correrTanda(instanteEnElClub(DIA, '20:59'))).estado,
    ).toBe('antes-de-la-hora');
    expect(
      (await tanda.correrTanda(instanteEnElClub(DIA, '21:00'))).estado,
    ).toBe('enviado');
  });
});
