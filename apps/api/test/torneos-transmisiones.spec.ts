import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { sembrarCategoriasDeJuego } from '../prisma/seed-torneos';
import { Superficie } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T68: la transmisión en vivo, vista dentro del sitio.
 *
 * **Se transmite una cancha durante una jornada, no un partido.** El partido resuelve
 * la suya por cancha y hora, así que un mismo live cubre los ocho partidos que se
 * jugaron ahí.
 *
 * Lo que más cuida este archivo es que **del enlace que pega el admin solo sobreviva el
 * id**: ese valor termina dentro del `src` de un `iframe`, y guardar el texto completo
 * sería dejar que un campo de formulario decida qué sitio se carga dentro del nuestro.
 */
describe('Transmisiones del torneo', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;

  const MARCA = 'Copa transmitida';
  const APELLIDO = 'Transmitido';
  const DOMINIO = '@transmite.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const CANCHA = 'Cancha con cámara';

  /** Un sábado: el torneo se juega el fin de semana. */
  const SABADO = '2027-12-04';
  const ID = 'dQw4w9WgXcQ';

  let canchaId: number;
  let torneoId: number;
  let partidoId: number;
  let cuartaId: number;

  const programar = (id: number, cuerpo: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/partidos/${id}/programacion`)
      .set('Cookie', cookieAdmin)
      .send(cuerpo);

  const enSabado = (extra: Record<string, unknown> = {}) => ({
    canchaId,
    fecha: SABADO,
    horaDesde: '10:00',
    horaHasta: '12:00',
    ...extra,
  });

  /**
   * Un teléfono distinto por jugador creado en este archivo.
   *
   * Desde T64 es único, así que un helper que repita números falla al llamarlo dos
   * veces en el mismo test — que es exactamente lo que hace la prueba de dos partidos
   * a la misma hora.
   */
  let siguienteTelefono = 0;
  const unTelefono = () =>
    `5698${String(1_000_000 + (siguienteTelefono += 1)).slice(-7)}`;

  const limpiar = async () => {
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatProg' } },
    });
    await prisma.bloqueo.deleteMany({ where: { cancha: { nombre: CANCHA } } });
  };

  /** Una cancha sin cámara, para el rechazo. */
  let sinCamaraId = 0;

  const anunciar = (cuerpo: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/transmisiones`)
      .set('Cookie', cookieAdmin)
      .send({
        canchaId,
        enlace: `https://youtu.be/${ID}`,
        fecha: SABADO,
        horaDesde: '09:00',
        horaHasta: '19:00',
        ...cuerpo,
      });

  /** Un cuadro de dos: una final y nada más, para tener un partido con jugadores. */
  const unTorneoJugable = async (restricciones: unknown[] = []) => {
    const categoria = await prisma.categoriaTorneo.create({
      data: {
        nombre: `CatProg ${Date.now()}${Math.random()}`,
        puntosCampeon: 250,
      },
    });

    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}`,
        fechaInicio: new Date('2027-12-04T00:00:00.000Z'),
        fechaFin: new Date('2027-12-05T00:00:00.000Z'),
        cierreInscripcion: new Date('2027-11-25T00:00:00.000Z'),
        cuadros: {
          create: {
            categoriaJuegoId: cuartaId,
            cupo: 2,
            categoriaId: categoria.id,
          },
        },
      },
      select: { id: true, cuadros: { select: { id: true } } },
    });

    for (const [i, nombre] of ['Pedro', 'Andrés'].entries()) {
      const jugador = await prisma.jugador.create({
        data: {
          nombre,
          apellido: APELLIDO,
          telefono: unTelefono(),
        },
      });

      await prisma.inscripcionTorneo.create({
        data: {
          torneoId: torneo.id,
          torneoCategoriaId: torneo.cuadros[0].id,
          jugadorId: jugador.id,
          // Las restricciones van solo al primero: alcanza para probar que basta con
          // que uno de los dos no pueda.
          restricciones:
            i === 0 ? { create: restricciones as never } : undefined,
        },
      });
    }

    await request(app.getHttpServer())
      .post(`/api/admin/cuadros/${torneo.cuadros[0].id}/armar`)
      .set('Cookie', cookieAdmin)
      .expect(201);

    const partido = await prisma.partido.findFirstOrThrow({
      where: { torneoCategoriaId: torneo.cuadros[0].id },
    });

    return {
      torneoId: torneo.id,
      cuadroId: torneo.cuadros[0].id,
      partidoId: partido.id,
    };
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    await sembrarCategoriasDeJuego(prisma);
    cuartaId = (
      await prisma.categoriaJuego.findUniqueOrThrow({ where: { nombre: '4ª' } })
    ).id;

    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `jefa${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: 'Jefa',
        apellido: 'Programa',
      })
      .expect(201);
    await prisma.usuario.update({
      where: { email: `jefa${DOMINIO}` },
      data: { esAdmin: true },
    });
    cookieAdmin = (
      (
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: `jefa${DOMINIO}`, contrasena: CONTRASENA })
          .expect(204)
      ).headers['set-cookie'] as unknown as string[]
    )[0];

    // Una cancha propia, abierta todos los días, para no depender del seed ni pisarle
    // el horario a otra suite.
    await prisma.cancha.deleteMany({ where: { nombre: CANCHA } });
    const cancha = await prisma.cancha.create({
      data: {
        nombre: CANCHA,
        superficie: Superficie.ARCILLA,
        tieneCamara: true,
        horarios: {
          create: Array.from({ length: 7 }, (_, diaSemana) => ({
            diaSemana,
            horaApertura: '08:00',
            horaCierre: '22:00',
          })),
        },
      },
      select: { id: true },
    });
    canchaId = cancha.id;

    await prisma.cancha.deleteMany({ where: { nombre: `${CANCHA} sin` } });
    sinCamaraId = (
      await prisma.cancha.create({
        data: {
          nombre: `${CANCHA} sin`,
          superficie: Superficie.ARCILLA,
          horarios: {
            create: Array.from({ length: 7 }, (_, diaSemana) => ({
              diaSemana,
              horaApertura: '08:00',
              horaCierre: '22:00',
            })),
          },
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await limpiar();
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: CANCHA } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();
    const armado = await unTorneoJugable();
    torneoId = armado.torneoId;
    partidoId = armado.partidoId;
  });

  describe('el admin anuncia un live', () => {
    it('lo crea y **la URL la arma el servidor, en el dominio sin cookies**', async () => {
      const respuesta = await anunciar({}).expect(201);

      const creada = respuesta.body as { url: string; miniatura: string };
      expect(creada.url).toBe(`https://www.youtube-nocookie.com/embed/${ID}`);
      expect(creada.miniatura).toContain(ID);
    });

    it('**guarda los once caracteres, no el enlace**', async () => {
      await anunciar({
        enlace: `https://www.youtube.com/watch?v=${ID}&list=PLabc`,
      }).expect(201);

      const guardada = await prisma.transmision.findFirstOrThrow({
        where: { torneoId },
      });
      expect(guardada.youtubeVideoId).toBe(ID);
    });

    it('**un enlace de otro dominio se rechaza**', async () => {
      await anunciar({ enlace: `https://malo.cl/embed/${ID}` }).expect(400);
      await anunciar({ enlace: `javascript:alert(1)//${ID}` }).expect(400);
    });

    it('**una cancha sin cámara se rechaza, y lo dice**', async () => {
      // Es el error que deja al club anunciando un partido que nadie puede ver.
      const respuesta = await anunciar({ canchaId: sinCamaraId }).expect(409);

      expect((respuesta.body as { message: string }).message).toContain(
        'no tiene cámara',
      );
    });

    it('dos lives de la misma cancha que se pisan se rechazan', async () => {
      await anunciar({}).expect(201);

      await anunciar({ horaDesde: '18:00', horaHasta: '20:00' }).expect(409);
    });

    it('una ventana que termina antes de empezar se rechaza', async () => {
      await anunciar({ horaDesde: '19:00', horaHasta: '09:00' }).expect(400);
    });

    it('el admin la quita', async () => {
      const creada = (await anunciar({}).expect(201)).body as { id: number };

      await request(app.getHttpServer())
        .delete(`/api/admin/torneos/${torneoId}/transmisiones/${creada.id}`)
        .set('Cookie', cookieAdmin)
        .expect(200);

      expect(await prisma.transmision.count({ where: { torneoId } })).toBe(0);
    });

    it('solo el admin anuncia', async () => {
      await request(app.getHttpServer())
        .post(`/api/admin/torneos/${torneoId}/transmisiones`)
        .send({
          canchaId,
          enlace: `https://youtu.be/${ID}`,
          fecha: SABADO,
          horaDesde: '09:00',
          horaHasta: '19:00',
        })
        .expect(401);
    });
  });

  describe('el partido resuelve la suya por cancha y hora', () => {
    const transmisionDe = async (id: number) =>
      (
        (
          await request(app.getHttpServer())
            .get(`/api/torneos/partidos/${id}/transmision`)
            .expect(200)
        ).body as { transmision: { url: string; cancha: string } | null }
      ).transmision;

    it('**un partido sin programar no tiene transmisión**', async () => {
      await anunciar({}).expect(201);

      expect(await transmisionDe(partidoId)).toBeNull();
    });

    it('**programado dentro de la ventana, la encuentra**', async () => {
      await anunciar({}).expect(201);
      await programar(partidoId, enSabado()).expect(200);

      const suya = await transmisionDe(partidoId);
      expect(suya?.url).toContain(ID);
      expect(suya?.cancha).toBe(CANCHA);
    });

    it('**programado fuera de la ventana, no la encuentra**', async () => {
      // El live va de 09:00 a 12:00 y el partido a las 15:00.
      await anunciar({ horaDesde: '09:00', horaHasta: '12:00' }).expect(201);
      await programar(
        partidoId,
        enSabado({ horaDesde: '15:00', horaHasta: '17:00' }),
      ).expect(200);

      expect(await transmisionDe(partidoId)).toBeNull();
    });

    it('**en otra cancha, no la encuentra**', async () => {
      // Es lo que impide que el cuadro de la Cancha 2 muestre el live de la Cancha 1.
      await anunciar({}).expect(201);
      await programar(partidoId, enSabado({ canchaId: sinCamaraId })).expect(
        200,
      );

      expect(await transmisionDe(partidoId)).toBeNull();
    });

    it('desprogramar el partido lo deja sin transmisión', async () => {
      await anunciar({}).expect(201);
      await programar(partidoId, enSabado()).expect(200);
      expect(await transmisionDe(partidoId)).not.toBeNull();

      await request(app.getHttpServer())
        .delete(
          `/api/admin/torneos/${torneoId}/partidos/${partidoId}/programacion`,
        )
        .set('Cookie', cookieAdmin)
        .expect(200);

      expect(await transmisionDe(partidoId)).toBeNull();
    });

    it('la lista pública del torneo las trae, con la URL ya armada', async () => {
      await anunciar({}).expect(201);

      const lista = (
        await request(app.getHttpServer())
          .get(`/api/torneos/${torneoId}/transmisiones`)
          .expect(200)
      ).body as { url: string; youtubeVideoId?: string }[];

      expect(lista).toHaveLength(1);
      expect(lista[0].url).toContain('youtube-nocookie.com');
      // El id pelado no sale: si saliera, una pantalla podría concatenarlo con otro
      // dominio y saltarse el `nocookie`.
      expect(lista[0].youtubeVideoId).toBeUndefined();
    });
  });
});
