import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoSocio } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T40: la cuota del mes aparece sola cuando alguien la mira.
 *
 * **No hay tarea programada que emita el día 1.** Un cron es una pieza que hay que
 * desplegar, vigilar y reintentar, y su fallo es silencioso: nadie nota que no corrió
 * hasta que un socio reclama que su cuota no aparece. La emisión perezosa no puede
 * fallar en silencio, porque el acto de mirar es el que emite.
 *
 * Eso mueve el peso a un solo lugar: **el único `(socioId, tipo, periodo)`**. Es el
 * mecanismo, no una precaución, y por eso el test que más importa acá es el de dos
 * peticiones simultáneas contra la base de verdad.
 */
describe('GET /api/admin/cuotas', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;
  let socioId: number;

  const DOMINIO = '@cuotas.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const PERIODO = '2026-08';

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'De cuotas',
      });

    const usuario = await prisma.usuario.update({
      where: { email: `${sufijo}${DOMINIO}` },
      data: { esAdmin },
      select: { id: true },
    });

    return usuario.id;
  };

  const entrar = async (sufijo: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA });

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  const crearSocio = async (
    sufijo: string,
    opciones: { ingreso?: string; estado?: EstadoSocio } = {},
  ) => {
    const usuarioId = await crearCuenta(sufijo);
    const socio = await prisma.socio.create({
      data: {
        usuarioId,
        numeroSocio: `CUO-${sufijo}-${Date.now()}`,
        estado: opciones.estado ?? EstadoSocio.ACTIVO,
        fechaIngreso: new Date(
          `${opciones.ingreso ?? '2026-01-01'}T00:00:00.000Z`,
        ),
        alDiaHasta: new Date('2026-07-31T00:00:00.000Z'),
      },
      select: { id: true },
    });

    return socio.id;
  };

  const delMes = async (periodo = PERIODO) => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/cuotas?periodo=${periodo}`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as {
      cuotas: {
        id: number;
        socioId: number;
        periodo: string;
        montoClp: number;
        estado: string;
        socio: { numeroSocio: string; nombre: string };
      }[];
      totalEmitidoClp: number;
      totalPagadoClp: number;
    };
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    await crearCuenta('jefe', true);
    await crearCuenta('mirona');
    cookieAdmin = await entrar('jefe');
    cookieSocio = await entrar('mirona');

    socioId = await crearSocio('socia');

    await prisma.configuracionClub.updateMany({
      data: { cuotaMensualClp: 25000 },
    });
  });

  it('**el mes se emite solo al mirarlo**', async () => {
    // Nadie corrió nada: la fila aparece porque el admin abrió el panel.
    const mes = await delMes();
    const suya = mes.cuotas.find((c) => c.socioId === socioId);

    expect(suya).toMatchObject({
      periodo: PERIODO,
      montoClp: 25000,
      estado: 'PENDIENTE',
    });
  });

  it('**dos peticiones simultáneas emiten una sola cuota por socio**', async () => {
    // El test que sostiene la decisión de no tener cron. Contra la base de verdad y no
    // con mocks: lo que impide la doble emisión es el índice único, y un mock no lo
    // tiene. Es plata, y se ve en el estado de cuenta del socio.
    const [una, otra] = await Promise.all([
      request(app.getHttpServer())
        .get(`/api/admin/cuotas?periodo=${PERIODO}`)
        .set('Cookie', cookieAdmin),
      request(app.getHttpServer())
        .get(`/api/admin/cuotas?periodo=${PERIODO}`)
        .set('Cookie', cookieAdmin),
    ]);

    // Con el cuerpo en el mensaje: si alguna vez falla por contención de la base y no
    // por doble emisión, el error tiene que decirlo en vez de mostrar solo "500".
    expect(`${una.status} ${JSON.stringify(una.body)}`).toMatch(/^200 /);
    expect(`${otra.status} ${JSON.stringify(otra.body)}`).toMatch(/^200 /);

    const cuantas = await prisma.cuota.count({
      where: { socioId, periodo: PERIODO },
    });
    expect(cuantas).toBe(1);
  });

  it('mirarlo dos veces seguidas no emite de nuevo', async () => {
    await delMes();
    await delMes();

    expect(
      await prisma.cuota.count({ where: { socioId, periodo: PERIODO } }),
    ).toBe(1);
  });

  it('**subir la cuota no cambia lo ya emitido**', async () => {
    // El monto se congela al emitir. Un socio que paga tarde no puede terminar
    // debiendo más de lo que se le cobró.
    await delMes();

    await prisma.configuracionClub.updateMany({
      data: { cuotaMensualClp: 30000 },
    });

    const mes = await delMes();
    expect(mes.cuotas.find((c) => c.socioId === socioId)?.montoClp).toBe(25000);

    // Y una emitida después sale al precio nuevo: se comprueba con un socio nuevo del
    // mismo mes, y no con el mes siguiente, que puede ser futuro según el calendario.
    const otra = await crearSocio('tardia');
    const mismoMes = await delMes();
    expect(mismoMes.cuotas.find((c) => c.socioId === otra)?.montoClp).toBe(
      30000,
    );
  });

  it('no se emiten meses anteriores al ingreso del socio', async () => {
    // Un club que arranca en agosto no le debe once meses a nadie.
    const nueva = await crearSocio('nueva', { ingreso: '2026-08-15' });

    const julio = await delMes('2026-07');
    expect(julio.cuotas.some((c) => c.socioId === nueva)).toBe(false);

    // Y el mes en que entró sí, completo: no se prorratea por días.
    const agosto = await delMes('2026-08');
    expect(agosto.cuotas.find((c) => c.socioId === nueva)?.montoClp).toBe(
      25000,
    );
  });

  it('**un mes futuro no se emite: esa deuda todavía no existe**', async () => {
    // Sin esto, un admin que navega al mes siguiente para mirar deja emitidas cuotas
    // por adelantado. Después el club cuenta como morosos a socios por meses que no
    // han empezado, y si alguno se retira quedan cuotas suyas de meses en que ya no
    // era socio.
    const futuro = await delMes('2030-01');

    // Por el socio de este test y no por la lista entera: los socios del seed viven en
    // la misma base y otro spec puede haber tocado ese mes.
    expect(futuro.cuotas.some((c) => c.socioId === socioId)).toBe(false);
    expect(
      await prisma.cuota.count({ where: { socioId, periodo: '2030-01' } }),
    ).toBe(0);
  });

  it('al socio suspendido no se le sigue cobrando', async () => {
    const suspendida = await crearSocio('suspendida', {
      estado: EstadoSocio.SUSPENDIDO,
    });

    const mes = await delMes();

    expect(mes.cuotas.some((c) => c.socioId === suspendida)).toBe(false);
  });

  it('el panel dice cuánto se emitió y cuánto está pagado', async () => {
    const mes = await delMes();

    expect(mes.totalEmitidoClp).toBeGreaterThanOrEqual(25000);
    // Recién emitidas, nadie pagó nada todavía.
    expect(mes.totalPagadoClp).toBe(0);
  });

  it('cada cuota viene con el socio, o la lista no se puede leer', async () => {
    const mes = await delMes();
    const suya = mes.cuotas.find((c) => c.socioId === socioId);

    expect(suya?.socio.nombre).toContain('Persona socia');
    expect(suya?.socio.numeroSocio).toMatch(/^CUO-socia-/);
  });

  it('un período mal escrito se rechaza', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/cuotas?periodo=agosto')
      .set('Cookie', cookieAdmin)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/cuotas?periodo=2026-13')
      .set('Cookie', cookieAdmin)
      .expect(400);
  });

  it('solo el admin ve las cuotas del club', async () => {
    await request(app.getHttpServer())
      .get(`/api/admin/cuotas?periodo=${PERIODO}`)
      .set('Cookie', cookieSocio)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/admin/cuotas?periodo=${PERIODO}`)
      .expect(401);
  });
});
