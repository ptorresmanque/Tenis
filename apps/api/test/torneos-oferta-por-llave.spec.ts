import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { sembrarCategoriasDeJuego } from '../src/arranque';
import {
  ConceptoPago,
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
} from '../src/generated/prisma/client';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { IntentosFallidos } from '../src/identidad/intentos';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';
import { ListaDeEspera } from '../src/torneos/lista-de-espera.service';

/**
 * T332 (`SPEC-torneos.md` § Lista de espera sin cobro, LE4 y LE5). Quien recibe la oferta de un
 * cupo la abre con la llave de su inscripción y la paga con Webpay: pagada, entra al cuadro.
 * Con el plazo vencido o la categoría cerrada, no se cobra. Volver atrás, anular o un pago
 * rechazado no le quitan la oferta: el cupo le sigue guardado hasta que venza.
 */
describe('La oferta de un cupo, por la llave', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pasarela: PasarelaFake;
  let cuartaId: number;

  const enviados: CorreoSaliente[] = [];
  const enviador = {
    enviar: (correo: CorreoSaliente) => {
      enviados.push(correo);
      return Promise.resolve();
    },
  };

  const MARCA = 'Copa de la oferta por llave';
  const APELLIDO = 'DeLaOferta';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  let correlativo = 0;

  /**
   * Una categoría de un lugar, libre, con una persona esperando a la que se le da la oferta.
   * `ofrecer: false` la deja esperando sin oferta.
   */
  const conOferta = async ({ ofrecer = true } = {}) => {
    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}${Math.random()}`,
        fechaInicio: new Date('2027-12-01T00:00:00.000Z'),
        fechaFin: new Date('2027-12-07T00:00:00.000Z'),
        cierreInscripcion: new Date('2027-11-25T00:00:00.000Z'),
        cuadros: {
          create: {
            categoriaJuegoId: cuartaId,
            cupo: 1,
            montoInscripcionClp: 15_000,
          },
        },
      },
      select: { id: true, cuadros: { select: { id: true } } },
    });
    const cuadroId = torneo.cuadros[0].id;

    correlativo += 1;
    const jugador = await prisma.jugador.create({
      data: { nombre: `Esperando${correlativo}`, apellido: APELLIDO },
    });
    const inscripcion = await prisma.inscripcionTorneo.create({
      data: {
        torneoId: torneo.id,
        torneoCategoriaId: cuadroId,
        jugadorId: jugador.id,
        estado: EstadoInscripcionTorneo.LISTA_ESPERA,
        estadoPago: EstadoPagoInscripcion.PENDIENTE,
        email: `esperando${correlativo}@oferta.ejemplo.cl`,
      },
      select: { id: true, token: true },
    });

    if (ofrecer) await app.get(ListaDeEspera).ofrecerCupos(cuadroId);

    return { torneoId: torneo.id, cuadroId, ...inscripcion };
  };

  const laInscripcion = (id: number) =>
    prisma.inscripcionTorneo.findUniqueOrThrow({
      where: { id },
      select: {
        estado: true,
        estadoPago: true,
        medioPago: true,
        cupoOfrecidoHasta: true,
      },
    });

  const empezarAPagar = (token: string) =>
    request(servidor()).post(`/api/torneos/inscripciones/${token}/pago`);

  const limpiar = async () => {
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .overrideProvider(EnviadorCorreo)
      .useValue(enviador)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
    pasarela = app.get(PasarelaPago);
    await sembrarCategoriasDeJuego(prisma);
    cuartaId = (
      await prisma.categoriaJuego.findUniqueOrThrow({ where: { nombre: '4ª' } })
    ).id;
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();
    enviados.length = 0;
    pasarela.respuesta = 'AUTORIZADA';
    app.get(IntentosFallidos).perdonar('inscripcion|127.0.0.1');
  });

  describe('GET /api/torneos/inscripciones/:token', () => {
    it('**dice el torneo, la categoría, cuánto cuesta y hasta cuándo se le guarda**', async () => {
      const { token, torneoId } = await conOferta();

      const body = (
        await request(servidor())
          .get(`/api/torneos/inscripciones/${token}`)
          .expect(200)
      ).body as Record<string, unknown>;

      expect(body).toMatchObject({
        torneoId,
        categoria: '4ª',
        montoClp: 15_000,
        situacion: 'OFRECIDO',
      });
      expect(new Date(body.hasta as string).getTime()).toBeGreaterThan(
        Date.now(),
      );
      // La llave no es una cuenta: no devuelve ni el correo ni el teléfono.
      expect(JSON.stringify(body)).not.toContain('@');
    });

    it('sin oferta todavía, dice que espera', async () => {
      const { token } = await conOferta({ ofrecer: false });

      const body = (
        await request(servidor())
          .get(`/api/torneos/inscripciones/${token}`)
          .expect(200)
      ).body as Record<string, unknown>;

      expect(body).toMatchObject({ situacion: 'ESPERANDO', hasta: null });
    });

    it('**con el plazo vencido, lo dice**', async () => {
      const { id, token } = await conOferta();
      await prisma.inscripcionTorneo.update({
        where: { id },
        data: { cupoOfrecidoHasta: new Date(Date.now() - 60_000) },
      });

      const body = (
        await request(servidor())
          .get(`/api/torneos/inscripciones/${token}`)
          .expect(200)
      ).body as Record<string, unknown>;

      expect(body).toMatchObject({ situacion: 'VENCIDO' });
    });

    it('una llave inventada da 404', async () => {
      await request(servidor())
        .get('/api/torneos/inscripciones/no-es-una-llave')
        .expect(404);
    });
  });

  describe('pagar la oferta con Webpay', () => {
    it('**pagada, entra al cuadro, y la oferta se va**', async () => {
      const { id, token } = await conOferta();

      const pago = await empezarAPagar(token).expect(201);
      const tokenWs = (pago.body as { tokenPasarela: string }).tokenPasarela;
      const vuelta = await request(servidor())
        .get(`/api/torneos/inscripciones/retorno?token_ws=${tokenWs}`)
        .expect(302);

      expect(vuelta.headers.location).toMatch(/\/torneos\?pago=listo$/);
      expect(await laInscripcion(id)).toEqual({
        estado: 'INSCRITA',
        estadoPago: 'PAGADA',
        medioPago: 'WEBPAY',
        cupoOfrecidoHasta: null,
      });
    });

    it('**con el plazo vencido no se cobra**: 409', async () => {
      const { id, token } = await conOferta();
      await prisma.inscripcionTorneo.update({
        where: { id },
        data: { cupoOfrecidoHasta: new Date(Date.now() - 60_000) },
      });

      const respuesta = await empezarAPagar(token).expect(409);

      expect((respuesta.body as { message: string }).message).toContain(
        'venció',
      );
      expect(
        await prisma.transaccion.count({
          where: { concepto: ConceptoPago.INSCRIPCION_TORNEO, conceptoId: id },
        }),
      ).toBe(0);
    });

    it('**con el cuadro armado entre medio, tampoco**', async () => {
      const { cuadroId, token } = await conOferta();
      await prisma.torneoCategoria.update({
        where: { id: cuadroId },
        data: { semillaSorteo: 7 },
      });

      const respuesta = await empezarAPagar(token).expect(409);

      expect((respuesta.body as { message: string }).message).toContain(
        'armado',
      );
    });

    it('**la que el club retiró tampoco se cobra**: sería plata sin cupo', async () => {
      const { id, token } = await conOferta({ ofrecer: false });
      await prisma.inscripcionTorneo.update({
        where: { id },
        data: { estado: EstadoInscripcionTorneo.RETIRADA },
      });

      await empezarAPagar(token).expect(409);
    });

    describe('**sin pagar, la oferta sigue en pie** (LE5)', () => {
      /** La oferta, después de volver: sigue esperando, con el mismo plazo. */
      const sigueEnPie = async (id: number, hasta: Date | null) => {
        expect(await laInscripcion(id)).toMatchObject({
          estado: 'LISTA_ESPERA',
          cupoOfrecidoHasta: hasta,
        });
      };

      const empezado = async () => {
        const oferta = await conOferta();
        const { cupoOfrecidoHasta } = await laInscripcion(oferta.id);
        const pago = await empezarAPagar(oferta.token).expect(201);
        const transaccion = await prisma.transaccion.findFirstOrThrow({
          where: {
            concepto: ConceptoPago.INSCRIPCION_TORNEO,
            conceptoId: oferta.id,
          },
        });

        return {
          ...oferta,
          cupoOfrecidoHasta,
          referencia: transaccion.referencia,
          tokenWs: (pago.body as { tokenPasarela: string }).tokenPasarela,
        };
      };

      it('**anular en Webpay vuelve a la página de la oferta**, no a «tu cupo se soltó»', async () => {
        const { id, token, referencia, tokenWs, cupoOfrecidoHasta } =
          await empezado();

        const vuelta = await request(servidor())
          .get(
            `/api/torneos/inscripciones/retorno?TBK_TOKEN=${tokenWs}&TBK_ORDEN_COMPRA=${referencia}`,
          )
          .expect(302);

        expect(vuelta.headers.location).toMatch(
          new RegExp(`/torneos/inscripcion/${token}\\?pago=anulado$`),
        );
        await sigueEnPie(id, cupoOfrecidoHasta);
      });

      it('**un pago rechazado, igual**', async () => {
        const { id, token, tokenWs, cupoOfrecidoHasta } = await empezado();
        pasarela.respuesta = 'RECHAZADA';

        const vuelta = await request(servidor())
          .get(`/api/torneos/inscripciones/retorno?token_ws=${tokenWs}`)
          .expect(302);

        expect(vuelta.headers.location).toMatch(
          new RegExp(`/torneos/inscripcion/${token}\\?pago=rechazado$`),
        );
        await sigueEnPie(id, cupoOfrecidoHasta);
      });

      it('**volver atrás no la suelta**', async () => {
        const { id, token, cupoOfrecidoHasta } = await empezado();

        const body = (
          await request(servidor())
            .post(`/api/torneos/inscripciones/${token}/soltar`)
            .expect(201)
        ).body as Record<string, unknown>;

        expect(body).toEqual({ soltada: false });
        await sigueEnPie(id, cupoOfrecidoHasta);
      });
    });
  });
});
