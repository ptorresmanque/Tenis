import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  ConceptoPago,
  EstadoCuota,
  EstadoPagoInscripcion,
  EstadoReserva,
  EstadoSocio,
  EstadoTransaccion,
  MedioPago,
  MedioPagoInscripcion,
  Superficie,
  TipoCuota,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T396 (`SPEC-panel.md` § Los pagos del club, F2–F5 y F9). Finanzas › Pagos junta en una lista
 * los pagos por Webpay y los cobros del mesón, con su resumen, su planilla y la ficha de cada uno.
 *
 * Todo pasa en febrero de 2039, que ninguna otra prueba usa: la lista es de todo el club.
 */
describe('Finanzas › Pagos (T396)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieGestor: string;
  let adminId: number;

  const DOMINIO = '@t396.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const NOMBRE_CANCHA = 'Cancha T396';
  const MARCA_TORNEO = 'Torneo T396';
  const APELLIDO = 'Pagador T396';
  const RANGO = { desde: '2039-02-01', hasta: '2039-02-28' };
  /** Un instante de febrero de 2039, en UTC. En febrero el club está en UTC-3. */
  const en = (dia: number, hora = '15:00') =>
    new Date(`2039-02-${String(dia).padStart(2, '0')}T${hora}:00.000Z`);

  const ids = {} as {
    reservaPagada: number;
    reservaCancelada: number;
    txAutorizada: number;
    txAnulada: number;
    txRechazada: number;
    txCuota: number;
    cuotaMeson: number;
    socioUsuario: number;
    inscripcion: number;
    torneo: number;
  };

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
      where: { referencia: { startsWith: 'T396-' } },
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

  const listar = (
    consulta: Record<string, string> = {},
    cookie = cookieAdmin,
  ) =>
    request(app.getHttpServer())
      .get('/api/admin/pagos')
      .query({ ...RANGO, ...consulta })
      .set('Cookie', cookie);

  const ficha = (origen: string, id: number, cookie = cookieAdmin) =>
    request(app.getHttpServer())
      .get(`/api/admin/pagos/${origen}/${id}`)
      .set('Cookie', cookie);

  /** Lo que se mira de cada respuesta. El JSON trae las fechas como texto. */
  interface Fila {
    origen: string;
    id: number;
    detalle: string;
    montoClp: number;
  }
  interface Listado {
    pagos: Fila[];
    total: number;
    pagina: number;
    porPagina: number;
    resumen: { cobradoClp: number; devueltoClp: number; porRevisar: number };
  }
  interface Ficha {
    fila: Fila;
    webpay: Record<string, unknown> | null;
    registradaPor: string | null;
    asociadoA: { tipo: string; id: number; enlace: string | null };
    devolucion: {
      permitida: boolean;
      motivo: string | null;
      enlace: string | null;
    } | null;
  }

  const lista = async (consulta: Record<string, string> = {}) =>
    (await listar(consulta).expect(200)).body as Listado;
  const laFicha = async (origen: string, id: number) =>
    (await ficha(origen, id).expect(200)).body as Ficha;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    await limpiar();

    const admin = await crearCuenta('admin', { esAdmin: true });
    adminId = admin.id;
    cookieAdmin = admin.cookie;
    cookieGestor = (await crearCuenta('gestor', { esGestor: true })).cookie;

    // Reservas de visitante: una pagada, una cancelada y una expirada.
    const cancha = await prisma.cancha.create({
      data: { nombre: NOMBRE_CANCHA, superficie: Superficie.ARCILLA },
    });
    const reserva = (
      folio: string,
      nombre: string,
      estado: EstadoReserva,
      dia: number,
    ) =>
      prisma.reserva.create({
        data: {
          folio,
          canchaId: cancha.id,
          // Las 10:00 del club.
          inicio: en(dia, '13:00'),
          fin: en(dia, '14:00'),
          estado,
          nombre,
          email: `${folio.toLowerCase()}${DOMINIO}`,
          telefono: '',
        },
      });
    const pagada = await reserva(
      'T396RPA',
      'Camila Pagada',
      EstadoReserva.CONFIRMADA,
      10,
    );
    const cancelada = await reserva(
      'T396RDV',
      'Bruno Devuelto',
      EstadoReserva.CANCELADA,
      11,
    );
    const expirada = await reserva(
      'T396REX',
      'Rita Rechazada',
      EstadoReserva.EXPIRADA,
      12,
    );
    ids.reservaPagada = pagada.id;
    ids.reservaCancelada = cancelada.id;

    const transaccion = (datos: {
      referencia: string;
      concepto: ConceptoPago;
      conceptoId: number;
      montoClp: number;
      estado: EstadoTransaccion;
      dia: number;
      extra?: object;
    }) =>
      prisma.transaccion.create({
        data: {
          referencia: datos.referencia,
          concepto: datos.concepto,
          conceptoId: datos.conceptoId,
          montoClp: datos.montoClp,
          estado: datos.estado,
          pasarela: 'webpay',
          tokenPasarela: `tok-${datos.referencia.toLowerCase()}`,
          creadaEn: en(datos.dia, '14:58'),
          confirmadaEn: en(datos.dia),
          ...datos.extra,
        },
      });

    ids.txAutorizada = (
      await transaccion({
        referencia: 'T396-A',
        concepto: ConceptoPago.RESERVA,
        conceptoId: pagada.id,
        montoClp: 12000,
        estado: EstadoTransaccion.AUTORIZADA,
        dia: 5,
        extra: {
          codigoAutorizacion: '1213',
          ultimosDigitos: '6623',
          tipoPago: 'VD',
          numeroCuotas: 0,
          codigoRespuesta: 0,
          requiereRevision: true,
        },
      })
    ).id;
    ids.txAnulada = (
      await transaccion({
        referencia: 'T396-B',
        concepto: ConceptoPago.RESERVA,
        conceptoId: cancelada.id,
        montoClp: 15000,
        estado: EstadoTransaccion.ANULADA,
        dia: 6,
        extra: { anuladaEn: en(7) },
      })
    ).id;
    ids.txRechazada = (
      await transaccion({
        referencia: 'T396-C',
        concepto: ConceptoPago.RESERVA,
        conceptoId: expirada.id,
        montoClp: 12000,
        estado: EstadoTransaccion.RECHAZADA,
        dia: 8,
        extra: {
          codigoRespuesta: -1,
          motivoRechazo: 'Tarjeta rechazada por el emisor',
        },
      })
    ).id;
    // Fuera del rango: el 2 de marzo.
    await prisma.transaccion.create({
      data: {
        referencia: 'T396-FUERA',
        concepto: ConceptoPago.RESERVA,
        conceptoId: pagada.id,
        montoClp: 12000,
        estado: EstadoTransaccion.AUTORIZADA,
        pasarela: 'webpay',
        creadaEn: new Date('2039-03-02T15:00:00.000Z'),
        confirmadaEn: new Date('2039-03-02T15:00:00.000Z'),
      },
    });

    // Una socia con una cuota pagada por Webpay y otra en el mesón.
    const socia = await prisma.usuario.create({
      data: {
        email: `socia${DOMINIO}`,
        nombre: 'Sofía',
        apellido: 'Socia',
        socio: {
          create: {
            numeroSocio: `T396-${Date.now()}`,
            estado: EstadoSocio.ACTIVO,
            fechaIngreso: new Date('2039-01-01'),
            alDiaHasta: new Date('2039-12-31'),
          },
        },
      },
      select: { id: true, socio: { select: { id: true } } },
    });
    ids.socioUsuario = socia.id;
    const cuotaWebpay = await prisma.cuota.create({
      data: {
        socioId: socia.socio!.id,
        tipo: TipoCuota.MENSUAL,
        periodo: '2039-02',
        montoClp: 30000,
        estado: EstadoCuota.PAGADA,
        medio: MedioPago.WEBPAY,
        pagadaEn: en(9),
      },
    });
    ids.txCuota = (
      await transaccion({
        referencia: 'T396-D',
        concepto: ConceptoPago.CUOTA,
        conceptoId: cuotaWebpay.id,
        montoClp: 30000,
        estado: EstadoTransaccion.AUTORIZADA,
        dia: 9,
      })
    ).id;
    await prisma.cuota.update({
      where: { id: cuotaWebpay.id },
      data: { transaccionId: ids.txCuota },
    });
    ids.cuotaMeson = (
      await prisma.cuota.create({
        data: {
          socioId: socia.socio!.id,
          tipo: TipoCuota.MENSUAL,
          periodo: '2039-03',
          montoClp: 30000,
          descuentoClp: 5000,
          estado: EstadoCuota.PAGADA,
          medio: MedioPago.EFECTIVO,
          pagadaEn: en(12),
          registradaPor: adminId,
        },
      })
    ).id;

    // Una inscripción pagada por transferencia.
    const cuarta = await prisma.categoriaJuego.findUniqueOrThrow({
      where: { nombre: '4ª' },
    });
    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA_TORNEO} de verano`,
        fechaInicio: new Date('2039-03-10'),
        fechaFin: new Date('2039-03-12'),
        cierreInscripcion: new Date('2039-03-01'),
        cuadros: {
          create: {
            categoriaJuegoId: cuarta.id,
            cupo: 8,
            montoInscripcionClp: 15000,
          },
        },
      },
      select: { id: true, cuadros: { select: { id: true } } },
    });
    ids.torneo = torneo.id;
    const jugador = await prisma.jugador.create({
      data: {
        nombre: 'Juan',
        apellido: APELLIDO,
        telefono: `+5699${Date.now() % 10_000_000}`,
      },
    });
    ids.inscripcion = (
      await prisma.inscripcionTorneo.create({
        data: {
          torneoId: torneo.id,
          torneoCategoriaId: torneo.cuadros[0].id,
          jugadorId: jugador.id,
          estadoPago: EstadoPagoInscripcion.PAGADA,
          medioPago: MedioPagoInscripcion.TRANSFERENCIA,
          inscritaEn: en(14),
        },
      })
    ).id;
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  describe('la lista', () => {
    it('**junta Webpay y el mesón en el rango, del más nuevo al más viejo** (F2)', async () => {
      const body = await lista();

      expect(body.total).toBe(6);
      expect(
        body.pagos.map((fila: { origen: string; id: number }) => [
          fila.origen,
          fila.id,
        ]),
      ).toEqual([
        ['inscripcion', ids.inscripcion],
        ['cuota', ids.cuotaMeson],
        ['webpay', ids.txCuota],
        ['webpay', ids.txRechazada],
        ['webpay', ids.txAnulada],
        ['webpay', ids.txAutorizada],
      ]);
    });

    it('**cada fila dice qué se pagó, quién, por dónde, cuánto y en qué quedó**', async () => {
      const body = await lista();
      const de = (origen: string, id: number) =>
        body.pagos.find(
          (fila: { origen: string; id: number }) =>
            fila.origen === origen && fila.id === id,
        );

      expect(de('webpay', ids.txAutorizada)?.detalle).toContain('T396RPA');
      expect(de('webpay', ids.txAutorizada)).toMatchObject({
        concepto: 'RESERVA',
        quien: 'Camila Pagada',
        esSocio: false,
        medio: 'WEBPAY',
        tipoPago: 'VD',
        montoClp: 12000,
        estado: 'AUTORIZADA',
        referencia: 'T396-A',
        porRevisar: true,
      });
      expect(de('webpay', ids.txCuota)).toMatchObject({
        concepto: 'CUOTA',
        detalle: 'Cuota feb 2039',
        quien: 'Sofía Socia',
        esSocio: true,
      });
      // El mesón: la cuota con su descuento, y la inscripción por el monto de su categoría.
      expect(de('cuota', ids.cuotaMeson)).toMatchObject({
        concepto: 'CUOTA',
        detalle: 'Cuota mar 2039',
        medio: 'EFECTIVO',
        montoClp: 25000,
        estado: 'MESON',
        referencia: null,
      });
      expect(de('inscripcion', ids.inscripcion)?.detalle).toContain(
        `${MARCA_TORNEO} de verano · 4ª`,
      );
      expect(de('inscripcion', ids.inscripcion)).toMatchObject({
        concepto: 'INSCRIPCION',
        quien: `Juan ${APELLIDO}`,
        medio: 'TRANSFERENCIA',
        montoClp: 15000,
        estado: 'MESON',
      });
    });

    it('**la cuota pagada por Webpay sale una sola vez, como transacción** (F2)', async () => {
      const body = await lista({ concepto: 'CUOTA' });

      expect(
        body.pagos.filter(
          (fila: { detalle: string }) => fila.detalle === 'Cuota feb 2039',
        ),
      ).toHaveLength(1);
      expect(body.total).toBe(2);
    });

    it('**el resumen suma lo cobrado, lo devuelto y lo que falta revisar** (F3)', async () => {
      const body = await lista();

      // Cobrado: lo autorizado (12.000 + 30.000) y el mesón (25.000 + 15.000).
      expect(body.resumen).toEqual({
        cobradoClp: 82000,
        devueltoClp: 15000,
        porRevisar: 1,
      });
    });

    it('**cada filtro acota la lista, y el resumen sigue al filtro** (F3)', async () => {
      const total = async (consulta: Record<string, string>) =>
        (await lista(consulta)).total;

      expect(await total({ concepto: 'RESERVA' })).toBe(3);
      expect(await total({ concepto: 'RESERVA,INSCRIPCION' })).toBe(4);
      expect(await total({ estado: 'ANULADA' })).toBe(1);
      expect(await total({ estado: 'MESON' })).toBe(2);
      expect(await total({ medio: 'WEBPAY' })).toBe(4);
      expect(await total({ medio: 'EFECTIVO' })).toBe(1);
      expect(await total({ porRevisar: 'true' })).toBe(1);
      // La búsqueda: la orden de compra, el folio y el nombre, sin mayúsculas.
      expect(await total({ q: 'T396-A' })).toBe(1);
      expect(await total({ q: 't396rdv' })).toBe(1);
      expect(await total({ q: 'camila' })).toBe(1);

      const body = await lista({ concepto: 'RESERVA' });
      expect(body.resumen).toEqual({
        cobradoClp: 12000,
        devueltoClp: 15000,
        porRevisar: 1,
      });
    });

    it('ordena por monto, y la página dos de seis filas viene vacía con el total', async () => {
      const body = await lista({
        orden: 'monto',
        direccion: 'asc',
      });
      expect(
        body.pagos.map((fila: { montoClp: number }) => fila.montoClp),
      ).toEqual([12000, 12000, 15000, 15000, 25000, 30000]);

      const segunda = await lista({ pagina: '2' });
      expect(segunda).toMatchObject({
        pagos: [],
        total: 6,
        pagina: 2,
        porPagina: 50,
      });
    });

    it('un filtro mal escrito responde 400, y no una lista vacía que parece la verdad', async () => {
      await listar({ desde: '2039-02-30' }).expect(400);
      await listar({ estado: 'PAGADA' }).expect(400);
      await listar({ orden: 'nombre' }).expect(400);
    });

    it('**nunca lleva el token de la pasarela** (F9)', async () => {
      const body = await lista();

      expect(JSON.stringify(body)).not.toContain('tok-t396');
    });
  });

  describe('la planilla', () => {
    it('**trae lo mismo que la lista con ese filtro, sin paginar** (F4)', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/api/admin/pagos.csv')
        .query({ ...RANGO, concepto: 'CUOTA' })
        .set('Cookie', cookieAdmin)
        .expect(200);

      expect(respuesta.headers['content-type']).toContain('text/csv');
      const lineas = respuesta.text.split('\r\n');
      expect(lineas).toHaveLength(3);
      expect(lineas[0]).toContain('Fecha;Concepto;Detalle');
      expect(respuesta.text).toContain('Cuota feb 2039');
      expect(respuesta.text).not.toContain('tok-t396');
    });
  });

  describe('la ficha', () => {
    it('**de Webpay: lo que dijo la pasarela, la reserva asociada y por qué no se devuelve** (F5)', async () => {
      const body = await laFicha('webpay', ids.txAutorizada);
      const enlace = `/administracion/reservas?fecha=2039-02-10&reserva=${ids.reservaPagada}`;

      expect(body.webpay).toMatchObject({
        referencia: 'T396-A',
        codigoAutorizacion: '1213',
        ultimosDigitos: '6623',
        tipoPago: 'VD',
        numeroCuotas: 0,
        codigoRespuesta: 0,
        requiereRevision: true,
      });
      expect(body.asociadoA).toMatchObject({
        tipo: 'RESERVA',
        id: ids.reservaPagada,
        enlace,
      });
      // La reserva sigue en pie: primero se cancela, desde la agenda (asunción 9).
      expect(body.devolucion).toMatchObject({ permitida: false, enlace });
      expect(body.devolucion.motivo).toMatch(/cancela/i);
      expect(JSON.stringify(body)).not.toContain('tok-t396');
    });

    it('**lo pagado que ya no está vigente se puede devolver**', async () => {
      const otra = await prisma.transaccion.create({
        data: {
          referencia: 'T396-G',
          concepto: ConceptoPago.RESERVA,
          conceptoId: ids.reservaCancelada,
          montoClp: 15000,
          estado: EstadoTransaccion.AUTORIZADA,
          pasarela: 'webpay',
          tokenPasarela: 'tok-t396-g',
          // Fuera del rango de la lista: no cambia las cuentas de arriba.
          creadaEn: new Date('2039-01-15T15:00:00.000Z'),
          confirmadaEn: new Date('2039-01-15T15:00:00.000Z'),
        },
      });

      const body = await laFicha('webpay', otra.id);

      expect(body.devolucion).toEqual({
        permitida: true,
        motivo: null,
        enlace: null,
      });
    });

    it('la ya devuelta no se devuelve otra vez', async () => {
      const body = await laFicha('webpay', ids.txAnulada);

      expect(body.devolucion.permitida).toBe(false);
      expect(body.devolucion.motivo).toMatch(/ya se devolvió/i);
    });

    it('la de una cuota enlaza a la persona, y no se devuelve mientras la cuota siga pagada con ella', async () => {
      const body = await laFicha('webpay', ids.txCuota);

      expect(body.asociadoA).toMatchObject({
        tipo: 'CUOTA',
        enlace: `/administracion/personas/${ids.socioUsuario}`,
      });
      expect(body.devolucion.permitida).toBe(false);
      expect(body.devolucion.motivo).toMatch(/anula/i);
    });

    it('**del mesón: el cobro, quién lo registró y lo asociado, sin devolución** (F5)', async () => {
      const cuota = await laFicha('cuota', ids.cuotaMeson);
      expect(cuota).toMatchObject({
        webpay: null,
        registradaPor: 'Persona admin De prueba',
        devolucion: null,
        asociadoA: {
          tipo: 'CUOTA',
          enlace: `/administracion/personas/${ids.socioUsuario}`,
        },
      });
      expect(cuota.fila).toMatchObject({
        medio: 'EFECTIVO',
        montoClp: 25000,
      });

      const inscripcion = await laFicha('inscripcion', ids.inscripcion);
      expect(inscripcion.asociadoA).toMatchObject({
        tipo: 'INSCRIPCION',
        enlace: `/administracion/torneos/${ids.torneo}`,
      });
    });

    it('un origen que no existe responde 400, y un id que no es de ese origen, 404', async () => {
      await ficha('pedido', 1).expect(400);
      await ficha('webpay', 999_999_999).expect(404);
      // La cuota pagada por Webpay no es un cobro del mesón: se mira como transacción.
      const pagadaPorWebpay = await prisma.cuota.findFirstOrThrow({
        where: { transaccionId: ids.txCuota },
      });
      await ficha('cuota', pagadaPorWebpay.id).expect(404);
    });
  });

  it('**es del admin: el gestor recibe 403 y sin sesión, 401**', async () => {
    await listar({}, cookieGestor).expect(403);
    await ficha('webpay', ids.txAutorizada, cookieGestor).expect(403);
    await request(app.getHttpServer())
      .get('/api/admin/pagos.csv')
      .query(RANGO)
      .set('Cookie', cookieGestor)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/admin/pagos')
      .query(RANGO)
      .expect(401);
  });
});
