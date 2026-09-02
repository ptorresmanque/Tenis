import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { sembrarCategoriasDeJuego } from '../prisma/seed-torneos';
import {
  ConceptoPago,
  EstadoPagoInscripcion,
} from '../src/generated/prisma/client';
import {
  FALLOS_TOLERADOS,
  IntentosFallidos,
} from '../src/identidad/intentos';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T66: el pago de la inscripción.
 *
 * Dos caminos que no se parecen: **Webpay pasa por `pagos`** y el comprobante **no** —
 * no hay pasarela ni nada que anular, es un archivo que el admin mira—. Lo que sí
 * comparten es el efecto: hasta que uno de los dos cierra, la inscripción ocupa cupo
 * pero no entra al cuadro.
 */
describe('El pago de la inscripción a un torneo', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;
  let carpeta: string;

  const MARCA = 'Copa con costo';
  const APELLIDO = 'DePago';
  const DOMINIO = '@pago.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  /**
   * Las dos llaves del freno: el formulario y la subida del comprobante.
   *
   * Todas las peticiones del test salen de la misma IP y comparten el contador. Que
   * haya que perdonarlas es, en sí, la prueba de que los dos frenos están puestos.
   */
  const LLAVES = [
    'inscripcion|::ffff:127.0.0.1',
    'comprobante|::ffff:127.0.0.1',
  ];

  let torneoId: number;
  let cuadroPagado: number;
  let cuartaId: number;

  /** Una imagen de verdad: el pipeline la reencodifica, así que tiene que serlo. */
  const unaImagen = () =>
    sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 10, g: 90, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();

  const idDe = async (nombre: string) =>
    (await prisma.categoriaJuego.findUniqueOrThrow({ where: { nombre } })).id;

  /** Los datos del formulario, con un teléfono distinto en cada llamada. */
  const datos = (extra: Record<string, unknown> = {}) => ({
    nombre: 'Rodrigo',
    apellido: APELLIDO,
    telefono: `+56 9 7${Math.floor(Math.random() * 10_000_000)
      .toString()
      .padStart(7, '0')}`,
    procedencia: 'Club de Ñuñoa',
    categoriaJuegoId: cuartaId,
    // **El medio de pago es obligatorio cuando el cuadro cobra**: sin él la
    // inscripción se rechaza y no queda fila. Webpay es el camino que no adjunta nada.
    medioPago: 'WEBPAY',
    ...extra,
  });

  const inscribirse = (extra: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post(`/api/torneos/${torneoId}/inscripcion`)
      .send(datos(extra));

  /**
   * El otro camino: el formulario viaja como multipart con la imagen adentro.
   *
   * Es un solo envío a propósito — ver `SPEC-torneos.md` § El pago no es un segundo
   * paso opcional.
   */
  const inscribirseTransfiriendo = (
    bytes: Buffer | null,
    extra: Record<string, unknown> = {},
  ) => {
    const envio = request(app.getHttpServer()).post(
      `/api/torneos/${torneoId}/inscripcion`,
    );

    for (const [campo, valor] of Object.entries(
      datos({ medioPago: 'TRANSFERENCIA', ...extra }),
    )) {
      envio.field(campo, String(valor));
    }

    return bytes
      ? envio.attach('comprobante', bytes, 'transferencia.jpg')
      : envio;
  };

  const subirComprobante = (token: string, bytes: Buffer) =>
    request(app.getHttpServer())
      .post(`/api/torneos/inscripciones/${token}/comprobante`)
      .attach('comprobante', bytes, 'transferencia.jpg');

  const limpiar = async () => {
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatPago' } },
    });
  };

  const crearTorneo = async (montoInscripcionClp = 15000) => {
    const categoria = await prisma.categoriaTorneo.create({
      data: {
        nombre: `CatPago ${Date.now()}${Math.random()}`,
        puntosCampeon: 250,
      },
    });

    return prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}`,
        fechaInicio: new Date('2027-12-01T00:00:00.000Z'),
        fechaFin: new Date('2027-12-07T00:00:00.000Z'),
        cierreInscripcion: new Date('2027-11-25T00:00:00.000Z'),
        cuadros: {
          create: {
            categoriaId: categoria.id,
            categoriaJuegoId: cuartaId,
            cupo: 8,
            montoInscripcionClp,
          },
        },
      },
      select: { id: true, cuadros: { select: { id: true } } },
    });
  };

  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'comprobantes-'));
    process.env.SUBIDAS_DIR = carpeta;

    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    await sembrarCategoriasDeJuego(prisma);
    cuartaId = await idDe('4ª');

    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    for (const [sufijo, esAdmin] of [
      ['jefa', true],
      ['socio', false],
    ] as const) {
      await request(app.getHttpServer())
        .post('/api/auth/registro')
        .send({
          email: `${sufijo}${DOMINIO}`,
          contrasena: CONTRASENA,
          nombre: sufijo,
          apellido: 'De pago',
        })
        .expect(201);
      await prisma.usuario.update({
        where: { email: `${sufijo}${DOMINIO}` },
        data: { esAdmin },
      });
    }

    const entrar = async (sufijo: string) =>
      (
        (
          await request(app.getHttpServer())
            .post('/api/auth/login')
            .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA })
            .expect(204)
        ).headers['set-cookie'] as unknown as string[]
      )[0];

    cookieAdmin = await entrar('jefa');
    cookieSocio = await entrar('socio');
  });

  afterAll(async () => {
    await limpiar();
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    delete process.env.SUBIDAS_DIR;
    await rm(carpeta, { recursive: true, force: true });
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();
    for (const llave of LLAVES) app.get(IntentosFallidos).perdonar(llave);

    const torneo = await crearTorneo();
    torneoId = torneo.id;
    cuadroPagado = torneo.cuadros[0].id;
  });

  it('**con monto, la inscripción nace pendiente de pago**', async () => {
    const respuesta = await inscribirse().expect(201);

    expect(respuesta.body).toMatchObject({
      estadoPago: EstadoPagoInscripcion.PENDIENTE,
      montoClp: 15000,
    });
  });

  it('**sin monto, la inscripción nace exenta y no pasa por pagos**', async () => {
    const gratis = await crearTorneo(0);
    const respuesta = await request(app.getHttpServer())
      .post(`/api/torneos/${gratis.id}/inscripcion`)
      .send({
        nombre: 'Gratis',
        apellido: APELLIDO,
        telefono: '+56 9 6666 5555',
        procedencia: 'Club',
        categoriaJuegoId: cuartaId,
      })
      .expect(201);

    expect((respuesta.body as { estadoPago: string }).estadoPago).toBe(
      EstadoPagoInscripcion.EXENTA,
    );
  });

  describe('el pago se exige en el mismo envío', () => {
    /** Cuántas inscripciones tiene el cuadro. Cero es "no quedó nada escrito". */
    const cuantas = () =>
      prisma.inscripcionTorneo.count({
        where: { torneoCategoriaId: cuadroPagado },
      });

    it('**sin elegir cómo se paga, no hay inscripción**', async () => {
      // Era el agujero: la inscripción se creaba igual y el pago quedaba en un panel
      // que se podía cerrar. El cupo se llenaba con gente que nunca pagó.
      const respuesta = await inscribirse({ medioPago: undefined }).expect(400);

      expect((respuesta.body as { message: string }).message).toContain(
        'cómo vas a pagar',
      );
      expect(await cuantas()).toBe(0);
    });

    it('**transferir sin adjuntar el comprobante no inscribe a nadie**', async () => {
      const respuesta = await inscribirseTransfiriendo(null).expect(400);

      expect((respuesta.body as { message: string }).message).toContain(
        'comprobante',
      );
      expect(await cuantas()).toBe(0);
    });

    it('con el comprobante adjunto, la inscripción nace con su imagen', async () => {
      const respuesta = await inscribirseTransfiriendo(
        await unaImagen(),
      ).expect(201);

      const guardada = await prisma.inscripcionTorneo.findUniqueOrThrow({
        where: { id: (respuesta.body as { id: number }).id },
      });
      expect(guardada.comprobanteRuta).toMatch(/^comprobantes\//);
      expect(guardada.estadoPago).toBe(EstadoPagoInscripcion.PENDIENTE);
    });

    it('**un archivo que no es imagen no deja inscripción ni archivo**', async () => {
      // La imagen se procesa antes de escribir la inscripción: al revés, quien manda
      // basura se queda con el cupo tomado y sin comprobante que el club pueda mirar.
      await inscribirseTransfiriendo(
        Buffer.from('<?php system($_GET["c"]); ?>'),
      ).expect(400);

      expect(await cuantas()).toBe(0);
    });

    it('**las franjas horarias sobreviven al multipart**', async () => {
      // En multipart todo campo es texto, así que las franjas viajan como JSON. Sin
      // leerlas de vuelta, quien transfiere pierde en silencio las horas en que no
      // puede jugar y T67 le programa un partido a esa hora.
      const respuesta = await inscribirseTransfiriendo(await unaImagen(), {
        restricciones: JSON.stringify([
          { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
        ]),
      }).expect(201);

      const guardada = await prisma.inscripcionTorneo.findUniqueOrThrow({
        where: { id: (respuesta.body as { id: number }).id },
        include: { restricciones: true },
      });
      expect(guardada.restricciones).toHaveLength(1);
      expect(guardada.restricciones[0].horaDesde).toBe('09:00');
    });

    it('un torneo gratis no pregunta cómo se paga', async () => {
      const gratis = await crearTorneo(0);

      await request(app.getHttpServer())
        .post(`/api/torneos/${gratis.id}/inscripcion`)
        .send({
          nombre: 'Gratis',
          apellido: APELLIDO,
          telefono: '+56 9 6666 4444',
          procedencia: 'Club',
          categoriaJuegoId: cuartaId,
        })
        .expect(201);
    });
  });

  it('**un pendiente ocupa cupo**: el cupo se llena por orden de llegada, no de banco', async () => {
    // Al revés —contar solo los pagados— quien transfirió primero un viernes por la
    // tarde quedaría fuera porque su banco es más lento.
    const primera = await inscribirse().expect(201);

    const lista = await request(app.getHttpServer())
      .get(`/api/admin/cuadros/${cuadroPagado}/inscripciones`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    expect((lista.body as { inscritos: unknown[] }).inscritos).toHaveLength(1);
    expect(primera.status).toBe(201);
  });

  /**
   * **El que no paga no queda inscrito.**
   *
   * Lo encontró el club: eligiendo Webpay y **cerrando la ventana de pago**, la
   * inscripción se quedaba viva y ocupando cupo para siempre. La pasarela no avisa
   * cuando alguien cierra una pestaña, así que la única salida es el mismo barrido con
   * que `reservas` libera una cancha abandonada (`SPEC-pagos.md` § Expiración).
   */
  describe('la inscripción sin pagar no sobrevive', () => {
    const HACE_MEDIA_HORA = new Date(Date.now() - 30 * 60_000);

    /** Envejece la inscripción para que caiga fuera de la ventana del pago. */
    const envejecer = (id: number) =>
      prisma.inscripcionTorneo.update({
        where: { id },
        data: { inscritaEn: HACE_MEDIA_HORA },
      });

    /** Cualquier lectura del cuadro barre lo abandonado: acá, el calendario. */
    const mirarElCalendario = () =>
      request(app.getHttpServer())
        .get('/api/torneos/publicos?anio=2027')
        .expect(200);

    const sigueViva = async (id: number) =>
      (await prisma.inscripcionTorneo.findUnique({ where: { id } })) !== null;

    it('**cerrar la ventana de Webpay suelta el cupo**', async () => {
      const { id } = (await inscribirse().expect(201)).body as { id: number };
      await envejecer(id);

      await mirarElCalendario();

      expect(await sigueViva(id)).toBe(false);
    });

    it('el cupo vuelve a estar libre, que es el punto', async () => {
      const { id } = (await inscribirse().expect(201)).body as { id: number };
      await envejecer(id);

      const calendario = (await mirarElCalendario()).body as {
        id: number;
        categorias: { cuposLibres: number; cupo: number }[];
      }[];
      const suyo = calendario.find((t) => t.id === torneoId);

      expect(suyo?.categorias[0].cuposLibres).toBe(8);
      expect(await sigueViva(id)).toBe(false);
    });

    it('**la de quien está pagando en este momento no se toca**', async () => {
      const { id } = (await inscribirse().expect(201)).body as { id: number };
      await envejecer(id);

      // Su transacción empezó **ahora**: la persona puede estar tecleando su tarjeta
      // en este segundo. Borrarla acá sería cobrarle por un cupo que le quitamos.
      //
      // La fila se escribe directo y no se pide por el endpoint de pago: lo que este
      // test comprueba es la regla del barrido, no el viaje a la pasarela, y hacerlo
      // por el endpoint ataría la suite al ambiente de integración de Transbank.
      await prisma.transaccion.create({
        data: {
          referencia: `pagando-${id}`,
          concepto: ConceptoPago.INSCRIPCION_TORNEO,
          conceptoId: id,
          montoClp: 15000,
          pasarela: 'doble',
        },
      });

      await mirarElCalendario();

      expect(await sigueViva(id)).toBe(true);
    });

    it('**pero la transacción que ya venció no la salva**', async () => {
      // Es el caso real: la persona apretó "pagar", cerró la ventana, y su transacción
      // quedó pendiente hasta que el barrido de los 15 minutos la expiró.
      const { id } = (await inscribirse().expect(201)).body as { id: number };
      await envejecer(id);
      await prisma.transaccion.create({
        data: {
          referencia: `vencida-${id}`,
          concepto: ConceptoPago.INSCRIPCION_TORNEO,
          conceptoId: id,
          montoClp: 15000,
          pasarela: 'doble',
          creadaEn: HACE_MEDIA_HORA,
        },
      });

      await mirarElCalendario();

      expect(await sigueViva(id)).toBe(false);
    });

    it('**la transferencia con su comprobante no se toca**', async () => {
      // Ahí no hay pasarela ni ventana que expirar: hay una imagen esperando que el
      // admin la mire, y puede tardar días.
      const { id } = (
        await inscribirseTransfiriendo(await unaImagen()).expect(201)
      ).body as { id: number };
      await envejecer(id);

      await mirarElCalendario();

      expect(await sigueViva(id)).toBe(true);
    });

    it('**la que anotó el admin a mano no se toca**', async () => {
      // Es el jugador que va a pagar en efectivo en el mesón: no eligió medio de pago
      // y nadie más que el club va a resolver su inscripción.
      const jugador = await prisma.jugador.create({
        data: { nombre: 'Efectivo', apellido: APELLIDO, telefono: null },
      });
      const inscripcion = await request(app.getHttpServer())
        .post(`/api/admin/cuadros/${cuadroPagado}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .send({ jugadorId: jugador.id })
        .expect(201);
      const { id } = inscripcion.body as { id: number };
      await envejecer(id);

      await mirarElCalendario();

      expect(await sigueViva(id)).toBe(true);
    });

    it('**apretar "Anular compra" en Webpay suelta el cupo en el acto**', async () => {
      // Es el único abandono que la pasarela avisa: vuelve sin `token_ws` y con
      // `TBK_ORDEN_COMPRA`. No hay por qué hacerle esperar los 15 minutos al cupo, y
      // la pantalla le dice a la persona que no quedó inscrita — así que es verdad.
      const { id } = (await inscribirse().expect(201)).body as { id: number };
      const referencia = `anulada-${id}`;
      await prisma.transaccion.create({
        data: {
          referencia,
          concepto: ConceptoPago.INSCRIPCION_TORNEO,
          conceptoId: id,
          montoClp: 15000,
          pasarela: 'doble',
        },
      });

      // **Sin envejecerla**: el punto es que no espera la ventana del pago.
      await request(app.getHttpServer())
        .get(
          `/api/torneos/inscripciones/retorno?TBK_TOKEN=abc&TBK_ORDEN_COMPRA=${referencia}`,
        )
        .expect(302);

      expect(await sigueViva(id)).toBe(false);
    });

    it('una referencia inventada no borra la inscripción de nadie', async () => {
      // El parámetro lo escribe quien vuelve del navegador, así que es dato hostil: la
      // referencia son 26 caracteres de un UUID y no se adivina, pero el camino borra
      // filas y tiene que estar probado.
      const { id } = (await inscribirse().expect(201)).body as { id: number };

      await request(app.getHttpServer())
        .get('/api/torneos/inscripciones/retorno?TBK_ORDEN_COMPRA=no-existe')
        .expect(302);

      expect(await sigueViva(id)).toBe(true);
    });

    /**
     * **Volver atrás desde Webpay no es cerrar la pestaña: la persona vuelve a estar
     * en nuestra página.**
     *
     * Con solo el barrido, apretar "atrás" en el navegador dejaba el cupo tomado hasta
     * quince minutos —y, peor, dejaba a esa persona **sin poder volver a inscribirse**,
     * porque su propia inscripción fantasma le contestaba "ya estás inscrito"—.
     */
    describe('volver atrás sin pagar', () => {
      const soltar = (token: string) =>
        request(app.getHttpServer()).post(
          `/api/torneos/inscripciones/${token}/soltar`,
        );

      it('**suelta el cupo en el acto, sin esperar la ventana**', async () => {
        const { id, token } = (await inscribirse().expect(201)).body as {
          id: number;
          token: string;
        };
        // Con su transacción abierta, que es lo que protege del barrido: la persona
        // apretó "pagar" y la pasarela le abrió el formulario.
        await prisma.transaccion.create({
          data: {
            referencia: `atras-${id}`,
            concepto: ConceptoPago.INSCRIPCION_TORNEO,
            conceptoId: id,
            montoClp: 15000,
            pasarela: 'doble',
          },
        });

        const respuesta = await soltar(token).expect(201);

        expect((respuesta.body as { soltada: boolean }).soltada).toBe(true);
        expect(await sigueViva(id)).toBe(false);
      });

      it('**y la deja volver a inscribirse enseguida**', async () => {
        // Es el daño que no se veía: sin soltar, su propia inscripción sin pagar le
        // contestaba "ya estás inscrito" y la dejaba afuera un cuarto de hora.
        const suyos = { nombre: 'Vuelve', telefono: '+56 9 3131 3131' };
        const { token } = (await inscribirse(suyos).expect(201)).body as {
          token: string;
        };

        await soltar(token).expect(201);

        await inscribirse(suyos).expect(201);
      });

      it('no suelta una que ya está pagada', async () => {
        const { id, token } = (await inscribirse().expect(201)).body as {
          id: number;
          token: string;
        };
        await prisma.inscripcionTorneo.update({
          where: { id },
          data: { estadoPago: EstadoPagoInscripcion.PAGADA },
        });

        const respuesta = await soltar(token).expect(201);

        expect((respuesta.body as { soltada: boolean }).soltada).toBe(false);
        expect(await sigueViva(id)).toBe(true);
      });

      it('no suelta la transferencia de nadie', async () => {
        const { id, token } = (
          await inscribirseTransfiriendo(await unaImagen()).expect(201)
        ).body as { id: number; token: string };

        await soltar(token).expect(201);

        expect(await sigueViva(id)).toBe(true);
      });

      it('**soltar el cupo devuelve la cuota del freno**', async () => {
        // Sin esto, el flujo que este arreglo inventó —vuelves atrás, se suelta el
        // cupo, te inscribes de nuevo— chocaba contra el limitador a la quinta vuelta
        // y le decía a la persona que esperara quince minutos. El freno cuenta cupos
        // retenidos: el que se soltó ya no retiene nada.
        const tokens: string[] = [];

        for (let i = 0; i < FALLOS_TOLERADOS; i += 1) {
          const { token } = (await inscribirse().expect(201)).body as {
            token: string;
          };
          tokens.push(token);
        }

        // Con la cuota agotada, el siguiente rebota.
        await inscribirse().expect(429);

        await soltar(tokens[0]).expect(201);

        await inscribirse().expect(201);
      });

      it('**un token inventado no borra nada y no dice si existía**', async () => {
        // Responde igual que el que ya estaba pagado: quien prueba llaves ajenas no
        // tiene por qué enterarse de si acertó.
        const respuesta = await soltar(
          '11111111-2222-3333-4444-555555555555',
        ).expect(201);

        expect((respuesta.body as { soltada: boolean }).soltada).toBe(false);
      });
    });

    it('la ya pagada tampoco, por si hiciera falta decirlo', async () => {
      const { id } = (await inscribirse().expect(201)).body as { id: number };
      await prisma.inscripcionTorneo.update({
        where: { id },
        data: {
          inscritaEn: HACE_MEDIA_HORA,
          estadoPago: EstadoPagoInscripcion.PAGADA,
        },
      });

      await mirarElCalendario();

      expect(await sigueViva(id)).toBe(true);
    });
  });

  describe('el comprobante de transferencia', () => {
    const conComprobante = async () => {
      const inscripcion = (await inscribirse().expect(201)).body as {
        id: number;
        token: string;
      };
      await subirComprobante(inscripcion.token, await unaImagen()).expect(201);

      return inscripcion;
    };

    it('se sube y queda enganchado a la inscripción', async () => {
      const { id } = await conComprobante();

      const guardada = await prisma.inscripcionTorneo.findUniqueOrThrow({
        where: { id },
      });
      expect(guardada.comprobanteRuta).toMatch(/^comprobantes\//);
    });

    it('**un archivo que no es imagen se rechaza**', async () => {
      const inscripcion = (await inscribirse().expect(201)).body as {
        token: string;
      };

      await subirComprobante(
        inscripcion.token,
        Buffer.from('<?php system($_GET["c"]); ?>'),
      ).expect(400);
    });

    it('**el segundo comprobante reemplaza al primero**', async () => {
      // Sin esto, una inscripción es un buzón de subida ilimitado en un endpoint sin
      // sesión: el cobro, que es la defensa del formulario público, no cubre este
      // camino porque acá no hay pasarela que cobre.
      const { id, token } = await conComprobante();
      const primera = (
        await prisma.inscripcionTorneo.findUniqueOrThrow({ where: { id } })
      ).comprobanteRuta;

      await subirComprobante(token, await unaImagen()).expect(201);

      const segunda = (
        await prisma.inscripcionTorneo.findUniqueOrThrow({ where: { id } })
      ).comprobanteRuta;
      expect(segunda).not.toBe(primera);

      // **Y el archivo viejo se fue del disco**, que es la mitad que importa: sin esto
      // "reemplazar" sería "acumular", y el buzón seguiría abierto. Comprobar solo que
      // la ruta cambió deja pasar exactamente ese defecto — verificado por mutación.
      await expect(stat(join(carpeta, primera!))).rejects.toThrow();
      await expect(stat(join(carpeta, segunda!))).resolves.toBeDefined();
    });

    it('no se acepta sobre una inscripción ya resuelta', async () => {
      const { id, token } = await conComprobante();
      await request(app.getHttpServer())
        .post(`/api/admin/inscripciones/${id}/aprobar`)
        .set('Cookie', cookieAdmin)
        .expect(200);

      await subirComprobante(token, await unaImagen()).expect(409);
    });

    it('no se acepta sobre una inscripción gratis', async () => {
      const gratis = await crearTorneo(0);
      const inscripcion = (
        await request(app.getHttpServer())
          .post(`/api/torneos/${gratis.id}/inscripcion`)
          .send({
            nombre: 'Gratis',
            apellido: APELLIDO,
            telefono: '+56 9 4444 3333',
            procedencia: 'Club',
            categoriaJuegoId: cuartaId,
          })
          .expect(201)
      ).body as { token: string };

      await subirComprobante(inscripcion.token, await unaImagen()).expect(409);
    });

    it('**el comprobante se sirve solo al admin**', async () => {
      // Lleva el nombre, el banco y el número de cuenta de una persona: es dato del
      // club, no del sitio público. Dos carpetas con dos reglas.
      const { id } = await conComprobante();

      await request(app.getHttpServer())
        .get(`/api/admin/inscripciones/${id}/comprobante`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/api/admin/inscripciones/${id}/comprobante`)
        .set('Cookie', cookieSocio)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/admin/inscripciones/${id}/comprobante`)
        .set('Cookie', cookieAdmin)
        .expect(200);
    });

    it('**la llave es lo que protege el comprobante de otro**', async () => {
      // Los ids son correlativos. Sin la llave, un desconocido pisaba la transferencia
      // real de alguien y conseguía que el club se la rechazara —y rechazar libera el
      // cupo, así que además lo dejaba fuera del torneo—. Lo destapó una sonda.
      const { id, token } = await conComprobante();
      const buena = (
        await prisma.inscripcionTorneo.findUniqueOrThrow({ where: { id } })
      ).comprobanteRuta;

      await subirComprobante('no-es-la-llave', await unaImagen()).expect(404);
      await subirComprobante(String(id), await unaImagen()).expect(404);

      expect(
        (await prisma.inscripcionTorneo.findUniqueOrThrow({ where: { id } }))
          .comprobanteRuta,
      ).toBe(buena);
      expect(token).not.toBe(String(id));
    });

    it('aparece en la bandeja del admin, con a quién llamar', async () => {
      await conComprobante();

      const bandeja = (
        await request(app.getHttpServer())
          .get('/api/admin/inscripciones/pendientes')
          .set('Cookie', cookieAdmin)
          .expect(200)
      ).body as { telefono: string | null; montoClp: number }[];

      expect(bandeja.length).toBeGreaterThan(0);
      expect(bandeja[0].telefono).toBeTruthy();
      expect(bandeja[0].montoClp).toBe(15000);
    });
  });

  describe('el admin resuelve', () => {
    const pendiente = async () => {
      const inscripcion = (await inscribirse().expect(201)).body as {
        id: number;
      };

      return inscripcion.id;
    };

    it('aprobar la deja pagada y dentro del cuadro', async () => {
      const id = await pendiente();

      await request(app.getHttpServer())
        .post(`/api/admin/inscripciones/${id}/aprobar`)
        .set('Cookie', cookieAdmin)
        .expect(200);

      const guardada = await prisma.inscripcionTorneo.findUniqueOrThrow({
        where: { id },
      });
      expect(guardada.estadoPago).toBe(EstadoPagoInscripcion.PAGADA);
      expect(guardada.estado).toBe('INSCRITA');
    });

    it('**rechazar libera el cupo**', async () => {
      const id = await pendiente();

      await request(app.getHttpServer())
        .post(`/api/admin/inscripciones/${id}/rechazar`)
        .set('Cookie', cookieAdmin)
        .send({ motivo: 'El comprobante es de otro monto' })
        .expect(200);

      const guardada = await prisma.inscripcionTorneo.findUniqueOrThrow({
        where: { id },
      });
      expect(guardada.estadoPago).toBe(EstadoPagoInscripcion.RECHAZADA);
      // Sale del cuadro: dejarla dentro sin pagar es un cupo ocupado por alguien que
      // no va a jugar.
      expect(guardada.estado).toBe('RETIRADA');
    });

    it('rechazar sin motivo se rechaza: el club se lo va a decir por teléfono', async () => {
      const id = await pendiente();

      await request(app.getHttpServer())
        .post(`/api/admin/inscripciones/${id}/rechazar`)
        .set('Cookie', cookieAdmin)
        .send({ motivo: '' })
        .expect(400);
    });

    it('**dos admins no resuelven la misma fila dos veces**', async () => {
      const id = await pendiente();

      const [una, otra] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/admin/inscripciones/${id}/aprobar`)
          .set('Cookie', cookieAdmin),
        request(app.getHttpServer())
          .post(`/api/admin/inscripciones/${id}/rechazar`)
          .set('Cookie', cookieAdmin)
          .send({ motivo: 'No cuadra' }),
      ]);

      expect([una.status, otra.status].sort()).toEqual([200, 409]);
    });

    it('solo el admin toca la bandeja', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/inscripciones/pendientes')
        .set('Cookie', cookieSocio)
        .expect(403);
    });
  });

  it('**la vuelta de Webpay existe y no se queda en un 404**', async () => {
    // Faltaba: `iniciar` apuntaba a esta ruta y la ruta no existía. La persona pagaba,
    // volvía a un 404 y su inscripción se quedaba pendiente hasta que la transacción
    // expiraba sola. Plata cobrada sin que el club supiera que se pagó.
    const anulado = await request(app.getHttpServer())
      .get('/api/torneos/inscripciones/retorno')
      .expect(302);

    expect(anulado.headers.location).toContain('pago=anulado');
  });

  it('iniciar el pago exige la llave, no el número', async () => {
    const inscripcion = (await inscribirse().expect(201)).body as {
      id: number;
      token: string;
    };

    await request(app.getHttpServer())
      .post(`/api/torneos/inscripciones/${inscripcion.id}/pago`)
      .expect(404);

    // Con la llave sí llega al puerto de pagos. En este entorno la pasarela es el
    // doble, así que responde; lo que importa acá es que no se rechace por la llave.
    const conLlave = await request(app.getHttpServer()).post(
      `/api/torneos/inscripciones/${inscripcion.token}/pago`,
    );
    expect(conLlave.status).not.toBe(404);
  });

  it('**armar el cuadro con un pago pendiente se rechaza, y lo dice**', async () => {
    await inscribirse().expect(201);
    await inscribirse().expect(201);

    const respuesta = await request(app.getHttpServer())
      .post(`/api/admin/cuadros/${cuadroPagado}/armar`)
      .set('Cookie', cookieAdmin)
      .expect(409);

    expect((respuesta.body as { message: string }).message).toContain(
      'sin confirmar',
    );
  });

  it('con los pagos aprobados, el cuadro se arma', async () => {
    const ids = [
      ((await inscribirse().expect(201)).body as { id: number }).id,
      ((await inscribirse().expect(201)).body as { id: number }).id,
    ];

    for (const id of ids) {
      await request(app.getHttpServer())
        .post(`/api/admin/inscripciones/${id}/aprobar`)
        .set('Cookie', cookieAdmin)
        .expect(200);
    }

    await request(app.getHttpServer())
      .post(`/api/admin/cuadros/${cuadroPagado}/armar`)
      .set('Cookie', cookieAdmin)
      .expect(201);
  });
});
