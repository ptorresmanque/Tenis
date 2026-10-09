import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { sembrarCategoriasDeJuego } from '../src/arranque';
import { EstadoSocio } from '../src/generated/prisma/client';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { IntentosFallidos } from '../src/identidad/intentos';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T131: los correos al inscrito (decisión 7 de la sexta parte). "Inscripción recibida" al
 * inscribirse, y "pago confirmado" o "pago rechazado" cuando el club resuelve o Webpay
 * confirma. Cada uno sale una vez, aunque Webpay repita el aviso.
 */
describe('Los correos al inscrito', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let carpeta: string;
  let envios: IntentosFallidos;
  let imagen: Buffer;

  const enviados: CorreoSaliente[] = [];
  const enviador = {
    enviar: (correo: CorreoSaliente) => {
      enviados.push(correo);
      return Promise.resolve();
    },
  };

  const DOMINIO = '@correos-inscrito.ejemplo.cl';
  const INSCRITO = `camila${DOMINIO}`;
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Copa de los correos';
  const APELLIDO = 'DeLosCorreos';
  const LLAVE = 'inscripcion|127.0.0.1';

  let cookieAdmin: string;
  let socioId: number;
  let cuartaId: number;

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  /** Los que le llegaron a una dirección. Los admins reciben los suyos aparte (T130). */
  const para = (email: string) =>
    enviados.filter((correo) => correo.para === email);

  const datos = (extra: Record<string, unknown> = {}) => ({
    nombre: 'Camila',
    apellido: APELLIDO,
    telefono: `9 6${Math.floor(Math.random() * 10_000_000)
      .toString()
      .padStart(7, '0')}`,
    procedencia: 'Club de Ñuñoa',
    email: INSCRITO,
    categoriaJuegoId: cuartaId,
    ...extra,
  });

  const crearTorneo = async (montoInscripcionClp = 15_000) => {
    const categoria = await prisma.categoriaTorneo.create({
      data: {
        nombre: `CatCorreos ${Date.now()}${Math.random()}`,
        puntosCampeon: 250,
      },
    });

    return prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}${Math.random()}`,
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

  const inscribirse = async (
    montoInscripcionClp: number,
    extra: Record<string, unknown> = {},
  ) => {
    const torneo = await crearTorneo(montoInscripcionClp);
    const respuesta = await request(servidor())
      .post(`/api/torneos/${torneo.id}/inscripcion`)
      .send(datos(extra))
      .expect(201);

    return respuesta.body as { id: number; token: string };
  };

  const transfiriendo = async () => {
    const torneo = await crearTorneo();
    const envio = request(servidor()).post(
      `/api/torneos/${torneo.id}/inscripcion`,
    );

    for (const [campo, valor] of Object.entries(
      datos({ medioPago: 'TRANSFERENCIA' }),
    )) {
      envio.field(campo, String(valor));
    }

    return (
      await envio.attach('comprobante', imagen, 'transferencia.jpg').expect(201)
    ).body as { id: number };
  };

  const limpiar = async () => {
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatCorreos' } },
    });
  };

  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'comprobantes-correos-'));
    process.env.SUBIDAS_DIR = carpeta;
    imagen = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 10, g: 90, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();

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
    envios = app.get(IntentosFallidos);
    await sembrarCategoriasDeJuego(prisma);
    cuartaId = (
      await prisma.categoriaJuego.findUniqueOrThrow({ where: { nombre: '4ª' } })
    ).id;

    await limpiar();
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    for (const sufijo of ['jefa', 'socia']) {
      await request(servidor())
        .post('/api/auth/registro')
        .send({
          email: `${sufijo}${DOMINIO}`,
          contrasena: CONTRASENA,
          nombre: sufijo === 'jefa' ? 'Jefa' : 'Javiera',
          apellido: APELLIDO,
        })
        .expect(201);
    }
    await prisma.usuario.update({
      where: { email: `jefa${DOMINIO}` },
      data: { esAdmin: true },
    });
    const socia = await prisma.usuario.findUniqueOrThrow({
      where: { email: `socia${DOMINIO}` },
    });
    socioId = (
      await prisma.socio.create({
        data: {
          usuarioId: socia.id,
          numeroSocio: `COR-${Date.now()}`,
          estado: EstadoSocio.ACTIVO,
          fechaIngreso: new Date('2020-01-01T00:00:00.000Z'),
          alDiaHasta: new Date('2027-01-01T00:00:00.000Z'),
        },
        select: { id: true },
      })
    ).id;

    cookieAdmin = (
      (
        await request(servidor())
          .post('/api/auth/login')
          .send({ email: `jefa${DOMINIO}`, contrasena: CONTRASENA })
          .expect(204)
      ).headers['set-cookie'] as unknown as string[]
    )[0];
  });

  afterAll(async () => {
    await limpiar();
    await prisma.socio.deleteMany({ where: { id: socioId } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
    await rm(carpeta, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await limpiar();
    envios.perdonar(LLAVE);
    enviados.length = 0;
  });

  describe('inscripción recibida', () => {
    it('sale al inscribirse en un cuadro gratis', async () => {
      await inscribirse(0);

      expect(para(INSCRITO)).toHaveLength(1);
      expect(para(INSCRITO)[0].asunto).toMatch(/^Inscripción recibida: /);
      expect(para(INSCRITO)[0].cuerpo).toContain('Quedaste inscrito');
    });

    it('con transferencia, dice que el club revisa el comprobante', async () => {
      await transfiriendo();

      expect(para(INSCRITO)).toHaveLength(1);
      expect(para(INSCRITO)[0].cuerpo).toContain(
        'El club está revisando tu comprobante',
      );
    });

    it('**con Webpay no sale todavía**: el cupo se suelta si no paga', async () => {
      // La confirmación es el "pago confirmado", que sale cuando Webpay autoriza.
      await inscribirse(15_000, { medioPago: 'WEBPAY' });

      expect(para(INSCRITO)).toHaveLength(0);
    });

    it('**al socio que anota el admin sin correo le llega al de su cuenta**', async () => {
      const torneo = await crearTorneo(0);

      await request(servidor())
        .post(`/api/admin/cuadros/${torneo.cuadros[0].id}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .send({ socioId })
        .expect(201);

      expect(para(`socia${DOMINIO}`)).toHaveLength(1);
    });
  });

  describe('pago confirmado', () => {
    it('**Webpay lo confirma una vez, aunque repita el aviso**', async () => {
      const { token } = await inscribirse(15_000, { medioPago: 'WEBPAY' });
      const pago = await request(servidor())
        .post(`/api/torneos/inscripciones/${token}/pago`)
        .expect(201);
      const tokenWs = (pago.body as { tokenPasarela: string }).tokenPasarela;

      for (let vez = 0; vez < 2; vez++) {
        await request(servidor())
          .get(`/api/torneos/inscripciones/retorno?token_ws=${tokenWs}`)
          .expect(302);
      }

      expect(para(INSCRITO)).toHaveLength(1);
      expect(para(INSCRITO)[0].asunto).toMatch(/^Pago confirmado: /);
    });

    it('el club confirma el comprobante, y sale una vez', async () => {
      const { id } = await transfiriendo();
      enviados.length = 0;

      await request(servidor())
        .post(`/api/admin/inscripciones/${id}/aprobar`)
        .set('Cookie', cookieAdmin)
        .send({})
        .expect(200);
      // El segundo clic choca con el 409 y no manda nada.
      await request(servidor())
        .post(`/api/admin/inscripciones/${id}/aprobar`)
        .set('Cookie', cookieAdmin)
        .send({})
        .expect(409);

      expect(para(INSCRITO)).toHaveLength(1);
      expect(para(INSCRITO)[0].asunto).toMatch(/^Pago confirmado: /);
    });
  });

  it('**pago rechazado, con el motivo y que el cupo quedó libre**', async () => {
    const { id } = await transfiriendo();
    enviados.length = 0;

    await request(servidor())
      .post(`/api/admin/inscripciones/${id}/rechazar`)
      .set('Cookie', cookieAdmin)
      .send({ motivo: 'La transferencia no llegó' })
      .expect(200);

    expect(para(INSCRITO)).toHaveLength(1);
    expect(para(INSCRITO)[0].asunto).toMatch(/^Pago rechazado: /);
    expect(para(INSCRITO)[0].cuerpo).toContain(
      'Motivo: La transferencia no llegó',
    );
  });

  it('**una inscripción sin correo, de las de antes, no manda nada y no falla**', async () => {
    const { id } = await transfiriendo();
    await prisma.inscripcionTorneo.update({
      where: { id },
      data: { email: null },
    });
    enviados.length = 0;

    await request(servidor())
      .post(`/api/admin/inscripciones/${id}/aprobar`)
      .set('Cookie', cookieAdmin)
      .send({})
      .expect(200);

    expect(enviados.filter((c) => !c.para.startsWith('jefa'))).toHaveLength(0);
  });
});
