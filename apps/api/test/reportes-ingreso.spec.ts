import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  ConceptoPago,
  EstadoCuota,
  EstadoReserva,
  EstadoTransaccion,
  MedioPago,
  Superficie,
  TipoCuota,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T57: el ingreso del club por período.
 *
 * Los cortes se prueban solos en `ingreso.spec.ts`. Lo que se prueba acá es lo que
 * decide si el reporte sirve o miente: **a qué fecha se atribuye cada peso** y **de qué
 * fuentes sale**. Un reporte de ingresos equivocado no se cae: se usa para decidir una
 * inversión.
 */
describe('GET /api/admin/reportes/ingreso', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;
  let socioId: number;
  let canchaTechada: number;
  let canchaAbierta: number;

  const DOMINIO = '@ingreso.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Rep';

  interface Reporte {
    desde: string;
    hasta: string;
    corte: string;
    totalClp: number;
    filas: { etiqueta: string; montoClp: number }[];
    cuotasImpagasClp: number;
    calculadoEn: string;
  }

  const alguien = async (sufijo: string, esAdmin: boolean) => {
    const email = `${sufijo}${DOMINIO}`;

    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ email, contrasena: CONTRASENA, nombre: sufijo, apellido: 'Rep' })
      .expect(201);

    const usuario = await prisma.usuario.update({
      where: { email },
      data: { esAdmin },
      select: { id: true },
    });

    // El login responde 204: no devuelve cuerpo, deja la cookie.
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);

    return {
      usuarioId: usuario.id,
      cookie: (respuesta.headers['set-cookie'] as unknown as string[])[0],
    };
  };

  /** Una reserva jugada un día, con su cobro autorizado. */
  const arriendoJugado = async (opciones: {
    dia: string;
    hora: string;
    canchaId: number;
    montoClp: number;
    esPico?: boolean;
    deSocio?: boolean;
    estadoPago?: EstadoTransaccion;
  }) => {
    const inicio = instanteEnElClub(opciones.dia, opciones.hora);
    const fin = new Date(inicio.getTime() + 60 * 60 * 1000);

    const reserva = await prisma.reserva.create({
      data: {
        folio: `${MARCA}${Math.random().toString(36).slice(2, 10)}`,
        canchaId: opciones.canchaId,
        inicio,
        fin,
        estado: EstadoReserva.CONFIRMADA,
        esPico: opciones.esPico ?? false,
        socioId: opciones.deSocio ? socioId : null,
        nombre: 'Quien Juega',
        email: `juega${DOMINIO}`,
        telefono: '+56900000000',
      },
      select: { id: true },
    });

    await prisma.transaccion.create({
      data: {
        referencia: `${MARCA}-${Math.random().toString(36).slice(2, 12)}`,
        concepto: ConceptoPago.RESERVA,
        conceptoId: reserva.id,
        montoClp: opciones.montoClp,
        estado: opciones.estadoPago ?? EstadoTransaccion.AUTORIZADA,
        pasarela: 'doble',
        // A propósito distinta del día jugado: es lo que el reporte **no** mira.
        creadaEn: new Date('2026-01-02T12:00:00.000Z'),
      },
    });

    return reserva.id;
  };

  /** Una cuota de un período, pagada o no, por el medio que sea. */
  const cuota = (opciones: {
    periodo: string;
    montoClp: number;
    medio?: MedioPago;
    tipo?: TipoCuota;
    descuentoClp?: number;
  }) =>
    prisma.cuota.create({
      data: {
        socioId,
        tipo: opciones.tipo ?? TipoCuota.MENSUAL,
        periodo: opciones.periodo,
        montoClp: opciones.montoClp,
        descuentoClp: opciones.descuentoClp ?? 0,
        motivoDescuento: opciones.descuentoClp ? 'Convenio' : null,
        estado: opciones.medio ? EstadoCuota.PAGADA : EstadoCuota.PENDIENTE,
        // Pagada mucho después del período: es lo que el reporte **no** mira.
        pagadaEn: opciones.medio ? new Date('2026-10-05T12:00:00.000Z') : null,
        medio: opciones.medio ?? null,
      },
      select: { id: true },
    });

  const reporte = async (
    desde: string,
    hasta: string,
    corte?: string,
  ): Promise<Reporte> => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/admin/reportes/ingreso')
      .query({ desde, hasta, ...(corte ? { corte } : {}) })
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as Reporte;
  };

  const limpiar = async () => {
    await prisma.transaccion.deleteMany({
      where: { referencia: { startsWith: MARCA } },
    });
    await prisma.reserva.deleteMany({
      where: { folio: { startsWith: MARCA } },
    });
    await prisma.cuota.deleteMany({
      where: { socio: { usuario: { email: { endsWith: DOMINIO } } } },
    });
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.socio.deleteMany({
      where: { usuario: { email: { endsWith: DOMINIO } } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
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
    await limpiar();
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();

    cookieAdmin = (await alguien('jefe', true)).cookie;

    const socio = await alguien('socia', false);
    cookieSocio = socio.cookie;
    const ficha = await prisma.socio.create({
      data: {
        usuarioId: socio.usuarioId,
        numeroSocio: `RP-${socio.usuarioId}`,
        fechaIngreso: new Date('2026-01-01T00:00:00.000Z'),
        alDiaHasta: new Date('2026-12-31T00:00:00.000Z'),
      },
      select: { id: true },
    });
    socioId = ficha.id;

    const techada = await prisma.cancha.create({
      data: {
        nombre: `${MARCA} techada`,
        superficie: Superficie.ARCILLA,
        techada: true,
      },
      select: { id: true },
    });
    const abierta = await prisma.cancha.create({
      data: {
        nombre: `${MARCA} abierta`,
        superficie: Superficie.ARCILLA,
        techada: false,
      },
      select: { id: true },
    });
    canchaTechada = techada.id;
    canchaAbierta = abierta.id;
  });

  describe('quién lo ve', () => {
    it('**un no admin recibe 403**', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/reportes/ingreso')
        .query({ desde: '2026-08-01', hasta: '2026-08-31' })
        .set('Cookie', cookieSocio)
        .expect(403);
    });

    it('sin sesión, 401', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/reportes/ingreso')
        .query({ desde: '2026-08-01', hasta: '2026-08-31' })
        .expect(401);
    });
  });

  describe('el rango', () => {
    it('sin fechas se niega, en vez de inventarlas', async () => {
      // Un reporte de plata sobre un rango que el servidor adivinó es peor que un
      // error: nadie sabría qué está mirando.
      await request(app.getHttpServer())
        .get('/api/admin/reportes/ingreso')
        .set('Cookie', cookieAdmin)
        .expect(400);
    });

    it('una fecha que no existe se rechaza', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/reportes/ingreso')
        .query({ desde: '2026-02-30', hasta: '2026-03-01' })
        .set('Cookie', cookieAdmin)
        .expect(400);
    });

    it('un corte inventado se rechaza', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/reportes/ingreso')
        .query({ desde: '2026-08-01', hasta: '2026-08-31', corte: 'color' })
        .set('Cookie', cookieAdmin)
        .expect(400);
    });
  });

  describe('cuándo se cuenta el ingreso', () => {
    it('**una reserva pagada el martes para el sábado suma al sábado**', async () => {
      // La decisión de la que depende que el módulo sirva: la pregunta del club es qué
      // horas rinden, y una hora que rinde no es una hora en que alguien pagó. La
      // transacción de este arriendo está creada el 2 de enero a propósito.
      await arriendoJugado({
        dia: '2026-08-22',
        hora: '20:00',
        canchaId: canchaTechada,
        montoClp: 18000,
      });

      expect((await reporte('2026-08-22', '2026-08-22')).totalClp).toBe(18000);
      // Y no aparece el día en que se pagó.
      expect((await reporte('2026-01-02', '2026-01-02')).totalClp).toBe(0);
    });

    it('**una cuota de agosto pagada en octubre suma a agosto**', async () => {
      // Un socio que se pone al día en octubre no convierte a octubre en el mejor mes
      // del año. La cuota de este test está pagada el 5 de octubre.
      await cuota({
        periodo: '2026-08',
        montoClp: 25000,
        medio: MedioPago.EFECTIVO,
      });

      expect((await reporte('2026-08-01', '2026-08-31')).totalClp).toBe(25000);
      expect((await reporte('2026-10-01', '2026-10-31')).totalClp).toBe(0);
    });

    it('un arriendo fuera del rango no entra', async () => {
      await arriendoJugado({
        dia: '2026-09-01',
        hora: '10:00',
        canchaId: canchaAbierta,
        montoClp: 12000,
      });

      expect((await reporte('2026-08-01', '2026-08-31')).totalClp).toBe(0);
    });

    it('el último día del rango entra entero, hasta la medianoche', async () => {
      // El borde: una hora de las 22:00 del 31 tiene que contar en un rango que
      // termina el 31.
      await arriendoJugado({
        dia: '2026-08-31',
        hora: '22:00',
        canchaId: canchaAbierta,
        montoClp: 12000,
      });

      expect((await reporte('2026-08-01', '2026-08-31')).totalClp).toBe(12000);
    });
  });

  describe('las dos fuentes', () => {
    it('**el total incluye una cuota en efectivo y una por Webpay**', async () => {
      // Obligatorio: mirar solo `Transaccion` deja fuera el efectivo, que en este club
      // es una parte grande de la caja.
      await cuota({
        periodo: '2026-08',
        montoClp: 25000,
        medio: MedioPago.EFECTIVO,
      });
      await cuota({
        periodo: '2026-08',
        montoClp: 80000,
        medio: MedioPago.WEBPAY,
        tipo: TipoCuota.INCORPORACION,
      });

      expect((await reporte('2026-08-01', '2026-08-31')).totalClp).toBe(105000);
    });

    it('**una cuota de Webpay no se cuenta dos veces**', async () => {
      // Deja fila en `Cuota` y en `Transaccion`. Sumar las dos tablas duplicaría la
      // plata sin que nada avisara, que es el peor error posible acá.
      const suya = await cuota({
        periodo: '2026-08',
        montoClp: 25000,
        medio: MedioPago.WEBPAY,
      });
      await prisma.transaccion.create({
        data: {
          referencia: `${MARCA}-cuota-${Math.random().toString(36).slice(2)}`,
          concepto: ConceptoPago.CUOTA,
          conceptoId: suya.id,
          montoClp: 25000,
          estado: EstadoTransaccion.AUTORIZADA,
          pasarela: 'doble',
        },
      });

      expect((await reporte('2026-08-01', '2026-08-31')).totalClp).toBe(25000);
    });

    it('**una transacción de cuota no se cuela como arriendo aunque su id choque**', async () => {
      // `Transaccion.conceptoId` apunta a dos tablas según el concepto y no tiene
      // clave foránea. Acá la transacción de la cuota lleva como `conceptoId` el id de
      // una reserva que existe y está en el rango: si el filtro por concepto faltara,
      // ese pago se sumaría como arriendo de esa cancha y nadie lo notaría.
      const reservaId = await arriendoJugado({
        dia: '2026-08-12',
        hora: '19:00',
        canchaId: canchaTechada,
        montoClp: 18000,
      });

      await prisma.transaccion.create({
        data: {
          referencia: `${MARCA}-choque-${Math.random().toString(36).slice(2)}`,
          concepto: ConceptoPago.CUOTA,
          conceptoId: reservaId,
          montoClp: 999000,
          estado: EstadoTransaccion.AUTORIZADA,
          pasarela: 'doble',
        },
      });

      expect((await reporte('2026-08-01', '2026-08-31')).totalClp).toBe(18000);
    });

    it('la cuota suma lo cobrado, no lo emitido: el descuento no entró a la caja', async () => {
      await cuota({
        periodo: '2026-08',
        montoClp: 25000,
        descuentoClp: 5000,
        medio: MedioPago.EFECTIVO,
      });

      expect((await reporte('2026-08-01', '2026-08-31')).totalClp).toBe(20000);
    });

    it('una cuota pendiente no es ingreso, pero se informa aparte', async () => {
      await cuota({ periodo: '2026-08', montoClp: 25000 });

      const suyo = await reporte('2026-08-01', '2026-08-31');

      expect(suyo.totalClp).toBe(0);
      expect(suyo.cuotasImpagasClp).toBe(25000);
    });
  });

  describe('las devoluciones', () => {
    it('**una devolución resta del período de la hora devuelta**', async () => {
      // Devolver pasa la transacción a ANULADA, así que el peso deja de sumar en el
      // día en que se iba a jugar, no en el día en que se devolvió.
      await arriendoJugado({
        dia: '2026-08-22',
        hora: '20:00',
        canchaId: canchaTechada,
        montoClp: 18000,
      });
      await arriendoJugado({
        dia: '2026-08-22',
        hora: '21:00',
        canchaId: canchaTechada,
        montoClp: 18000,
        estadoPago: EstadoTransaccion.ANULADA,
      });

      expect((await reporte('2026-08-01', '2026-08-31')).totalClp).toBe(18000);
    });

    it('un pago pendiente tampoco es ingreso', async () => {
      await arriendoJugado({
        dia: '2026-08-22',
        hora: '20:00',
        canchaId: canchaTechada,
        montoClp: 18000,
        estadoPago: EstadoTransaccion.PENDIENTE,
      });

      expect((await reporte('2026-08-01', '2026-08-31')).totalClp).toBe(0);
    });
  });

  describe('los cortes, desde la punta', () => {
    beforeEach(async () => {
      await arriendoJugado({
        dia: '2026-08-10',
        hora: '20:00',
        canchaId: canchaTechada,
        montoClp: 18000,
        esPico: true,
      });
      await arriendoJugado({
        dia: '2026-08-11',
        hora: '10:00',
        canchaId: canchaAbierta,
        montoClp: 10000,
        deSocio: true,
      });
      await cuota({
        periodo: '2026-08',
        montoClp: 25000,
        medio: MedioPago.EFECTIVO,
      });
    });

    it('**techada contra abierta, que es la pregunta que motiva el módulo**', async () => {
      const suyo = await reporte('2026-08-01', '2026-08-31', 'condicion');

      expect(suyo.filas).toEqual([
        { etiqueta: 'Sin cancha (cuotas)', montoClp: 25000 },
        { etiqueta: 'Techada', montoClp: 18000 },
        { etiqueta: 'Abierta', montoClp: 10000 },
      ]);
    });

    it('**la suma de las filas cuadra con el total, en los cinco cortes**', async () => {
      // Criterio 1 del spec, comprobado contra la base y no solo contra el agrupador.
      for (const corte of [
        'cancha',
        'condicion',
        'franja',
        'usuario',
        'concepto',
      ]) {
        const suyo = await reporte('2026-08-01', '2026-08-31', corte);
        const suma = suyo.filas.reduce(
          (total, fila) => total + fila.montoClp,
          0,
        );

        expect([corte, suma]).toEqual([corte, suyo.totalClp]);
      }
    });

    it('sin corte, sale por condición: es la pregunta del club', async () => {
      expect((await reporte('2026-08-01', '2026-08-31')).corte).toBe(
        'condicion',
      );
    });

    it('por cancha, una fila por cancha con su nombre', async () => {
      const suyo = await reporte('2026-08-01', '2026-08-31', 'cancha');

      expect(suyo.filas.map((f) => f.etiqueta)).toContain(`${MARCA} techada`);
    });

    it('dice cuándo se calculó, porque mañana puede dar otro número', async () => {
      const suyo = await reporte('2026-08-01', '2026-08-31');

      expect(Date.parse(suyo.calculadoEn)).not.toBeNaN();
    });
  });

  it('un período sin nada da cero y no se cae', async () => {
    const suyo = await reporte('2026-05-01', '2026-05-31');

    expect(suyo.totalClp).toBe(0);
    expect(suyo.filas).toEqual([]);
  });
});
