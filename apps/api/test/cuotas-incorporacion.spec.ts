import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { mesEnElClub } from '../src/comun/tiempo';
import {
  EstadoCuota,
  Superficie,
  TipoCuota,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T42: la cuota de incorporación.
 *
 * El primer cobro del modelo de socios —"una cuota de inscripción por única vez y, en
 * adelante, una mensualidad"— y el que faltaba entero.
 *
 * **Bloquea igual que la mensualidad, y ese es el punto.** Es la primera que el club
 * cobra y la única que se paga una vez: si no bloqueara, el socio nuevo entra a
 * reservar y el cobro queda "para cuando pase por el club". Pero **no extiende
 * `alDiaHasta`**: no compra tiempo, compra la entrada.
 *
 * La parte que este archivo cuida con más cuidado es que **la regla no dependa de que
 * la fila exista**. Las cuotas se emiten cuando alguien las mira, así que un socio
 * recién dado de alta todavía no tiene la suya: preguntando por la fila podría
 * reservar hasta que al club se le ocurriera abrir el panel.
 */
describe('La cuota de incorporación', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let canchaId: number;

  const DOMINIO = '@incorporacion.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const NOMBRE_CANCHA = 'Cancha de incorporación';

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'Nueva',
      });

    await prisma.usuario.update({
      where: { email: `${sufijo}${DOMINIO}` },
      data: { esAdmin, emailVerificado: true },
    });
  };

  const entrar = async (sufijo: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA });

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  /** Da de alta a alguien que ya tiene cuenta: la ficha se crea en el acto. */
  const invitar = (sufijo: string) =>
    request(app.getHttpServer())
      .post('/api/admin/socios/invitaciones')
      .set('Cookie', cookieAdmin)
      .send({ email: `${sufijo}${DOMINIO}` });

  /** El mes en curso del club, que es cuando se dan de alta los socios del test. */
  // **Con el reloj del club.** En UTC, a las 21:00 de un 31 ya es el mes siguiente:
  // el panel emitiría las cuotas de un mes y el test las buscaría en el otro.
  const mesActual = () => mesEnElClub(new Date());

  /** Abrir el panel del mes: es lo que emite las cuotas. */
  const mirarElMes = async () => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/cuotas?periodo=${mesActual()}`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as {
      cuotas: { tipo: string; socio: { nombre: string } }[];
    };
  };

  /**
   * Alguien del padrón que entró años antes de la puesta en marcha. Es propio del spec y
   * no uno del seed de demostración: con la base recién creada del CI, el seed no estaba,
   * y sembrarlo aquí dejaba socios con cuotas que se colaban en los reportes de otros
   * specs (D6).
   */
  const unSocioQueYaEstaba = async () => {
    await crearCuenta('antiguo');
    await invitar('antiguo').expect(201);
    const socioId = await elSocioDe('antiguo');
    await prisma.socio.update({
      where: { id: socioId },
      data: { fechaIngreso: new Date('2020-03-01T00:00:00.000Z') },
    });

    return socioId;
  };

  const laIncorporacionDe = (socioId: number) =>
    prisma.cuota.findFirst({
      where: { socioId, tipo: TipoCuota.INCORPORACION },
    });

  const elSocioDe = async (sufijo: string) => {
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email: `${sufijo}${DOMINIO}` },
      select: { socio: { select: { id: true } } },
    });

    return usuario.socio!.id;
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await prisma.invitacionSocio.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await prisma.invitacionSocio.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    await crearCuenta('jefe', true);
    cookieAdmin = await entrar('jefe');

    await prisma.configuracionClub.updateMany({
      data: { cuotaIncorporacionClp: 150000 },
    });

    const cancha = await prisma.cancha.create({
      data: {
        nombre: NOMBRE_CANCHA,
        superficie: Superficie.CEMENTO,
        techada: false,
        iluminacion: true,
        activa: true,
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
            vigenteDesde: new Date('2026-01-01'),
          },
        },
      },
      select: { id: true },
    });

    canchaId = cancha.id;
  });

  it('**se emite en el mes en que el socio entró, al mirar ese mes**', async () => {
    await crearCuenta('socia');
    await invitar('socia').expect(201);

    await mirarElMes();

    const cuota = await laIncorporacionDe(await elSocioDe('socia'));

    expect(cuota).toMatchObject({
      periodo: mesActual(),
      montoClp: 150000,
      estado: EstadoCuota.PENDIENTE,
    });
  });

  it('mirar el mes dos veces no emite dos incorporaciones', async () => {
    await crearCuenta('socia');
    await invitar('socia').expect(201);

    await mirarElMes();
    await mirarElMes();

    const cuantas = await prisma.cuota.count({
      where: {
        socioId: await elSocioDe('socia'),
        tipo: TipoCuota.INCORPORACION,
      },
    });
    expect(cuantas).toBe(1);
  });

  it('aparece en el panel del mes junto a la mensual', async () => {
    // Esconderla dejaría al club cobrando la mitad de lo que emitió: la incorporación
    // de quien entró este mes es deuda de este mes.
    await crearCuenta('socia');
    await invitar('socia').expect(201);

    const mes = await mirarElMes();
    const suyas = mes.cuotas.filter(
      (c) => c.socio.nombre === 'Persona socia Nueva',
    );

    expect(suyas.map((c) => c.tipo).sort()).toEqual([
      'INCORPORACION',
      'MENSUAL',
    ]);
  });

  it('**no extiende `alDiaHasta`: no compra tiempo, compra la entrada**', async () => {
    await crearCuenta('socia');
    await invitar('socia').expect(201);
    await mirarElMes();

    const socioId = await elSocioDe('socia');
    const antes = await prisma.socio.findUniqueOrThrow({
      where: { id: socioId },
      select: { alDiaHasta: true },
    });

    const cuota = await laIncorporacionDe(socioId);
    await request(app.getHttpServer())
      .post(`/api/admin/cuotas/${cuota!.id}/pago`)
      .set('Cookie', cookieAdmin)
      .send({ medio: 'EFECTIVO' })
      .expect(201);

    const despues = await prisma.socio.findUniqueOrThrow({
      where: { id: socioId },
      select: { alDiaHasta: true },
    });

    expect(despues.alDiaHasta).toEqual(antes.alDiaHasta);
  });

  it('**no reserva desde el minuto cero, sin que nadie haya mirado el panel**', async () => {
    // Lo que hace correcta la regla: el alta deja `alDiaHasta` al fin del mes en curso,
    // así que el socio nuevo está al día. Y su cuota **todavía no existe**, porque
    // nadie abrió el panel. Preguntando por la fila, este socio reservaría gratis.
    await crearCuenta('socia');
    await invitar('socia').expect(201);

    const cookie = await entrar('socia');
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const grilla = await request(app.getHttpServer()).get(
      `/api/disponibilidad?cancha=${canchaId}&fecha=${manana}`,
    );
    const bloque = (grilla.body as { inicio: string }[])[0];

    const rechazo = await request(app.getHttpServer())
      .post('/api/reservas')
      .set('Cookie', cookie)
      .send({
        canchaId,
        inicio: bloque.inicio,
        acompanantes: [{ nombre: 'Invitada de prueba' }],
      })
      .expect(409);

    expect((rechazo.body as { motivo: string }).motivo).toBe(
      'INCORPORACION_IMPAGA',
    );
  });

  it('pagada, el socio nuevo reserva como cualquiera', async () => {
    await crearCuenta('socia');
    await invitar('socia').expect(201);
    await mirarElMes();

    const socioId = await elSocioDe('socia');
    const cuota = await laIncorporacionDe(socioId);
    await request(app.getHttpServer())
      .post(`/api/admin/cuotas/${cuota!.id}/pago`)
      .set('Cookie', cookieAdmin)
      .send({ medio: 'EFECTIVO' })
      .expect(201);

    const cookie = await entrar('socia');
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const grilla = await request(app.getHttpServer()).get(
      `/api/disponibilidad?cancha=${canchaId}&fecha=${manana}`,
    );
    const bloque = (grilla.body as { inicio: string }[])[0];

    await request(app.getHttpServer())
      .post('/api/reservas')
      .set('Cookie', cookie)
      .send({
        canchaId,
        inicio: bloque.inicio,
        acompanantes: [{ nombre: 'Invitada de prueba' }],
      })
      .expect(201);
  });

  it('**los socios que ya estaban no reciben incorporación**', async () => {
    // El club arranca con su padrón, y esa gente la pagó hace años fuera del sistema.
    // El corte es `cobraIncorporacionDesde`, que nace el día de la puesta en marcha.
    const yaEstaba = await unSocioQueYaEstaba();

    await mirarElMes();

    expect(await laIncorporacionDe(yaEstaba)).toBeNull();
  });

  it('y tampoco los bloquea: su deuda no existe', async () => {
    // El otro lado de la moneda. Sin esto, poner en marcha el sistema dejaría al
    // padrón entero sin poder reservar por un cobro que ya habían hecho.
    await unSocioQueYaEstaba();
    const cookie = await entrar('antiguo');

    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const grilla = await request(app.getHttpServer()).get(
      `/api/disponibilidad?cancha=${canchaId}&fecha=${manana}`,
    );
    const bloque = (grilla.body as { inicio: string }[])[0];

    const intento = await request(app.getHttpServer())
      .post('/api/reservas')
      .set('Cookie', cookie)
      .send({
        canchaId,
        inicio: bloque.inicio,
        acompanantes: [{ nombre: 'Invitada de prueba' }],
      });

    expect((intento.body as { motivo?: string }).motivo).not.toBe(
      'INCORPORACION_IMPAGA',
    );
  });
});
