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
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T130: cuando llega un comprobante de transferencia, sale un correo a cada
 * administrador (decisión 3 de la sexta parte) para que lo revise.
 *
 * Solo con transferencia (A3): Webpay se confirma solo y el efectivo lo anota el admin.
 * Y el que sube el propio admin desde el panel tampoco: ya lo tiene en la mano.
 */
describe('El aviso de un comprobante a los administradores', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let carpeta: string;
  let envios: IntentosFallidos;

  const enviados: CorreoSaliente[] = [];
  let falla: Error | null = null;
  const enviador = {
    enviar: (correo: CorreoSaliente) => {
      if (falla) return Promise.reject(falla);
      enviados.push(correo);
      return Promise.resolve();
    },
  };

  const DOMINIO = '@aviso-comprobante.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Copa del comprobante';
  const APELLIDO = 'DelComprobante';
  const LLAVE = 'inscripcion|127.0.0.1';

  let cookieAdmin: string;
  let cookieSocio: string;
  let cuartaId: number;
  let torneoId: number;

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  /** Los correos de este archivo: otros archivos corren a la vez con sus admins. */
  const avisos = () =>
    enviados.filter((correo) => correo.para.endsWith(DOMINIO));

  /** Una imagen de verdad: el pipeline la reencodifica. Se arma una vez, en `beforeAll`. */
  let imagen: Buffer;
  const unaImagen = () =>
    sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 10, g: 90, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();

  const datos = (extra: Record<string, unknown> = {}) => ({
    nombre: 'Camila',
    apellido: APELLIDO,
    telefono: `9 7${Math.floor(Math.random() * 10_000_000)
      .toString()
      .padStart(7, '0')}`,
    procedencia: 'Club de Ñuñoa',
    email: 'camila@ejemplo.cl',
    categoriaJuegoId: cuartaId,
    ...extra,
  });

  /** Por el formulario, con la imagen en el mismo envío. */
  const transfiriendo = (url: string, cuerpo: Record<string, unknown>) => {
    const envio = request(servidor()).post(url);

    for (const [campo, valor] of Object.entries(cuerpo)) {
      envio.field(campo, String(valor));
    }

    return envio.attach('comprobante', imagen, 'transferencia.jpg');
  };

  const crearCuenta = async (sufijo: string, esAdmin: boolean) => {
    await request(servidor())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: sufijo,
        apellido: APELLIDO,
      })
      .expect(201);

    return (
      await prisma.usuario.update({
        where: { email: `${sufijo}${DOMINIO}` },
        data: { esAdmin },
        select: { id: true },
      })
    ).id;
  };

  const entrar = async (sufijo: string) =>
    (
      (
        await request(servidor())
          .post('/api/auth/login')
          .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA })
          .expect(204)
      ).headers['set-cookie'] as unknown as string[]
    )[0];

  const crearTorneo = async (montoInscripcionClp = 15_000) => {
    const categoria = await prisma.categoriaTorneo.create({
      data: {
        nombre: `CatAviso ${Date.now()}${Math.random()}`,
        puntosCampeon: 250,
      },
    });

    return (
      await prisma.torneo.create({
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
        select: { id: true },
      })
    ).id;
  };

  const limpiar = async () => {
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatAviso' } },
    });
  };

  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'comprobantes-aviso-'));
    imagen = await unaImagen();
    process.env.SUBIDAS_DIR = carpeta;

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
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

    await crearCuenta('jefa', true);
    await crearCuenta('suplente', true);
    const usuarioSocio = await crearCuenta('socia', false);
    await prisma.socio.create({
      data: {
        usuarioId: usuarioSocio,
        numeroSocio: `AVI-${Date.now()}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2020-01-01T00:00:00.000Z'),
        alDiaHasta: new Date('2027-01-01T00:00:00.000Z'),
      },
    });

    cookieAdmin = await entrar('jefa');
    cookieSocio = await entrar('socia');
  });

  afterAll(async () => {
    await limpiar();
    await prisma.socio.deleteMany({
      where: { usuario: { email: { endsWith: DOMINIO } } },
    });
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
    falla = null;
    torneoId = await crearTorneo();
  });

  it('**inscribirse transfiriendo avisa a cada administrador, una vez**', async () => {
    await transfiriendo(
      `/api/torneos/${torneoId}/inscripcion`,
      datos({ medioPago: 'TRANSFERENCIA' }),
    ).expect(201);

    // A los dos admins y no a la socia, que no lo es.
    expect(
      avisos()
        .map((correo) => correo.para)
        .sort(),
    ).toEqual([`jefa${DOMINIO}`, `suplente${DOMINIO}`]);

    const cuadro = await prisma.torneoCategoria.findFirstOrThrow({
      where: { torneoId },
    });
    expect(avisos()[0].asunto).toBe(
      `Comprobante por revisar: Camila ${APELLIDO}, 4ª`,
    );
    expect(avisos()[0].cuerpo).toContain(
      `/administracion/torneos/${torneoId}?cuadro=${cuadro.id}`,
    );
  });

  it('el socio que transfiere también avisa', async () => {
    await transfiriendo(`/api/torneos/${torneoId}/inscripcion-socio`, {
      categoriaJuegoId: cuartaId,
      medioPago: 'TRANSFERENCIA',
    })
      .set('Cookie', cookieSocio)
      .expect(201);

    expect(avisos()).toHaveLength(2);
    expect(avisos()[0].asunto).toBe(
      `Comprobante por revisar: socia ${APELLIDO}, 4ª`,
    );
  });

  it('**subir el comprobante después, con su llave, también avisa**', async () => {
    // Eligió Webpay y al final transfirió: el comprobante llega por su enlace.
    const inscripcion = await request(servidor())
      .post(`/api/torneos/${torneoId}/inscripcion`)
      .send(datos({ medioPago: 'WEBPAY' }))
      .expect(201);
    expect(avisos()).toHaveLength(0);

    await request(servidor())
      .post(
        `/api/torneos/inscripciones/${(inscripcion.body as { token: string }).token}/comprobante`,
      )
      .attach('comprobante', imagen, 'transferencia.jpg')
      .expect(201);

    expect(avisos()).toHaveLength(2);
  });

  it('**Webpay no avisa**: se confirma solo', async () => {
    await request(servidor())
      .post(`/api/torneos/${torneoId}/inscripcion`)
      .send(datos({ medioPago: 'WEBPAY' }))
      .expect(201);

    expect(avisos()).toHaveLength(0);
  });

  it('un cuadro gratis no avisa: no hay nada que revisar', async () => {
    const gratis = await crearTorneo(0);

    await request(servidor())
      .post(`/api/torneos/${gratis}/inscripcion`)
      .send(datos())
      .expect(201);

    expect(avisos()).toHaveLength(0);
  });

  it('**el que sube el admin desde el panel no avisa**: ya lo tiene en la mano', async () => {
    const inscripcion = await request(servidor())
      .post(`/api/torneos/${torneoId}/inscripcion`)
      .send(datos({ medioPago: 'WEBPAY' }))
      .expect(201);

    await request(servidor())
      .post(
        `/api/admin/inscripciones/${(inscripcion.body as { id: number }).id}/comprobante`,
      )
      .set('Cookie', cookieAdmin)
      .attach('comprobante', imagen, 'transferencia.jpg')
      .expect(201);

    expect(avisos()).toHaveLength(0);
  });

  it('**si el correo no sale, la inscripción queda igual**', async () => {
    falla = new Error('sendmail no responde');

    await transfiriendo(
      `/api/torneos/${torneoId}/inscripcion`,
      datos({ medioPago: 'TRANSFERENCIA' }),
    ).expect(201);

    expect(await prisma.inscripcionTorneo.count({ where: { torneoId } })).toBe(
      1,
    );
  });
});
