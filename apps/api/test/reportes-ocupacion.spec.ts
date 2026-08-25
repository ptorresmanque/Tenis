import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  EstadoReserva,
  MotivoBloqueo,
  Superficie,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T58: cuánta cancha se usó y cuánta se desperdició.
 *
 * La clasificación se prueba sola en `ocupacion.spec.ts`. Lo que se prueba acá es el
 * **denominador**: que los bloques que cuenta el reporte sean los que existieron de
 * verdad según el horario de apertura, y no un día de veinticuatro horas inventado.
 */
describe('GET /api/admin/reportes/ocupacion', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;
  let canchaId: number;
  /**
   * Los horarios generales del club que crea este archivo.
   *
   * Se borran **por id** y no por su cancha: un horario general tiene `canchaId` nulo,
   * así que un `deleteMany` por cancha no lo alcanza y queda en la base compartida
   * cambiando el horario del club para las demás suites.
   */
  let horariosDelClub: number[] = [];

  const DOMINIO = '@ocupacion.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Ocu';
  /** Un lunes, para que el horario del día de semana sea el mismo siempre. */
  const LUNES = '2026-08-10';

  interface Fila {
    etiqueta: string;
    bloques: number;
    ocupados: number;
    cerrados: number;
    libres: number;
    porcentajeOcupacion: number | null;
  }

  interface Reporte {
    bloques: number;
    ocupados: number;
    cerrados: number;
    libres: number;
    porcentajeOcupacion: number | null;
    filas: Fila[];
  }

  const alguien = async (sufijo: string, esAdmin: boolean) => {
    const email = `${sufijo}${DOMINIO}`;

    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ email, contrasena: CONTRASENA, nombre: sufijo, apellido: 'Ocu' })
      .expect(201);

    await prisma.usuario.update({ where: { email }, data: { esAdmin } });

    // El login responde 204: no devuelve cuerpo, deja la cookie.
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  /** Un horario general del club, anotado para poder borrarlo después. */
  const abrirElClubDe = async (horaApertura: string, horaCierre: string) => {
    const creado = await prisma.horarioApertura.create({
      data: { canchaId: null, diaSemana: 1, horaApertura, horaCierre },
      select: { id: true },
    });
    horariosDelClub.push(creado.id);

    return creado;
  };

  /** Abre la cancha ese día de la semana, de `desde` a `hasta`. */
  const abrirDe = (horaApertura: string, horaCierre: string) =>
    prisma.horarioApertura.create({
      data: { canchaId, diaSemana: 1, horaApertura, horaCierre },
    });

  const reservar = (hora: string, horas = 1) =>
    prisma.reserva.create({
      data: {
        folio: `${MARCA}${Math.random().toString(36).slice(2, 10)}`,
        canchaId,
        inicio: instanteEnElClub(LUNES, hora),
        fin: new Date(
          instanteEnElClub(LUNES, hora).getTime() + horas * 60 * 60 * 1000,
        ),
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'Quien Juega',
        email: `juega${DOMINIO}`,
        telefono: '+56900000000',
      },
    });

  const bloquear = (hora: string, motivo: MotivoBloqueo, horas = 1) =>
    prisma.bloqueo.create({
      data: {
        canchaId,
        inicio: instanteEnElClub(LUNES, hora),
        fin: new Date(
          instanteEnElClub(LUNES, hora).getTime() + horas * 60 * 60 * 1000,
        ),
        motivo,
      },
    });

  const reporte = async (corte = 'cancha'): Promise<Reporte> => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/admin/reportes/ocupacion')
      .query({ desde: LUNES, hasta: LUNES, corte })
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as Reporte;
  };

  /**
   * La fila de **esta** cancha.
   *
   * La base de tests la comparten todos los archivos y el reporte cubre todas las
   * canchas activas: mirar la fila "Techada" sumaría las de las otras suites. Por eso
   * las aserciones van sobre el corte por cancha, que es el único que aísla.
   */
  const miFila = async (): Promise<Fila | undefined> =>
    (await reporte()).filas.find((f) => f.etiqueta === `${MARCA} techada`);

  const limpiar = async () => {
    await prisma.reserva.deleteMany({
      where: { folio: { startsWith: MARCA } },
    });
    await prisma.bloqueo.deleteMany({
      where: { cancha: { nombre: { startsWith: MARCA } } },
    });
    await prisma.horarioApertura.deleteMany({
      where: { cancha: { nombre: { startsWith: MARCA } } },
    });
    // Los generales van por id: no cuelgan de ninguna cancha y el filtro de arriba no
    // los alcanza. Dejarlos cambiaba el horario del club para las otras suites.
    await prisma.horarioApertura.deleteMany({
      where: { id: { in: horariosDelClub } },
    });
    horariosDelClub = [];
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: MARCA } },
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

    cookieAdmin = await alguien('jefe', true);
    cookieSocio = await alguien('socia', false);

    const cancha = await prisma.cancha.create({
      data: {
        nombre: `${MARCA} techada`,
        superficie: Superficie.ARCILLA,
        techada: true,
      },
      select: { id: true },
    });
    canchaId = cancha.id;
  });

  describe('quién lo ve', () => {
    it('**un no admin recibe 403**', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/reportes/ocupacion')
        .query({ desde: LUNES, hasta: LUNES })
        .set('Cookie', cookieSocio)
        .expect(403);
    });
  });

  describe('el denominador', () => {
    it('**un día con la cancha abierta 4 horas se mide sobre 4 bloques, no sobre 24**', async () => {
      // El criterio obligatorio. Sin esto, una cancha que abre medio día parece vacía
      // y el club decide una inversión mirando un número inventado.
      await abrirDe('10:00', '14:00');

      expect((await miFila())?.bloques).toBe(4);
    });

    it('sin horario propio, la cancha usa el general del club', async () => {
      // El más reciente gana entre los generales, así que éste manda sobre el que
      // pueda haber dejado otra suite en la base compartida.
      await abrirElClubDe('09:00', '11:00');

      expect((await miFila())?.bloques).toBe(2);
    });

    it('el horario propio de la cancha gana al general del club', async () => {
      await abrirElClubDe('08:00', '22:00');
      await abrirDe('10:00', '12:00');

      expect((await miFila())?.bloques).toBe(2);
    });
  });

  describe('qué cuenta como ocupado', () => {
    beforeEach(async () => {
      await abrirDe('10:00', '14:00');
    });

    it('una reserva confirmada ocupa su bloque', async () => {
      await reservar('10:00');

      const mia = await miFila();

      expect(mia?.ocupados).toBe(1);
      expect(mia?.libres).toBe(3);
      expect(mia?.porcentajeOcupacion).toBe(25);
    });

    it('una reserva de dos horas ocupa dos bloques', async () => {
      await reservar('10:00', 2);

      expect((await miFila())?.ocupados).toBe(2);
    });

    it('**las clases cuentan como ocupación**', async () => {
      // En la base una clase es un `Bloqueo`, igual que una mantención. Si contara
      // como cierre, las horas que más rinden saldrían del denominador y la ocupación
      // subiría cuantas más clases diera el club.
      await bloquear('11:00', MotivoBloqueo.CLASE);

      const mia = await miFila();

      expect(mia?.ocupados).toBe(1);
      expect(mia?.cerrados).toBe(0);
      expect(mia?.bloques).toBe(4);
    });

    it('**una hora en mantención no cuenta como ocupada ni como libre**', async () => {
      await bloquear('11:00', MotivoBloqueo.MANTENCION);

      const mia = await miFila();

      expect(mia?.cerrados).toBe(1);
      expect(mia?.ocupados).toBe(0);
      expect(mia?.libres).toBe(3);
      // Y sale del denominador: 0 de 3, no 0 de 4.
      expect(mia?.porcentajeOcupacion).toBe(0);
    });

    it('**con una ocupada y una cerrada, la cerrada no está en el denominador**', async () => {
      // Es el caso donde las dos fórmulas se separan: 1 de 3 es 33 %, y contar la
      // cerrada daría 25 %. Sin él, el error se esconde detrás de los ceros.
      await reservar('10:00');
      await bloquear('12:00', MotivoBloqueo.MANTENCION);

      // El total no se puede fijar acá: agrega todas las canchas de la base, que es
      // compartida entre suites. La regla en sí se prueba en `ocupacion.spec.ts`, y el
      // servicio la usa desde ahí para el total y para cada fila.
      const mia = await miFila();

      expect(mia?.ocupados).toBe(1);
      expect(mia?.cerrados).toBe(1);
      expect(mia?.porcentajeOcupacion).toBe(33);
    });

    it('una hora tomada por un torneo, igual', async () => {
      await bloquear('11:00', MotivoBloqueo.TORNEO);

      expect((await miFila())?.cerrados).toBe(1);
    });

    it('una reserva cancelada no ocupa nada', async () => {
      const reserva = await reservar('10:00');
      await prisma.reserva.update({
        where: { id: reserva.id },
        data: { estado: EstadoReserva.CANCELADA },
      });

      expect((await miFila())?.ocupados).toBe(0);
    });
  });

  describe('los cortes', () => {
    beforeEach(async () => {
      await abrirDe('10:00', '12:00');
      await reservar('10:00');
    });

    it('sin corte, por condición: es la pregunta que motiva el módulo', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/api/admin/reportes/ocupacion')
        .query({ desde: LUNES, hasta: LUNES })
        .set('Cookie', cookieAdmin)
        .expect(200);

      expect((respuesta.body as Reporte & { corte: string }).corte).toBe(
        'condicion',
      );
    });

    it('por cancha, con su nombre', async () => {
      expect(await miFila()).toBeDefined();
    });

    it('**el total cuadra con la suma de sus filas**', async () => {
      // El total y cada fila salen de la misma función a propósito. Calculado aparte,
      // un cambio en la regla dejaría un reporte cuyo total no coincide con lo que
      // muestra debajo, que es el que nadie puede auditar.
      const respuesta = await request(app.getHttpServer())
        .get('/api/admin/reportes/ocupacion')
        .query({ desde: LUNES, hasta: LUNES, corte: 'cancha' })
        .set('Cookie', cookieAdmin)
        .expect(200);
      const suyo = respuesta.body as Reporte;

      const suma = (cual: 'bloques' | 'ocupados' | 'cerrados' | 'libres') =>
        suyo.filas.reduce((total, fila) => total + fila[cual], 0);

      expect(suma('bloques')).toBe(suyo.bloques);
      expect(suma('ocupados')).toBe(suyo.ocupados);
      expect(suma('cerrados')).toBe(suyo.cerrados);
      expect(suma('libres')).toBe(suyo.libres);
    });

    it('un corte que no aplica sobre un bloque se rechaza', async () => {
      // "socio" y "concepto" están en el ingreso y acá no: una hora libre no tiene
      // usuario ni concepto.
      await request(app.getHttpServer())
        .get('/api/admin/reportes/ocupacion')
        .query({ desde: LUNES, hasta: LUNES, corte: 'usuario' })
        .set('Cookie', cookieAdmin)
        .expect(400);
    });
  });

  describe('el rango', () => {
    it('un rango al revés se rechaza', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/reportes/ocupacion')
        .query({ desde: '2026-08-20', hasta: '2026-08-10' })
        .set('Cookie', cookieAdmin)
        .expect(400);
    });

    it('**un rango de años se rechaza en vez de colgarse**', async () => {
      // Cinco años son cientos de miles de bloques en memoria: sin tope, la vista se
      // cae sin decir por qué.
      await request(app.getHttpServer())
        .get('/api/admin/reportes/ocupacion')
        .query({ desde: '2020-01-01', hasta: '2026-12-31' })
        .set('Cookie', cookieAdmin)
        .expect(400);
    });

    it('un rango de un solo día se acepta', async () => {
      // El borde de `diasDelRango`: desde y hasta iguales tienen que dar un día, no
      // cero ni un bucle que no termina.
      await abrirDe('10:00', '12:00');

      expect((await miFila())?.bloques).toBe(2);
    });
  });
});
