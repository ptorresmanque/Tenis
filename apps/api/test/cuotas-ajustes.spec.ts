import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  EstadoCuota,
  EstadoSocio,
  TipoCuota,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T44: los casos que no son el camino feliz, y quién debe.
 *
 * **Anular y condonar no son lo mismo**, y la diferencia es la que este archivo cuida:
 * anular es deshacer una emisión equivocada —la cuota del socio que se había retirado—
 * y condonar es cobrar cero por una razón —el que estuvo lesionado seis meses—. La
 * condonada **sí extiende la vigencia**; la anulada no, porque nunca debió existir.
 */
describe('Descuentos, anulación y morosidad', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;
  let socioId: number;
  let adminId: number;

  const DOMINIO = '@ajustes.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'Con ajustes',
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

  const crearSocio = async (sufijo: string, alDiaHasta = '2026-07-31') => {
    const usuarioId = await crearCuenta(sufijo);
    const socio = await prisma.socio.create({
      data: {
        usuarioId,
        numeroSocio: `AJU-${sufijo}-${Date.now()}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2020-01-01T00:00:00.000Z'),
        alDiaHasta: new Date(`${alDiaHasta}T00:00:00.000Z`),
      },
      select: { id: true },
    });

    return socio.id;
  };

  const unaCuota = async (periodo = '2026-08', deSocio = socioId) => {
    const cuota = await prisma.cuota.create({
      data: {
        socioId: deSocio,
        tipo: TipoCuota.MENSUAL,
        periodo,
        montoClp: 25000,
      },
      select: { id: true },
    });

    return cuota.id;
  };

  const ajustar = (id: number, cuerpo: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/admin/cuotas/${id}`)
      .set('Cookie', cookieAdmin)
      .send(cuerpo);

  const alDiaHasta = async (deSocio = socioId) => {
    const socio = await prisma.socio.findUniqueOrThrow({
      where: { id: deSocio },
      select: { alDiaHasta: true },
    });

    return socio.alDiaHasta.toISOString().slice(0, 10);
  };

  const morosos = async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/admin/cuotas/morosos')
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as {
      socioId: number;
      nombre: string;
      numeroSocio: string;
      cuotasImpagas: number;
      deudaClp: number;
      desdePeriodo: string;
    }[];
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

    adminId = await crearCuenta('jefe', true);
    await crearCuenta('mirona');
    cookieAdmin = await entrar('jefe');
    cookieSocio = await entrar('mirona');

    socioId = await crearSocio('socia');
  });

  it('**el descuento sin motivo lo rechaza el servidor, no la pantalla**', async () => {
    // Un descuento sin motivo no se distingue de un error de tipeo seis meses después,
    // que es justo cuando alguien pregunta por qué esa cuota es más barata.
    const id = await unaCuota();

    await ajustar(id, { descuentoClp: 10000 }).expect(400);
    await ajustar(id, { descuentoClp: 10000, motivo: '  ' }).expect(400);
  });

  it('con motivo, el descuento se guarda y baja lo que se debe', async () => {
    const id = await unaCuota();

    await ajustar(id, {
      descuentoClp: 10000,
      motivo: 'Estuvo lesionada medio mes',
    }).expect(200);

    const cuota = await prisma.cuota.findUniqueOrThrow({ where: { id } });
    expect(cuota.descuentoClp).toBe(10000);
    expect(cuota.motivoDescuento).toBe('Estuvo lesionada medio mes');
    expect(cuota.estado).toBe(EstadoCuota.PENDIENTE);
  });

  it('**un descuento parcial no extiende la vigencia: la cuota sigue sin pagarse**', async () => {
    // Rebajar no es cobrar. Sin esta distinción, el club le hace un descuento a un
    // socio y le regala el mes entero sin darse cuenta.
    const id = await unaCuota('2026-08');

    await ajustar(id, { descuentoClp: 10000, motivo: 'Acuerdo' }).expect(200);

    expect(await alDiaHasta()).toBe('2026-07-31');
  });

  it('un descuento mayor que la cuota se rechaza', async () => {
    // Sin esto, el club le termina debiendo plata a un socio por una cuota.
    const id = await unaCuota();

    await ajustar(id, {
      descuentoClp: 30000,
      motivo: 'Se pasó de generoso',
    }).expect(400);
  });

  it('**condonar la deja pagada y sí extiende la vigencia**', async () => {
    // Es un descuento del 100% con su motivo: el club decidió no cobrarle, pero el mes
    // se lo dio igual.
    const id = await unaCuota('2026-08');

    await ajustar(id, {
      condonar: true,
      motivo: 'Hizo el arbitraje del torneo',
    }).expect(200);

    const cuota = await prisma.cuota.findUniqueOrThrow({ where: { id } });
    expect(cuota.estado).toBe(EstadoCuota.PAGADA);
    expect(cuota.descuentoClp).toBe(25000);
    expect(cuota.medio).toBeNull();

    expect(await alDiaHasta()).toBe('2026-08-31');
  });

  it('**anular no extiende la vigencia: esa cuota nunca debió existir**', async () => {
    const id = await unaCuota('2026-08');

    await ajustar(id, {
      anular: true,
      motivo: 'Se emitió después de que se retirara',
    }).expect(200);

    const cuota = await prisma.cuota.findUniqueOrThrow({ where: { id } });
    expect(cuota.estado).toBe(EstadoCuota.ANULADA);
    expect(cuota.anuladaPor).toBe(adminId);
    expect(cuota.motivoAnulacion).toContain('retirara');

    expect(await alDiaHasta()).toBe('2026-07-31');
  });

  it('anular no borra la fila: una cuota que desaparece no la explica nadie', async () => {
    const id = await unaCuota();

    await ajustar(id, { anular: true, motivo: 'Duplicada' }).expect(200);

    expect(await prisma.cuota.count({ where: { id } })).toBe(1);
  });

  it('**anular una cuota ya pagada se rechaza**', async () => {
    // Si el cobro fue un error, el camino es la devolución, que el club hace por caja.
    // Automatizar la reversa de un cobro autorizado es una operación de dinero que
    // nadie pidió.
    const id = await unaCuota();
    await prisma.cuota.update({
      where: { id },
      data: { estado: EstadoCuota.PAGADA },
    });

    await ajustar(id, { anular: true, motivo: 'Me equivoqué' }).expect(409);
  });

  it('anular tampoco necesita motivo inventado, pero sí uno', async () => {
    const id = await unaCuota();

    await ajustar(id, { anular: true }).expect(400);
  });

  it('**el moroso se cuenta por cuotas impagas, no restando fechas**', async () => {
    // Un socio con agosto impago y septiembre pagado debe **una**, no cero ni dos.
    // Restar `alDiaHasta` contra hoy diría cualquier cosa.
    const agosto = await unaCuota('2026-08');
    const septiembre = await unaCuota('2026-09');
    await prisma.cuota.update({
      where: { id: septiembre },
      data: { estado: EstadoCuota.PAGADA },
    });
    expect(agosto).toBeGreaterThan(0);

    const lista = await morosos();
    const suyo = lista.find((m) => m.socioId === socioId);

    expect(suyo).toMatchObject({ cuotasImpagas: 1, deudaClp: 25000 });
    expect(suyo?.desdePeriodo).toBe('2026-08');
  });

  it('la deuda del moroso descuenta sus descuentos', async () => {
    const id = await unaCuota('2026-08');
    await ajustar(id, { descuentoClp: 10000, motivo: 'Acuerdo' }).expect(200);

    const suyo = (await morosos()).find((m) => m.socioId === socioId);

    expect(suyo?.deudaClp).toBe(15000);
  });

  it('quien no debe nada no aparece en la lista', async () => {
    const alDia = await crearSocio('aldia');
    const id = await unaCuota('2026-08', alDia);
    await prisma.cuota.update({
      where: { id },
      data: { estado: EstadoCuota.PAGADA },
    });

    expect((await morosos()).some((m) => m.socioId === alDia)).toBe(false);
  });

  it('las anuladas no cuentan como deuda', async () => {
    const id = await unaCuota('2026-08');
    await ajustar(id, { anular: true, motivo: 'Duplicada' }).expect(200);

    expect((await morosos()).some((m) => m.socioId === socioId)).toBe(false);
  });

  it('la lista viene del que más debe al que menos', async () => {
    // El club atiende de arriba hacia abajo: el orden es la mitad de la utilidad.
    const poco = await crearSocio('poco');
    await unaCuota('2026-08', poco);

    const mucho = await crearSocio('mucho');
    await unaCuota('2026-07', mucho);
    await unaCuota('2026-08', mucho);

    const lista = await morosos();
    const posiciones = lista.map((m) => m.socioId);

    expect(posiciones.indexOf(mucho)).toBeLessThan(posiciones.indexOf(poco));
  });

  it('solo el admin ajusta cuotas y ve la morosidad', async () => {
    const id = await unaCuota();

    await request(app.getHttpServer())
      .patch(`/api/admin/cuotas/${id}`)
      .set('Cookie', cookieSocio)
      .send({ anular: true, motivo: 'x' })
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/admin/cuotas/morosos')
      .expect(401);
  });
});
