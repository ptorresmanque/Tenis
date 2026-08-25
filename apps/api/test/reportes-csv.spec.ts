import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  EstadoCuota,
  EstadoReporte,
  EstadoReserva,
  EstadoSocio,
  MedioPago,
  Superficie,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T59: los dos reportes que faltaban y la salida que el club va a usar de verdad.
 *
 * El criterio obligatorio del plan es uno solo y es el que ordena este archivo: **el CSV
 * trae los mismos números que el JSON del mismo rango**. Si se separan, el club se lleva
 * a su planilla cifras distintas de las que vio en pantalla y no hay forma de que lo
 * note.
 */
describe('Reportes: no uso, padrón y CSV', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;
  let socioId: number;
  let canchaId: number;

  const DOMINIO = '@csv.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Csv';
  /** El admin de este archivo. Su nombre firma los cambios de ficha; ver `FIRMA`. */
  const ADMIN = 'jefe';
  const DIA = '2026-08-10';

  const alguien = async (sufijo: string, esAdmin: boolean) => {
    const email = `${sufijo}${DOMINIO}`;

    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ email, contrasena: CONTRASENA, nombre: sufijo, apellido: MARCA })
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

  /** Una reserva confirmada, con su reporte de no uso si se pide. */
  const reservar = async (
    hora: string,
    reporte?: EstadoReporte,
    dia: string = DIA,
  ) => {
    const inicio = instanteEnElClub(dia, hora);
    const reserva = await prisma.reserva.create({
      data: {
        folio: `${MARCA}${Math.random().toString(36).slice(2, 10)}`,
        canchaId,
        inicio,
        fin: new Date(inicio.getTime() + 60 * 60 * 1000),
        estado: EstadoReserva.CONFIRMADA,
        socioId,
        nombre: 'Quien Juega',
        email: `juega${DOMINIO}`,
        telefono: '+56900000000',
      },
      select: { id: true },
    });

    if (reporte) {
      await prisma.reporteNoUso.create({
        data: {
          reservaId: reserva.id,
          reportanteSocioId: socioId,
          estado: reporte,
        },
      });
    }

    return reserva.id;
  };

  const pedir = async <T>(
    ruta: string,
    rango: { desde: string; hasta: string; corte?: string } = {
      desde: DIA,
      hasta: DIA,
    },
  ): Promise<T> => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/reportes/${ruta}`)
      .query(rango)
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as T;
  };

  /** El CSV del mismo rango, ya partido en filas y celdas. */
  const pedirCsv = async (ruta: string): Promise<string[][]> => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/reportes/${ruta}.csv`)
      .query({ desde: DIA, hasta: DIA })
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.text
      .replace(/^\uFEFF/, '')
      .split('\r\n')
      .map((linea) => linea.split(';'));
  };

  /** Lo que dice la fila cuyo primer campo es `etiqueta`. */
  const celda = (filas: string[][], etiqueta: string, columna: number) =>
    filas.find((fila) => fila[0].replace(/"/g, '') === etiqueta)?.[columna];

  /**
   * Quien firma los cambios de ficha de este archivo, y por eso el modo de barrerlos.
   *
   * `CambioSocio` no tiene clave foránea a `socio` —el historial sobrevive a la ficha,
   * a propósito—, así que borrar el socio no se lleva sus renglones y la corrida
   * siguiente contaría las bajas de la anterior.
   *
   * Se arma con las mismas constantes que registran al admin y no escrita a mano: una
   * copia de "jefe Csv" dejaría de barrer nada el día que alguien renombre al admin, y
   * el síntoma sería un test de bajas que empieza a fallar por datos de la corrida
   * anterior.
   */
  const FIRMA = `${ADMIN} ${MARCA}`;

  const limpiar = async () => {
    await prisma.cambioSocio.deleteMany({ where: { hechoPorNombre: FIRMA } });
    await prisma.reporteNoUso.deleteMany({
      where: { reserva: { folio: { startsWith: MARCA } } },
    });
    await prisma.reserva.deleteMany({
      where: { folio: { startsWith: MARCA } },
    });
    await prisma.cuota.deleteMany({
      where: { socio: { usuario: { email: { endsWith: DOMINIO } } } },
    });
    await prisma.horarioApertura.deleteMany({
      where: { cancha: { nombre: { startsWith: MARCA } } },
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

    cookieAdmin = (await alguien(ADMIN, true)).cookie;
    const socio = await alguien('socia', false);
    cookieSocio = socio.cookie;

    const ficha = await prisma.socio.create({
      data: {
        usuarioId: socio.usuarioId,
        numeroSocio: `CS-${socio.usuarioId}`,
        fechaIngreso: instanteEnElClub(DIA, '00:00'),
        alDiaHasta: instanteEnElClub(DIA, '00:00'),
      },
      select: { id: true },
    });
    socioId = ficha.id;

    // El nombre lleva punto y coma a propósito: es lo que parte una fila mal escapada.
    const cancha = await prisma.cancha.create({
      data: {
        nombre: `${MARCA} central; la grande`,
        superficie: Superficie.ARCILLA,
        techada: true,
      },
      select: { id: true },
    });
    canchaId = cancha.id;
  });

  describe('quién lo ve', () => {
    it('**un no admin no descarga los CSV**', async () => {
      for (const ruta of ['ingreso', 'ocupacion', 'no-uso', 'padron']) {
        await request(app.getHttpServer())
          .get(`/api/admin/reportes/${ruta}.csv`)
          .query({ desde: DIA, hasta: DIA })
          .set('Cookie', cookieSocio)
          .expect(403);
      }
    });
  });

  describe('horas reservadas y no usadas', () => {
    interface NoUso {
      noUsadas: number;
      reservadas: number;
      porcentaje: number | null;
      sinResolver: number;
      filas: { etiqueta: string; noUsadas: number; reservadas: number }[];
    }

    it('cuenta las sancionadas sobre el total reservado', async () => {
      await reservar('10:00', EstadoReporte.SANCIONADO);
      await reservar('11:00');
      await reservar('12:00');
      await reservar('13:00');

      const suyo = await pedir<NoUso>('no-uso');

      expect(suyo.noUsadas).toBe(1);
      expect(suyo.reservadas).toBe(4);
      expect(suyo.porcentaje).toBe(25);
    });

    it('**un reporte pendiente no cuenta, pero se informa aparte**', async () => {
      // Un pendiente es una acusación, no un hecho: nadie lo miró todavía. Contarlo
      // infla el indicador con lo que el club no confirmó.
      await reservar('10:00', EstadoReporte.PENDIENTE);
      await reservar('11:00');

      const suyo = await pedir<NoUso>('no-uso');

      expect(suyo.noUsadas).toBe(0);
      expect(suyo.sinResolver).toBe(1);
    });

    it('**dos socios reportando la misma hora no la cuentan dos veces**', async () => {
      // `ReporteNoUso` es único por (reserva, reportante): un no-show lo ve todo el que
      // esté esperando esa cancha, así que dos reportes de la misma hora es el caso
      // normal y no un borde. Contando reportes en vez de horas, el indicador puede
      // pasar del 100 % y nadie entiende cómo.
      const otro = await alguien('tercero', false);
      const ficha = await prisma.socio.create({
        data: {
          usuarioId: otro.usuarioId,
          numeroSocio: `CS2-${otro.usuarioId}`,
          fechaIngreso: instanteEnElClub(DIA, '00:00'),
          alDiaHasta: instanteEnElClub(DIA, '00:00'),
        },
        select: { id: true },
      });

      const reservaId = await reservar('10:00', EstadoReporte.SANCIONADO);
      await prisma.reporteNoUso.create({
        data: {
          reservaId,
          reportanteSocioId: ficha.id,
          estado: EstadoReporte.SANCIONADO,
        },
      });

      const suyo = await pedir<NoUso>('no-uso');

      expect(suyo.noUsadas).toBe(1);
      expect(suyo.reservadas).toBe(1);
      expect(suyo.porcentaje).toBe(100);
    });

    it('uno descartado tampoco', async () => {
      await reservar('10:00', EstadoReporte.DESCARTADO);

      const suyo = await pedir<NoUso>('no-uso');

      expect(suyo.noUsadas).toBe(0);
      expect(suyo.sinResolver).toBe(0);
    });

    it('**una cancha sin ningún no uso aparece con cero, no desaparece**', async () => {
      // Es la buena noticia. Si solo salieran las canchas con problemas, el reporte
      // haría parecer que el club entero anda mal.
      await reservar('10:00');

      const suyo = await pedir<NoUso>('no-uso');
      const mia = suyo.filas.find((f) => f.reservadas > 0);

      expect(mia?.noUsadas).toBe(0);
    });

    it('**la hora de las nueve de la noche del 31 es de ese mes, no del siguiente**', async () => {
      // En agosto el club está en UTC-4: las 21:00 del 31 son la 01:00Z del 1 de
      // septiembre. El rango del reporte se calcula con el reloj del club y la
      // etiqueta del mes no, así que esa hora entraba en agosto y salía rotulada
      // como septiembre —una fila de un mes que ni siquiera se pidió—.
      //
      // No es un caso raro: el club cierra a las 22:00, así que le pasa a **toda**
      // hora de la tarde del último día de cualquier mes, y corre las dos cifras que
      // el OE4 compara mes contra mes.
      await reservar('21:00', EstadoReporte.SANCIONADO, '2026-08-31');

      const suyo = await pedir<NoUso>('no-uso', {
        desde: '2026-08-01',
        hasta: '2026-08-31',
        corte: 'mes',
      });

      // Todo lo que el rango incluye es de agosto por definición: el rango termina
      // justo cuando empieza septiembre en el club.
      expect(suyo.filas.map((fila) => fila.etiqueta)).toEqual(['2026-08']);
      expect(suyo.filas[0].noUsadas).toBeGreaterThanOrEqual(1);
    });
  });

  describe('padrón y morosidad', () => {
    interface Padron {
      activosHoy: number;
      altasDelPeriodo: number;
      bajasDelPeriodo: number;
      meses: {
        periodo: string;
        altas: number;
        bajas: number;
        deudaClp: number;
        sociosConDeuda: number;
      }[];
    }

    /**
     * Cambia el estado del socio **por el panel**, que es el único camino que lo
     * escribe, y fecha el cambio en el instante que se pida.
     *
     * `hechoEn` es un `now()` y el rango del reporte es un día fijo del pasado: sin
     * correrlo, ningún cambio caería nunca dentro del período que se consulta.
     */
    const cambiarEstado = async (estado: EstadoSocio, cuando: Date) => {
      await request(app.getHttpServer())
        .patch(`/api/admin/socios/${socioId}`)
        .set('Cookie', cookieAdmin)
        .send({ estado })
        .expect(200);

      // **Solo el renglón que se acaba de escribir.** Con un `updateMany` se
      // refechaban también los anteriores, y dos llamadas seguidas dejaban ambos
      // cambios en la misma fecha: un test de "una baja en julio y otra en agosto"
      // habría medido otra cosa y nada lo habría avisado.
      const ultimo = await prisma.cambioSocio.findFirstOrThrow({
        where: { socioId, campo: 'estado', hechoPorNombre: FIRMA },
        orderBy: { id: 'desc' },
        select: { id: true },
      });

      await prisma.cambioSocio.update({
        where: { id: ultimo.id },
        data: { hechoEn: cuando },
      });
    };

    it('**cuenta la baja del período**', async () => {
      await cambiarEstado(EstadoSocio.RETIRADO, instanteEnElClub(DIA, '15:00'));

      const suyo = await pedir<Padron>('padron');

      expect(suyo.bajasDelPeriodo).toBe(1);
      expect(suyo.meses[0].bajas).toBe(1);
    });

    it('sin bajas el período informa cero, no un hueco', async () => {
      const suyo = await pedir<Padron>('padron');

      expect(suyo.bajasDelPeriodo).toBe(0);
      expect(suyo.meses[0].bajas).toBe(0);
    });

    it('**una suspensión no es una baja**', async () => {
      // Un socio suspendido sigue siendo socio: contarlo como baja diría que el club
      // perdió a alguien que no perdió.
      await cambiarEstado(
        EstadoSocio.SUSPENDIDO,
        instanteEnElClub(DIA, '15:00'),
      );

      expect((await pedir<Padron>('padron')).bajasDelPeriodo).toBe(0);
    });

    it('**una baja de otro día no entra en este período**', async () => {
      await cambiarEstado(
        EstadoSocio.RETIRADO,
        instanteEnElClub('2026-07-04', '15:00'),
      );

      expect((await pedir<Padron>('padron')).bajasDelPeriodo).toBe(0);
    });

    it('**la baja de las once y media de la noche es de ese día, no del siguiente**', async () => {
      // A las 23:30 en Santiago ya es el día siguiente en UTC. Fechar la baja por el
      // reloj equivocado la corre de mes cada 31 del mes, y un club que se pregunta
      // por qué agosto perdió una baja que sí ocurrió.
      await cambiarEstado(
        EstadoSocio.RETIRADO,
        instanteEnElClub('2026-08-31', '23:30'),
      );

      const suyo = await pedir<Padron>('padron', {
        desde: '2026-08-01',
        hasta: '2026-09-30',
      });
      const agosto = suyo.meses.find((mes) => mes.periodo === '2026-08');
      const septiembre = suyo.meses.find((mes) => mes.periodo === '2026-09');

      expect(agosto?.bajas).toBe(1);
      expect(septiembre?.bajas).toBe(0);
    });

    it('el mismo socio retirado dos veces en el mes es una baja', async () => {
      // Se puede: retirar, reincorporar y volver a retirar deja dos renglones. Son
      // dos decisiones, pero **un socio menos**, y la columna del padrón cuenta gente.
      await cambiarEstado(EstadoSocio.RETIRADO, instanteEnElClub(DIA, '10:00'));
      await cambiarEstado(EstadoSocio.ACTIVO, instanteEnElClub(DIA, '11:00'));
      await cambiarEstado(EstadoSocio.RETIRADO, instanteEnElClub(DIA, '12:00'));

      expect((await pedir<Padron>('padron')).bajasDelPeriodo).toBe(1);
    });

    it('cuenta el alta del período', async () => {
      const suyo = await pedir<Padron>('padron');

      expect(suyo.altasDelPeriodo).toBeGreaterThanOrEqual(1);
      expect(suyo.meses[0].periodo).toBe(DIA.slice(0, 7));
    });

    it('**la deuda del mes sale de las cuotas pendientes de ese período**', async () => {
      await prisma.cuota.create({
        data: {
          socioId,
          periodo: '2026-08',
          montoClp: 25000,
          descuentoClp: 5000,
          motivoDescuento: 'Convenio',
          estado: EstadoCuota.PENDIENTE,
        },
      });

      const mes = (await pedir<Padron>('padron')).meses[0];

      // Lo que se debe es lo emitido menos el descuento, no el monto bruto.
      expect(mes.deudaClp).toBeGreaterThanOrEqual(20000);
      expect(mes.sociosConDeuda).toBeGreaterThanOrEqual(1);
    });

    it('una cuota pagada no es deuda', async () => {
      await prisma.cuota.create({
        data: {
          socioId,
          periodo: '2026-08',
          montoClp: 25000,
          estado: EstadoCuota.PAGADA,
          medio: MedioPago.EFECTIVO,
          pagadaEn: new Date(),
        },
      });

      const antes = (await pedir<Padron>('padron')).meses[0].deudaClp;

      expect(antes).toBe(0);
    });
  });

  describe('el CSV', () => {
    beforeEach(async () => {
      await reservar('10:00', EstadoReporte.SANCIONADO);
      await reservar('11:00');
    });

    it('**trae los mismos números que el JSON del mismo rango**', async () => {
      // El criterio obligatorio. El CSV se arma desde el objeto que devuelve el JSON,
      // así que no puede haber dos cálculos que se separen.
      const json = await pedir<{
        noUsadas: number;
        reservadas: number;
        porcentaje: number | null;
      }>('no-uso');
      const csv = await pedirCsv('no-uso');

      expect(celda(csv, 'Total', 1)).toBe(String(json.noUsadas));
      expect(celda(csv, 'Total', 2)).toBe(String(json.reservadas));
      expect(celda(csv, 'Total', 3)).toBe(String(json.porcentaje));
    });

    it('el del ingreso también', async () => {
      const json = await pedir<{ totalClp: number; cuotasImpagasClp: number }>(
        'ingreso',
      );
      const csv = await pedirCsv('ingreso');

      expect(celda(csv, 'Total', 1)).toBe(String(json.totalClp));
      expect(celda(csv, 'Cuotas del período sin cobrar', 1)).toBe(
        String(json.cuotasImpagasClp),
      );
    });

    it('el de la ocupación también', async () => {
      const json = await pedir<{ bloques: number; ocupados: number }>(
        'ocupacion',
      );
      const csv = await pedirCsv('ocupacion');

      expect(celda(csv, 'Total', 1)).toBe(String(json.bloques));
      expect(celda(csv, 'Total', 2)).toBe(String(json.ocupados));
    });

    it('el del padrón también', async () => {
      const json = await pedir<{ activosHoy: number }>('padron');
      const csv = await pedirCsv('padron');

      expect(celda(csv, 'Activos hoy', 1)).toBe(String(json.activosHoy));
    });

    it('**escapa el separador en el nombre de una cancha**', async () => {
      // La cancha de este archivo se llama "Csv central; la grande". Sin escapar,
      // esa fila se parte en dos y todas las columnas de la derecha se corren.
      const crudo = await request(app.getHttpServer())
        .get('/api/admin/reportes/no-uso.csv')
        .query({ desde: DIA, hasta: DIA, corte: 'cancha' })
        .set('Cookie', cookieAdmin)
        .expect(200);

      // El nombre entero va entre comillas, así que el punto y coma queda **dentro**
      // de la celda y la fila conserva sus cuatro columnas.
      expect(crudo.text).toContain(`"${MARCA} central; la grande"`);

      const suya = crudo.text
        .split('\r\n')
        .find((linea) => linea.includes('central'));
      expect(suya?.replace(/"[^"]*"/, 'X').split(';')).toHaveLength(4);
    });

    it('llega como descarga y con nombre que dice el rango', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/api/admin/reportes/ingreso.csv')
        .query({ desde: DIA, hasta: DIA })
        .set('Cookie', cookieAdmin)
        .expect(200);

      expect(respuesta.headers['content-type']).toContain('text/csv');
      expect(respuesta.headers['content-disposition']).toContain(
        `ingreso-${DIA}-a-${DIA}.csv`,
      );
    });

    it('**empieza con BOM, para que una planilla no rompa los acentos**', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/api/admin/reportes/padron.csv')
        .query({ desde: DIA, hasta: DIA })
        .set('Cookie', cookieAdmin)
        .expect(200);

      expect(respuesta.text.charCodeAt(0)).toBe(0xfeff);
    });

    it('un rango inválido se rechaza también en el CSV', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/reportes/ingreso.csv')
        .set('Cookie', cookieAdmin)
        .expect(400);
    });
  });
});
