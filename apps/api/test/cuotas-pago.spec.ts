import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoSocio, TipoCuota } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T41: la cuota que se paga en el mesón.
 *
 * Efectivo o transferencia, registrado por un admin. **Queda escrito quién lo
 * registró**: es dinero que pasó por las manos de una persona, y sin ese dato no hay
 * forma de reconstruir una caja que no cuadra.
 *
 * Y hace una sola cosa más: extender `Socio.alDiaHasta` al último día del período
 * pagado. El borde que este archivo cuida con más cuidado es que **nunca lo
 * retroceda** —pagar agosto después de septiembre no puede dejar moroso a nadie—,
 * porque es un `=` en lugar de un `max` y no se nota hasta que un socio no puede
 * reservar.
 */
describe('POST /api/admin/cuotas/:id/pago', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;
  let socioId: number;
  let adminId: number;

  const DOMINIO = '@pagos.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'Del mesón',
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

  /** Una cuota pendiente de ese período, escrita directo para no depender del panel. */
  const unaCuota = async (periodo: string) => {
    const cuota = await prisma.cuota.create({
      data: {
        socioId,
        tipo: TipoCuota.MENSUAL,
        periodo,
        montoClp: 25000,
      },
      select: { id: true },
    });

    return cuota.id;
  };

  const pagar = (id: number, cuerpo: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/admin/cuotas/${id}/pago`)
      .set('Cookie', cookieAdmin)
      .send(cuerpo);

  const alDiaHasta = async () => {
    const socio = await prisma.socio.findUniqueOrThrow({
      where: { id: socioId },
      select: { alDiaHasta: true },
    });

    return socio.alDiaHasta.toISOString().slice(0, 10);
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
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    adminId = await crearCuenta('jefe', true);
    await crearCuenta('mirona');
    cookieAdmin = await entrar('jefe');
    cookieSocio = await entrar('mirona');

    const usuarioSocio = await crearCuenta('socia');
    const socio = await prisma.socio.create({
      data: {
        usuarioId: usuarioSocio,
        numeroSocio: `PAG-${Date.now()}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2026-01-01T00:00:00.000Z'),
        alDiaHasta: new Date('2026-07-31T00:00:00.000Z'),
      },
      select: { id: true },
    });
    socioId = socio.id;
  });

  it('**cobrar en efectivo deja escrito quién lo registró**', async () => {
    const id = await unaCuota('2026-08');

    await pagar(id, { medio: 'EFECTIVO' }).expect(201);

    const cuota = await prisma.cuota.findUniqueOrThrow({ where: { id } });

    expect(cuota.estado).toBe('PAGADA');
    expect(cuota.medio).toBe('EFECTIVO');
    expect(cuota.registradaPor).toBe(adminId);
    expect(cuota.pagadaEn).not.toBeNull();
  });

  it('extiende la vigencia al último día del período pagado', async () => {
    const id = await unaCuota('2026-08');

    await pagar(id, { medio: 'TRANSFERENCIA' }).expect(201);

    expect(await alDiaHasta()).toBe('2026-08-31');
  });

  it('**pagar agosto después de septiembre no deja moroso al socio**', async () => {
    // El borde que un `=` en vez de un `max` rompe, y que no se nota hasta que el
    // socio no puede reservar.
    const septiembre = await unaCuota('2026-09');
    await pagar(septiembre, { medio: 'EFECTIVO' }).expect(201);
    expect(await alDiaHasta()).toBe('2026-09-30');

    const agosto = await unaCuota('2026-08');
    await pagar(agosto, { medio: 'EFECTIVO' }).expect(201);

    expect(await alDiaHasta()).toBe('2026-09-30');
  });

  it('el último día de febrero es el 28 o el 29, según el año', async () => {
    // Sumar 30 días o usar el día 31 daría marzo. 2028 es bisiesto.
    const id = await unaCuota('2028-02');

    await pagar(id, { medio: 'EFECTIVO' }).expect(201);

    expect(await alDiaHasta()).toBe('2028-02-29');
  });

  it('el pago queda en el historial del socio, con quién lo registró (T37)', async () => {
    // `alDiaHasta` es un campo de derechos: quien lo movió tiene que quedar escrito,
    // por el mismo camino que la edición del panel y la sanción.
    const id = await unaCuota('2026-08');

    await pagar(id, { medio: 'EFECTIVO' }).expect(201);

    const renglones = await prisma.cambioSocio.findMany({ where: { socioId } });

    expect(renglones).toHaveLength(1);
    expect(renglones[0]).toMatchObject({
      campo: 'alDiaHasta',
      valorAnterior: '2026-07-31',
      valorNuevo: '2026-08-31',
      hechoPor: adminId,
    });
    expect(renglones[0].motivo).toContain('2026-08');
  });

  it('**el socio moroso que paga puede reservar en el acto**', async () => {
    // El circuito completo de la tarea: sin esto, el club cobra y el socio sigue sin
    // poder tomar cancha hasta que alguien toque la base.
    await prisma.socio.update({
      where: { id: socioId },
      data: { alDiaHasta: new Date('2020-01-01T00:00:00.000Z') },
    });

    const antes = await request(app.getHttpServer())
      .get('/api/yo')
      .set('Cookie', await entrar('socia'));
    expect((antes.body as { socioAlDia: boolean }).socioAlDia).toBe(false);

    const id = await unaCuota('2099-12');
    await pagar(id, { medio: 'EFECTIVO' }).expect(201);

    const despues = await request(app.getHttpServer())
      .get('/api/yo')
      .set('Cookie', await entrar('socia'));
    expect((despues.body as { socioAlDia: boolean }).socioAlDia).toBe(true);
  });

  it('cobrar dos veces la misma cuota responde 409', async () => {
    const id = await unaCuota('2026-08');
    await pagar(id, { medio: 'EFECTIVO' }).expect(201);

    await pagar(id, { medio: 'EFECTIVO' }).expect(409);
  });

  it('un medio que no existe se rechaza, y Webpay no se registra a mano', async () => {
    // `WEBPAY` lo escribe el callback de la pasarela (T43). Aceptarlo acá dejaría
    // marcar como cobrada por internet una cuota que nadie pagó.
    const id = await unaCuota('2026-08');

    await pagar(id, { medio: 'TRUEQUE' }).expect(400);
    await pagar(id, { medio: 'WEBPAY' }).expect(400);
  });

  it('una cuota que no existe responde 404', async () => {
    await pagar(999_999, { medio: 'EFECTIVO' }).expect(404);
  });

  it('solo el admin cobra en el mesón', async () => {
    const id = await unaCuota('2026-08');

    await request(app.getHttpServer())
      .post(`/api/admin/cuotas/${id}/pago`)
      .set('Cookie', cookieSocio)
      .send({ medio: 'EFECTIVO' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/admin/cuotas/${id}/pago`)
      .send({ medio: 'EFECTIVO' })
      .expect(401);
  });
});
