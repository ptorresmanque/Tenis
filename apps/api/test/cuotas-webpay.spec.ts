import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  EstadoCuota,
  EstadoSocio,
  EstadoTransaccion,
  TipoCuota,
} from '../src/generated/prisma/client';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T43: el socio mira lo que debe y lo paga en línea.
 *
 * Es la pantalla que evita la conversación incómoda en el mesón, y la razón por la que
 * este módulo se hizo completo y no creíble.
 *
 * Lo que más se cuida acá es **el callback duplicado**. Las pasarelas reintentan, y la
 * persona además recarga la página de vuelta: si esa vuelta se aplica dos veces, la
 * cuota se cobra dos veces o `alDiaHasta` se extiende de más. La idempotencia ya está
 * resuelta en `pagos` y este archivo comprueba que `cuotas` no la rompa.
 */
describe('El socio paga su cuota en línea', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pasarela: PasarelaFake;
  let cookieSocia: string;
  let cookieOtra: string;
  let socioId: number;

  const DOMINIO = '@webpay.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  const crearCuenta = async (sufijo: string) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'Que paga',
      });

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email: `${sufijo}${DOMINIO}` },
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

  const crearSocio = async (sufijo: string) => {
    const usuarioId = await crearCuenta(sufijo);
    const socio = await prisma.socio.create({
      data: {
        usuarioId,
        numeroSocio: `WEB-${sufijo}-${Date.now()}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2020-01-01T00:00:00.000Z'),
        alDiaHasta: new Date('2026-07-31T00:00:00.000Z'),
      },
      select: { id: true },
    });

    return socio.id;
  };

  const unaCuota = async (periodo = '2026-08', tipo = TipoCuota.MENSUAL) => {
    const cuota = await prisma.cuota.create({
      data: { socioId, tipo, periodo, montoClp: 25000 },
      select: { id: true },
    });

    return cuota.id;
  };

  /** El token que la pasarela le dio a esa cuota. */
  const tokenDe = async (cuotaId: number) => {
    const transaccion = await prisma.transaccion.findFirstOrThrow({
      where: { concepto: 'CUOTA', conceptoId: cuotaId },
      select: { tokenPasarela: true },
    });

    return transaccion.tokenPasarela!;
  };

  const volverDeWebpay = (token: string) =>
    request(app.getHttpServer()).get(`/api/cuotas/retorno?token_ws=${token}`);

  const miEstadoDeCuenta = async (cookie: string) => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/cuotas/mias')
      .set('Cookie', cookie)
      .expect(200);

    return respuesta.body as {
      cuotas: { id: number; tipo: string; periodo: string; estado: string }[];
      deudaClp: number;
    };
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
    pasarela = app.get(PasarelaPago);
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    pasarela.reiniciar();
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    socioId = await crearSocio('socia');
    await crearSocio('otra');
    cookieSocia = await entrar('socia');
    cookieOtra = await entrar('otra');
  });

  it('**el socio ve lo que debe, y cuánto**', async () => {
    await unaCuota('2026-07');
    await unaCuota('2026-08');

    const cuenta = await miEstadoDeCuenta(cookieSocia);

    expect(cuenta.cuotas).toHaveLength(2);
    expect(cuenta.deudaClp).toBe(50000);
  });

  it('la deuda descuenta lo pagado y lo condonado', async () => {
    const pagada = await unaCuota('2026-07');
    await prisma.cuota.update({
      where: { id: pagada },
      data: { estado: EstadoCuota.PAGADA },
    });
    await unaCuota('2026-08');

    expect((await miEstadoDeCuenta(cookieSocia)).deudaClp).toBe(25000);
  });

  it('un usuario sin ficha de socio ve una cuenta vacía, no un error', async () => {
    // Quien todavía no es socio entra al club por la misma pantalla, y un 403 se lee
    // como que el sistema está roto.
    const usuarioId = await crearCuenta('visitante');
    expect(usuarioId).toBeGreaterThan(0);

    const cuenta = await miEstadoDeCuenta(await entrar('visitante'));

    expect(cuenta.cuotas).toEqual([]);
    expect(cuenta.deudaClp).toBe(0);
  });

  it('**pagar en línea deja la cuota pagada y extiende la vigencia**', async () => {
    const id = await unaCuota('2026-08');

    const inicio = await request(app.getHttpServer())
      .post(`/api/cuotas/${id}/pagar`)
      .set('Cookie', cookieSocia)
      .expect(201);

    expect(
      (inicio.body as { urlRedireccion: string }).urlRedireccion,
    ).toBeTruthy();

    await volverDeWebpay(await tokenDe(id)).expect(302);

    const cuota = await prisma.cuota.findUniqueOrThrow({ where: { id } });
    expect(cuota.estado).toBe(EstadoCuota.PAGADA);
    expect(cuota.medio).toBe('WEBPAY');
    expect(cuota.transaccionId).not.toBeNull();

    const socio = await prisma.socio.findUniqueOrThrow({
      where: { id: socioId },
    });
    expect(socio.alDiaHasta.toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('**el callback duplicado no cobra dos veces ni extiende de más**', async () => {
    // Las pasarelas reintentan y la persona recarga la vuelta. Es el mismo riesgo que
    // T18 resolvió para las reservas, y este test comprueba que `cuotas` no lo rompa.
    const id = await unaCuota('2026-08');
    await request(app.getHttpServer())
      .post(`/api/cuotas/${id}/pagar`)
      .set('Cookie', cookieSocia)
      .expect(201);

    const token = await tokenDe(id);
    await volverDeWebpay(token).expect(302);
    await volverDeWebpay(token).expect(302);

    const transacciones = await prisma.transaccion.count({
      where: { concepto: 'CUOTA', conceptoId: id },
    });
    expect(transacciones).toBe(1);

    const renglones = await prisma.cambioSocio.count({
      where: { socioId, campo: 'alDiaHasta' },
    });
    expect(renglones).toBe(1);

    const socio = await prisma.socio.findUniqueOrThrow({
      where: { id: socioId },
    });
    expect(socio.alDiaHasta.toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('**si el club la cobró en el mesón mientras la persona pagaba, no se pisa el medio**', async () => {
    // Pasa de verdad: el socio abre Webpay desde el auto y llama al club a la vez. La
    // idempotencia de `pagos` no cubre esto —son dos cobros distintos— y lo que no
    // puede pasar es que el registro pierda cuál fue el bueno. El dinero de más lo
    // resuelve una persona, y para eso tiene que quedar rastro de los dos.
    const id = await unaCuota('2026-08');
    await request(app.getHttpServer())
      .post(`/api/cuotas/${id}/pagar`)
      .set('Cookie', cookieSocia)
      .expect(201);

    // El club cobra en el mesón antes de que vuelva de la pasarela.
    await prisma.cuota.update({
      where: { id },
      data: {
        estado: EstadoCuota.PAGADA,
        medio: 'EFECTIVO',
        pagadaEn: new Date(),
      },
    });

    await volverDeWebpay(await tokenDe(id)).expect(302);

    const cuota = await prisma.cuota.findUniqueOrThrow({ where: { id } });
    expect(cuota.medio).toBe('EFECTIVO');
    expect(cuota.transaccionId).toBeNull();

    // Y la transacción sí quedó autorizada: hay plata cobrada que el club tiene que
    // devolver, y esconderla sería peor.
    const transaccion = await prisma.transaccion.findFirstOrThrow({
      where: { concepto: 'CUOTA', conceptoId: id },
    });
    expect(transaccion.estado).toBe(EstadoTransaccion.AUTORIZADA);
  });

  it('la incorporación también se paga en línea, y no extiende la vigencia', async () => {
    const id = await unaCuota('2026-08', TipoCuota.INCORPORACION);

    await request(app.getHttpServer())
      .post(`/api/cuotas/${id}/pagar`)
      .set('Cookie', cookieSocia)
      .expect(201);
    await volverDeWebpay(await tokenDe(id)).expect(302);

    const cuota = await prisma.cuota.findUniqueOrThrow({ where: { id } });
    expect(cuota.estado).toBe(EstadoCuota.PAGADA);

    const socio = await prisma.socio.findUniqueOrThrow({
      where: { id: socioId },
    });
    expect(socio.alDiaHasta.toISOString().slice(0, 10)).toBe('2026-07-31');
  });

  it('**un socio no puede pagar la cuota de otro**', async () => {
    const id = await unaCuota('2026-08');

    await request(app.getHttpServer())
      .post(`/api/cuotas/${id}/pagar`)
      .set('Cookie', cookieOtra)
      .expect(403);
  });

  it('una cuota ya pagada no se puede volver a cobrar', async () => {
    const id = await unaCuota('2026-08');
    await prisma.cuota.update({
      where: { id },
      data: { estado: EstadoCuota.PAGADA },
    });

    await request(app.getHttpServer())
      .post(`/api/cuotas/${id}/pagar`)
      .set('Cookie', cookieSocia)
      .expect(409);
  });

  it('si la pasarela rechaza, la cuota sigue pendiente', async () => {
    // La persona vuelve sin haber pagado: lo que no puede pasar es que la cuota quede
    // marcada y el club deje de cobrarla.
    const id = await unaCuota('2026-08');
    await request(app.getHttpServer())
      .post(`/api/cuotas/${id}/pagar`)
      .set('Cookie', cookieSocia)
      .expect(201);

    const token = await tokenDe(id);
    pasarela.respuesta = 'RECHAZADA';

    await volverDeWebpay(token).expect(302);

    const cuota = await prisma.cuota.findUniqueOrThrow({ where: { id } });
    expect(cuota.estado).toBe(EstadoCuota.PENDIENTE);

    const transaccion = await prisma.transaccion.findFirstOrThrow({
      where: { concepto: 'CUOTA', conceptoId: id },
    });
    expect(transaccion.estado).toBe(EstadoTransaccion.RECHAZADA);
  });

  it('sin sesión no se ve ni se paga nada', async () => {
    const id = await unaCuota('2026-08');

    await request(app.getHttpServer()).get('/api/cuotas/mias').expect(401);
    await request(app.getHttpServer())
      .post(`/api/cuotas/${id}/pagar`)
      .expect(401);
  });
});
