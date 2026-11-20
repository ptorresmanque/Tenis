import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  ConceptoPago,
  EstadoCuota,
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
  EstadoReserva,
  EstadoSocio,
  EstadoTransaccion,
  MedioPago,
  MedioPagoInscripcion,
  Superficie,
  TipoCuota,
} from '../src/generated/prisma/client';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { AnulacionService } from '../src/pagos/anulacion.service';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T397 (`SPEC-panel.md` § Los pagos del club, F7 y F8). Desde la ficha de un pago, el admin lo
 * marca como revisado o lo devuelve. Devolver es solo para lo pagado que ya no está vigente
 * (asunción 9) y dentro de los 90 días que da Transbank (PQ1). Queda quién, cuándo y por qué.
 */
describe('Finanzas › Pagos: revisar y devolver (T397)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pasarela: PasarelaFake;
  let cookieAdmin: string;
  let cookieGestor: string;
  let adminId: number;
  let canchaId: number;
  let socioId: number;
  let cuadro: { torneoId: number; id: number };

  const DOMINIO = '@t397.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const NOMBRE_CANCHA = 'Cancha T397';
  const MARCA_TORNEO = 'Torneo T397';
  const APELLIDO = 'Pagador T397';
  const UN_DIA = 24 * 60 * 60 * 1000;

  interface Rechazo {
    motivo: string;
    message: string;
    enlace?: string | null;
  }

  const crearCuenta = async (
    sufijo: string,
    tipo: { esAdmin?: boolean; esGestor?: boolean },
  ) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'De prueba',
      });
    const usuario = await prisma.usuario.update({
      where: { email: `${sufijo}${DOMINIO}` },
      data: tipo,
      select: { id: true },
    });
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA });

    return {
      id: usuario.id,
      cookie: (respuesta.headers['set-cookie'] as unknown as string[])[0],
    };
  };

  const limpiar = async () => {
    await prisma.transaccion.deleteMany({
      where: { referencia: { startsWith: 'T397-' } },
    });
    await prisma.cancha.deleteMany({ where: { nombre: NOMBRE_CANCHA } });
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA_TORNEO } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
  };

  /** Un pago autorizado de verdad en la pasarela falsa: solo así lo puede devolver. */
  const unPago = async (
    concepto: ConceptoPago,
    conceptoId: number,
    cambios: {
      confirmadaEn?: Date;
      estado?: EstadoTransaccion;
      requiereRevision?: boolean;
    } = {},
  ) => {
    const referencia = `T397-${concepto}-${conceptoId}-${Math.random().toString(36).slice(2, 7)}`;
    const orden = await pasarela.iniciar({
      referencia,
      montoClp: 12000,
      urlRetorno: 'https://club.local/retorno',
    });
    await pasarela.confirmar(orden.tokenPasarela);

    return prisma.transaccion.create({
      data: {
        referencia,
        concepto,
        conceptoId,
        montoClp: 12000,
        estado: cambios.estado ?? EstadoTransaccion.AUTORIZADA,
        pasarela: 'webpay',
        tokenPasarela: orden.tokenPasarela,
        confirmadaEn: cambios.confirmadaEn ?? new Date(Date.now() - UN_DIA),
        requiereRevision: cambios.requiereRevision ?? false,
      },
    });
  };

  /** Cada una a otra hora: dos confirmadas en la misma cancha y hora chocan. */
  let horas = 0;
  const unaReserva = (estado: EstadoReserva) => {
    const inicio = new Date(
      Date.UTC(2039, 4, 10, 12) + horas++ * 60 * 60 * 1000,
    );
    return prisma.reserva.create({
      data: {
        folio: `T397${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        canchaId,
        inicio,
        fin: new Date(inicio.getTime() + 60 * 60 * 1000),
        estado,
        nombre: 'Visitante T397',
        email: `visitante${DOMINIO}`,
        telefono: '',
      },
    });
  };

  const unaCuota = (cambios: { estado: EstadoCuota; periodo: string }) =>
    prisma.cuota.create({
      data: {
        socioId,
        tipo: TipoCuota.MENSUAL,
        periodo: cambios.periodo,
        montoClp: 12000,
        estado: cambios.estado,
        medio: cambios.estado === EstadoCuota.PAGADA ? MedioPago.WEBPAY : null,
        pagadaEn: cambios.estado === EstadoCuota.PAGADA ? new Date() : null,
      },
    });

  const unaInscripcion = async (cambios: {
    estado?: EstadoInscripcionTorneo;
    estadoPago?: EstadoPagoInscripcion;
  }) => {
    const jugador = await prisma.jugador.create({
      data: {
        nombre: 'Juan',
        apellido: APELLIDO,
        telefono: `+569${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      },
    });
    return prisma.inscripcionTorneo.create({
      data: {
        torneoId: cuadro.torneoId,
        torneoCategoriaId: cuadro.id,
        jugadorId: jugador.id,
        estado: cambios.estado ?? EstadoInscripcionTorneo.INSCRITA,
        estadoPago: cambios.estadoPago ?? EstadoPagoInscripcion.PAGADA,
        medioPago: MedioPagoInscripcion.WEBPAY,
      },
    });
  };

  const devolver = (
    id: number,
    motivo: unknown = 'Pagó dos veces la misma hora.',
    cookie = cookieAdmin,
  ) =>
    request(app.getHttpServer())
      .post(`/api/admin/pagos/webpay/${id}/devolucion`)
      .set('Cookie', cookie)
      .send({ motivo });

  const revisar = (
    id: number,
    nota: unknown = 'Revisado con la cartola del banco.',
    cookie = cookieAdmin,
  ) =>
    request(app.getHttpServer())
      .post(`/api/admin/pagos/webpay/${id}/revision`)
      .set('Cookie', cookie)
      .send({ nota });

  const estadoDe = async (id: number) =>
    prisma.transaccion.findUniqueOrThrow({ where: { id } });

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
    await limpiar();

    const admin = await crearCuenta('admin', { esAdmin: true });
    adminId = admin.id;
    cookieAdmin = admin.cookie;
    cookieGestor = (await crearCuenta('gestor', { esGestor: true })).cookie;

    canchaId = (
      await prisma.cancha.create({
        data: { nombre: NOMBRE_CANCHA, superficie: Superficie.ARCILLA },
      })
    ).id;
    const socia = await prisma.usuario.create({
      data: {
        email: `socia${DOMINIO}`,
        nombre: 'Sofía',
        apellido: 'Socia',
        socio: {
          create: {
            numeroSocio: `T397-${Date.now()}`,
            estado: EstadoSocio.ACTIVO,
            fechaIngreso: new Date('2039-01-01'),
            alDiaHasta: new Date('2039-12-31'),
          },
        },
      },
      select: { socio: { select: { id: true } } },
    });
    socioId = socia.socio!.id;
    const cuarta = await prisma.categoriaJuego.findUniqueOrThrow({
      where: { nombre: '4ª' },
    });
    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA_TORNEO} de otoño`,
        fechaInicio: new Date('2039-05-10'),
        fechaFin: new Date('2039-05-12'),
        cierreInscripcion: new Date('2039-05-01'),
        cuadros: {
          create: {
            categoriaJuegoId: cuarta.id,
            cupo: 16,
            montoInscripcionClp: 12000,
          },
        },
      },
      select: { id: true, cuadros: { select: { id: true } } },
    });
    cuadro = { torneoId: torneo.id, id: torneo.cuadros[0].id };
  });

  beforeEach(() => pasarela.reiniciar());
  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  describe('devolver (F8)', () => {
    it('**de una reserva cancelada: la pasarela devuelve el total y queda quién, cuándo y por qué**', async () => {
      const reserva = await unaReserva(EstadoReserva.CANCELADA);
      const pago = await unPago(ConceptoPago.RESERVA, reserva.id);

      const respuesta = await devolver(pago.id).expect(201);

      expect(pasarela.anulaciones).toEqual([
        { tokenPasarela: pago.tokenPasarela, montoClp: 12000 },
      ]);
      expect(await estadoDe(pago.id)).toMatchObject({
        estado: EstadoTransaccion.ANULADA,
        anuladaPor: adminId,
        motivoAnulacion: 'Pagó dos veces la misma hora.',
      });
      expect((await estadoDe(pago.id)).anuladaEn).toBeInstanceOf(Date);
      // Responde la ficha al día, con quién la devolvió.
      expect(
        (respuesta.body as { webpay: Record<string, unknown> }).webpay,
      ).toMatchObject({
        estado: 'ANULADA',
        anuladaPorNombre: 'Persona admin De prueba',
      });
    });

    it('**devolver dos veces no paga dos veces**', async () => {
      const reserva = await unaReserva(EstadoReserva.EXPIRADA);
      const pago = await unPago(ConceptoPago.RESERVA, reserva.id);

      await devolver(pago.id).expect(201);
      const segunda = await devolver(pago.id).expect(409);

      expect(pasarela.anulaciones).toHaveLength(1);
      expect((segunda.body as Rechazo).message).toMatch(/ya se devolvió/i);
    });

    it('**una reserva todavía vigente da SIGUE_VIGENTE, con qué hacer y adónde ir**', async () => {
      const reserva = await unaReserva(EstadoReserva.CONFIRMADA);
      const pago = await unPago(ConceptoPago.RESERVA, reserva.id);

      const respuesta = await devolver(pago.id).expect(409);

      expect(respuesta.body as Rechazo).toMatchObject({
        motivo: 'SIGUE_VIGENTE',
        enlace: expect.stringContaining(`reserva=${reserva.id}`) as unknown,
      });
      expect((respuesta.body as Rechazo).message).toMatch(/cancélala/);
      expect(pasarela.anulaciones).toHaveLength(0);
      expect((await estadoDe(pago.id)).estado).toBe(
        EstadoTransaccion.AUTORIZADA,
      );
    });

    it('**una cuota anulada, o pagada con otro cobro, se devuelve; la pagada con este, no**', async () => {
      const anulada = await unaCuota({
        estado: EstadoCuota.ANULADA,
        periodo: '2039-06',
      });
      const deLaAnulada = await unPago(ConceptoPago.CUOTA, anulada.id);
      await devolver(deLaAnulada.id).expect(201);

      // Un pago duplicado: la cuota quedó pagada con otro cobro.
      const pagada = await unaCuota({
        estado: EstadoCuota.PAGADA,
        periodo: '2039-07',
      });
      const elQueQuedo = await unPago(ConceptoPago.CUOTA, pagada.id);
      const duplicado = await unPago(ConceptoPago.CUOTA, pagada.id);
      await prisma.cuota.update({
        where: { id: pagada.id },
        data: { transaccionId: elQueQuedo.id },
      });
      await devolver(duplicado.id).expect(201);

      // Una cuota pagada no se anula en el panel (`AjustesService`): la ficha no manda a hacerlo.
      const vigente = await devolver(elQueQuedo.id).expect(409);
      expect(vigente.body as Rechazo).toMatchObject({
        motivo: 'SIGUE_VIGENTE',
        enlace: null,
      });
      expect((vigente.body as Rechazo).message).toMatch(/en el club/);
      expect((vigente.body as Rechazo).message).not.toMatch(/^Primero anula/);
    });

    it('**un pago marcado para revisión no dejó nada vigente: se devuelve aunque la reserva siga** (revisión, T400)', async () => {
      // La diferencia de un cambio que no se aplicó y cuya devolución automática falló (T90): la
      // reserva sigue confirmada en su hora, con su compra. Cancelarla sería quitarle la cancha.
      const reserva = await unaReserva(EstadoReserva.CONFIRMADA);
      const laCompra = await unPago(ConceptoPago.RESERVA, reserva.id);
      const laDiferencia = await unPago(ConceptoPago.RESERVA, reserva.id, {
        requiereRevision: true,
      });

      await devolver(laDiferencia.id).expect(201);
      expect((await estadoDe(laDiferencia.id)).estado).toBe(
        EstadoTransaccion.ANULADA,
      );
      // La compra sí sigue vigente.
      await devolver(laCompra.id).expect(409);
    });

    it('**el pago de una inscripción que ya estaba pagada por otra vía se devuelve sin retirarla** (revisión, T400)', async () => {
      const inscripcion = await unaInscripcion({});
      const duplicado = await unPago(
        ConceptoPago.INSCRIPCION_TORNEO,
        inscripcion.id,
        { requiereRevision: true },
      );

      await devolver(duplicado.id).expect(201);
    });

    it('**una inscripción retirada o rechazada se devuelve; la vigente, no**', async () => {
      const retirada = await unaInscripcion({
        estado: EstadoInscripcionTorneo.RETIRADA,
      });
      await devolver(
        (await unPago(ConceptoPago.INSCRIPCION_TORNEO, retirada.id)).id,
      ).expect(201);

      const rechazada = await unaInscripcion({
        estadoPago: EstadoPagoInscripcion.RECHAZADA,
      });
      await devolver(
        (await unPago(ConceptoPago.INSCRIPCION_TORNEO, rechazada.id)).id,
      ).expect(201);

      const vigente = await unaInscripcion({});
      const respuesta = await devolver(
        (await unPago(ConceptoPago.INSCRIPCION_TORNEO, vigente.id)).id,
      ).expect(409);
      expect((respuesta.body as Rechazo).motivo).toBe('SIGUE_VIGENTE');
      expect((respuesta.body as Rechazo).message).toMatch(/retírala/);
    });

    it('un pago que no se autorizó no se devuelve', async () => {
      const reserva = await unaReserva(EstadoReserva.EXPIRADA);
      const pago = await unPago(ConceptoPago.RESERVA, reserva.id, {
        estado: EstadoTransaccion.RECHAZADA,
      });

      const respuesta = await devolver(pago.id).expect(409);

      expect((respuesta.body as Rechazo).motivo).toBe('NO_AUTORIZADA');
      expect(pasarela.anulaciones).toHaveLength(0);
    });

    it('**pasados 90 días desde el pago, Transbank ya no lo devuelve, y la ficha lo dice** (PQ1)', async () => {
      const reserva = await unaReserva(EstadoReserva.CANCELADA);
      const pago = await unPago(ConceptoPago.RESERVA, reserva.id, {
        confirmadaEn: new Date(Date.now() - 91 * UN_DIA),
      });

      const respuesta = await devolver(pago.id).expect(409);
      expect((respuesta.body as Rechazo).motivo).toBe('FUERA_DE_PLAZO');
      expect((respuesta.body as Rechazo).message).toMatch(/90 días/);

      const ficha = await request(app.getHttpServer())
        .get(`/api/admin/pagos/webpay/${pago.id}`)
        .set('Cookie', cookieAdmin)
        .expect(200);
      expect(
        (ficha.body as { devolucion: { permitida: boolean } }).devolucion
          .permitida,
      ).toBe(false);
    });

    it('**si la pasarela no devuelve, se dice tal cual y el pago queda como estaba**', async () => {
      const reserva = await unaReserva(EstadoReserva.CANCELADA);
      const pago = await unPago(ConceptoPago.RESERVA, reserva.id);
      pasarela.fallarAlAnular = true;

      const respuesta = await devolver(pago.id).expect(502);

      const { message } = respuesta.body as Rechazo;
      expect(message).toMatch(/^Webpay no hizo la devolución/);
      // El detalle de Transbank, tal cual, al final (F8).
      expect(message).toContain('La pasarela no aceptó la devolución.');
      expect(await estadoDe(pago.id)).toMatchObject({
        estado: EstadoTransaccion.AUTORIZADA,
        anuladaEn: null,
        anuladaPor: null,
        motivoAnulacion: null,
      });
    });

    it('**si otro admin la devolvió entremedio, da 409 y no «devuelto»** (revisión, T400)', async () => {
      const reserva = await unaReserva(EstadoReserva.CANCELADA);
      const pago = await unPago(ConceptoPago.RESERVA, reserva.id);
      // La regla la vio autorizada, pero `anular` la encontró ya devuelta (compare-and-set).
      jest
        .spyOn(app.get(AnulacionService), 'anular')
        .mockResolvedValueOnce(false);

      const respuesta = await devolver(pago.id).expect(409);

      expect((respuesta.body as Rechazo).motivo).toBe('YA_DEVUELTO');
    });

    it('**si falla otra cosa que la pasarela, no se sabe si se devolvió: lo dice, sin detalles internos, y lo deja por revisar** (revisión, T400)', async () => {
      const reserva = await unaReserva(EstadoReserva.CANCELADA);
      const pago = await unPago(ConceptoPago.RESERVA, reserva.id);
      // Como el commit de una transacción de Prisma que venció mientras Transbank respondía.
      jest
        .spyOn(app.get(AnulacionService), 'anular')
        .mockRejectedValueOnce(
          new Error('Transaction already closed: /srv/fedal/x'),
        );

      const respuesta = await devolver(pago.id).expect(500);

      const { message } = respuesta.body as Rechazo;
      expect(message).toMatch(/portal de Transbank/);
      expect(message).not.toContain('Transaction');
      expect((await estadoDe(pago.id)).requiereRevision).toBe(true);
    });

    it('el motivo es obligatorio, de hasta 200 caracteres', async () => {
      const reserva = await unaReserva(EstadoReserva.CANCELADA);
      const pago = await unPago(ConceptoPago.RESERVA, reserva.id);

      await devolver(pago.id, '   ').expect(400);
      await devolver(pago.id, 'x'.repeat(201)).expect(400);
      expect(pasarela.anulaciones).toHaveLength(0);
    });
  });

  describe('marcar como revisado (F7)', () => {
    it('**guarda la nota, quién y cuándo, y el pago sale de «por revisar»**', async () => {
      const reserva = await unaReserva(EstadoReserva.CONFIRMADA);
      const pago = await unPago(ConceptoPago.RESERVA, reserva.id, {
        requiereRevision: true,
      });

      await revisar(pago.id).expect(201);

      const revisado = await estadoDe(pago.id);
      expect(revisado).toMatchObject({
        revisadaPor: adminId,
        notaRevision: 'Revisado con la cartola del banco.',
        // La marca de la pasarela queda: dice que algo no cuadró. Lo que cambia es que ya se miró.
        requiereRevision: true,
      });
      expect(revisado.revisadaEn).toBeInstanceOf(Date);

      const lista = await request(app.getHttpServer())
        .get('/api/admin/pagos')
        .query({
          desde: '2026-01-01',
          hasta: '2099-12-31',
          q: pago.referencia,
          porRevisar: 'true',
        })
        .set('Cookie', cookieAdmin)
        .expect(200);
      expect((lista.body as { total: number }).total).toBe(0);
    });

    it('la nota es obligatoria, de hasta 200 caracteres', async () => {
      const reserva = await unaReserva(EstadoReserva.CONFIRMADA);
      const pago = await unPago(ConceptoPago.RESERVA, reserva.id, {
        requiereRevision: true,
      });

      const sinNota = await revisar(pago.id, '').expect(400);
      expect((sinNota.body as Rechazo).message).toBe(
        'La nota es obligatoria y tiene hasta 200 caracteres.',
      );
      await revisar(pago.id, 'x'.repeat(201)).expect(400);
    });

    it('**un pago que no pide revisión, o que ya se revisó, da 409**', async () => {
      const reserva = await unaReserva(EstadoReserva.CONFIRMADA);
      const sinMarca = await unPago(ConceptoPago.RESERVA, reserva.id);
      await revisar(sinMarca.id).expect(409);

      const conMarca = await unPago(ConceptoPago.RESERVA, reserva.id, {
        requiereRevision: true,
      });
      await revisar(conMarca.id).expect(201);
      await revisar(conMarca.id, 'Otra nota.').expect(409);
      expect((await estadoDe(conMarca.id)).notaRevision).toBe(
        'Revisado con la cartola del banco.',
      );
    });
  });

  it('**es del admin: el gestor recibe 403 en las dos acciones**', async () => {
    const reserva = await unaReserva(EstadoReserva.CANCELADA);
    const pago = await unPago(ConceptoPago.RESERVA, reserva.id, {
      requiereRevision: true,
    });

    await devolver(pago.id, 'Motivo.', cookieGestor).expect(403);
    await revisar(pago.id, 'Nota.', cookieGestor).expect(403);
    expect(pasarela.anulaciones).toHaveLength(0);
  });
});
