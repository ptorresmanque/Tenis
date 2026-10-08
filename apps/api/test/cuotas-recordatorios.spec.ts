import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import { RecordatoriosDeCuota } from '../src/cuotas/recordatorios';
import {
  EstadoCuota,
  EstadoSocio,
  TipoCuota,
} from '../src/generated/prisma/client';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T111. Quién recibe hoy el recordatorio de la cuota, una sola vez y en tandas.
 *
 * La regla corre sobre todos los socios activos de la base, así que estos casos miran solo
 * a los suyos, por el dominio del correo. En 2037, que no pisa los meses de otros tests.
 */
describe('Recordatorios de cuota', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let recordatorios: RecordatoriosDeCuota;

  const DOMINIO = '@recordatorios.ejemplo.cl';
  const PERIODOS = ['2037-10', '2037-11'];

  const enviados: CorreoSaliente[] = [];
  let falla: Error | null = null;

  /** Los correos a los socios de este archivo, por quién y de qué tipo. */
  const nuestros = () =>
    enviados
      .filter((correo) => correo.para.endsWith(DOMINIO))
      .map((correo) => `${correo.para.split('@')[0]}: ${correo.asunto}`)
      .sort();

  const socio = async (
    quien: string,
    datos: { alDiaHasta: string; fechaIngreso?: string; estado?: EstadoSocio },
  ) => {
    const usuario = await prisma.usuario.create({
      data: {
        email: `${quien}${DOMINIO}`,
        nombre: quien,
        apellido: 'De prueba',
        socio: {
          create: {
            numeroSocio: `REC-${quien}-${Date.now()}`,
            estado: datos.estado ?? EstadoSocio.ACTIVO,
            fechaIngreso: new Date(datos.fechaIngreso ?? '2037-01-01'),
            alDiaHasta: new Date(datos.alDiaHasta),
          },
        },
      },
      select: { socio: { select: { id: true } } },
    });

    return usuario.socio!.id;
  };

  const elDia = (fecha: string) => instanteEnElClub(fecha, '12:00');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnviadorCorreo)
      .useValue({
        enviar: (correo: CorreoSaliente) => {
          if (falla) return Promise.reject(falla);
          enviados.push(correo);
          return Promise.resolve();
        },
      })
      .compile();

    app = modulo.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    recordatorios = app.get(RecordatoriosDeCuota);
  });

  const limpiar = async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    // La emisión y los recordatorios también alcanzan a los socios que otros archivos
    // dejaron en la base: se borran los de estos meses, que solo usa este archivo.
    await prisma.recordatorioCuota.deleteMany({
      where: { periodo: { in: PERIODOS } },
    });
    await prisma.cuota.deleteMany({ where: { periodo: { in: PERIODOS } } });
  };

  beforeEach(async () => {
    await limpiar();
    enviados.length = 0;
    falla = null;
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  it('**el 26: el previo a quien no pagó noviembre, y el vencido a quien debe octubre**', async () => {
    await socio('ana', { alDiaHasta: '2037-09-30' });
    await socio('beto', { alDiaHasta: '2037-10-31' });
    await socio('cata', { alDiaHasta: '2037-11-30' });
    await socio('suspendido', {
      alDiaHasta: '2037-09-30',
      estado: EstadoSocio.SUSPENDIDO,
    });

    await recordatorios.correrTanda(elDia('2037-10-26'), 10_000);

    expect(nuestros()).toEqual([
      'ana: Tienes la cuota pendiente',
      'ana: Tu cuota de noviembre',
      'beto: Tu cuota de noviembre',
    ]);
  });

  it('**correr dos veces el mismo día no manda ningún recordatorio dos veces**', async () => {
    await socio('ana', { alDiaHasta: '2037-09-30' });

    await recordatorios.correrTanda(elDia('2037-10-26'), 10_000);
    await recordatorios.correrTanda(elDia('2037-10-26'), 10_000);
    // Ni al día siguiente, dentro de la misma ventana.
    await recordatorios.correrTanda(elDia('2037-10-27'), 10_000);

    expect(nuestros()).toHaveLength(2);
  });

  it('**el día 1: quien pagó no lo recibe, y el socio sin la incorporación pagada recibe el suyo**', async () => {
    await socio('cata', { alDiaHasta: '2037-11-30' });
    const dani = await socio('dani', {
      alDiaHasta: '2037-11-30',
      fechaIngreso: '2037-10-05',
    });
    await prisma.cuota.create({
      data: {
        socioId: dani,
        tipo: TipoCuota.INCORPORACION,
        periodo: '2037-10',
        montoClp: 150000,
      },
    });

    await recordatorios.correrTanda(elDia('2037-11-01'), 10_000);

    expect(nuestros()).toEqual(['dani: Tienes la cuota pendiente']);
    const aDani = enviados.find((correo) => correo.para === `dani${DOMINIO}`)!;
    expect(aDani.cuerpo).toContain('Tienes pendiente la incorporación.');
  });

  it('el vencido llega con la cuota del mes ya emitida, lista para pagar', async () => {
    const ana = await socio('ana', { alDiaHasta: '2037-10-31' });

    await recordatorios.correrTanda(elDia('2037-11-01'), 10_000);

    expect(
      await prisma.cuota.findUnique({
        where: {
          socioId_tipo_periodo: {
            socioId: ana,
            tipo: TipoCuota.MENSUAL,
            periodo: '2037-11',
          },
        },
        select: { estado: true },
      }),
    ).toEqual({ estado: EstadoCuota.PENDIENTE });
    expect(nuestros()).toEqual(['ana: Tienes la cuota pendiente']);
  });

  it('**con 120 pendientes y una tanda de 50, tres corridas los mandan a todos**', async () => {
    for (let i = 0; i < 120; i++) {
      await socio(`moroso${String(i).padStart(3, '0')}`, {
        alDiaHasta: '2037-09-30',
      });
    }

    // El 10: solo el vencido. Los socios que otros archivos dejaron en la base también
    // entran en la cuenta, así que se corre hasta que una tanda no mande nada.
    const tandas: number[] = [];
    for (let corrida = 0; corrida < 20; corrida++) {
      const { enviados: cuantos } = await recordatorios.correrTanda(
        elDia('2037-10-10'),
        50,
      );
      tandas.push(cuantos);
      if (cuantos === 0) break;
    }

    const total = tandas.reduce((suma, n) => suma + n, 0);
    expect(tandas.every((n) => n <= 50)).toBe(true);
    // Todas llenas menos la última con algo, y una vacía al final.
    expect(tandas).toHaveLength(Math.ceil(total / 50) + 1);
    expect(nuestros()).toHaveLength(120);
    expect(new Set(nuestros()).size).toBe(120);
  });

  it('**cada envío se registra antes de mandarlo: si el correo falla, no se repite**', async () => {
    // Un proceso que muere a mitad de la tanda no sabe cuáles alcanzó a mandar. Se elige
    // perder uno antes que repetirlo: el socio no recibe dos cobros por el mismo mes.
    const ana = await socio('ana', { alDiaHasta: '2037-09-30' });
    falla = new Error('sendmail no responde');

    await recordatorios.correrTanda(elDia('2037-10-10'), 10_000);
    falla = null;
    await recordatorios.correrTanda(elDia('2037-10-10'), 10_000);

    expect(nuestros()).toEqual([]);
    expect(
      await prisma.recordatorioCuota.count({
        where: { socioId: ana, periodo: '2037-10' },
      }),
    ).toBe(1);
  });
});
