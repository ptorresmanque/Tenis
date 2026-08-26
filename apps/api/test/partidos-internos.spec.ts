import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hoyEnElClub } from '../src/comun/tiempo';
import {
  EstadoPartidoInterno,
  EstadoSocio,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T55: el partido amistoso entre socios.
 *
 * Todo este archivo gira alrededor de una sola regla: **un partido no puntúa hasta que
 * el rival lo confirma**. Sin eso el ranking lo escribe quien más se acuerda de cargar
 * victorias, y la tabla deja de ser creíble el primer mes.
 *
 * El Elo no está acá: T55 deja los partidos y su estado, T56 los convierte en tabla.
 */
describe('Partidos internos entre socios', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@internos.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const APELLIDO = 'DelAmistoso';

  /** Cada socio con su cookie y su id de ficha, que es lo que se compara. */
  interface Quien {
    cookie: string;
    socioId: number;
    usuarioId: number;
  }

  let ana: Quien;
  let beto: Quien;
  let cata: Quien;
  let jefe: Quien;

  const hoy = () => hoyEnElClub().toISOString().slice(0, 10);

  const haceDias = (dias: number) => {
    const dia = new Date(hoyEnElClub().getTime() - dias * 24 * 60 * 60 * 1000);
    return dia.toISOString().slice(0, 10);
  };

  interface PartidoMio {
    id: number;
    rival: string;
    ganeYo: boolean;
    marcador: string | null;
    jugadoEn: string;
    estado: EstadoPartidoInterno;
    /** Si me toca a mí contestar. Es lo que dibuja el botón. */
    esperaMiRespuesta: boolean;
    resueltoPorAdmin: boolean;
  }

  /**
   * Crea la cuenta, la vuelve socio y entra.
   *
   * `sinFicha` deja el usuario sin `Socio`: es el caso del visitante que todavía no
   * se asoció, que tiene que recibir una lista vacía y no un 403.
   */
  const alguien = async (
    sufijo: string,
    opciones: { esAdmin?: boolean; sinFicha?: boolean } = {},
  ): Promise<Quien> => {
    const email = `${sufijo}${DOMINIO}`;

    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email,
        contrasena: CONTRASENA,
        nombre: sufijo,
        apellido: APELLIDO,
      })
      .expect(201);

    const usuario = await prisma.usuario.update({
      where: { email },
      data: { esAdmin: opciones.esAdmin ?? false },
      select: { id: true },
    });

    let socioId = 0;
    if (!opciones.sinFicha) {
      const socio = await prisma.socio.create({
        data: {
          usuarioId: usuario.id,
          numeroSocio: `AM-${usuario.id}`,
          fechaIngreso: hoyEnElClub(),
          alDiaHasta: hoyEnElClub(),
        },
        select: { id: true },
      });
      socioId = socio.id;
    }

    // El login responde 204: no devuelve cuerpo, deja la cookie.
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);

    return {
      cookie: (respuesta.headers['set-cookie'] as unknown as string[])[0],
      socioId,
      usuarioId: usuario.id,
    };
  };

  /**
   * Ana carga un partido contra Beto y dice que ganó ella, salvo que se pida otra cosa.
   *
   * Sin `async`: devuelve el `Test` de supertest, que es encadenable con `.expect()`.
   * Envuelto en una promesa, `.expect` no existe.
   */
  const cargar = (
    quien: Quien,
    datos: Partial<{
      rivalSocioId: number;
      ganadorSocioId: number;
      marcador: string | null;
      jugadoEn: string;
    }> = {},
  ) =>
    request(app.getHttpServer())
      .post('/api/partidos-internos')
      .set('Cookie', quien.cookie)
      .send({
        rivalSocioId: datos.rivalSocioId ?? beto.socioId,
        ganadorSocioId: datos.ganadorSocioId ?? quien.socioId,
        marcador: datos.marcador === undefined ? '6-4 6-2' : datos.marcador,
        jugadoEn: datos.jugadoEn ?? hoy(),
      });

  /** Carga un partido y devuelve su id ya tipado. */
  const cargarYSacarId = async (
    quien: Quien,
    datos?: Parameters<typeof cargar>[1],
  ): Promise<number> => {
    const respuesta = await cargar(quien, datos).expect(201);

    return (respuesta.body as { id: number }).id;
  };

  const mios = async (quien: Quien): Promise<PartidoMio[]> => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/partidos-internos/mios')
      .set('Cookie', quien.cookie)
      .expect(200);

    return respuesta.body as PartidoMio[];
  };

  const responder = (
    quien: Quien,
    id: number,
    que: 'confirmacion' | 'rechazo',
  ) =>
    request(app.getHttpServer())
      .post(`/api/partidos-internos/${id}/${que}`)
      .set('Cookie', quien.cookie)
      .send({});

  const limpiar = async () => {
    await prisma.partidoInterno.deleteMany({});
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

    ana = await alguien('ana');
    beto = await alguien('beto');
    cata = await alguien('cata');
    jefe = await alguien('jefe', { esAdmin: true });
  });

  describe('cargar', () => {
    it('**el partido nace pendiente, no confirmado**', async () => {
      const respuesta = await cargar(ana).expect(201);

      expect((respuesta.body as { estado: string }).estado).toBe(
        EstadoPartidoInterno.PENDIENTE,
      );
    });

    it('lo carga el socio, no el admin: sale a nombre de quien lo manda', async () => {
      const id = await cargarYSacarId(ana);
      const guardado = await prisma.partidoInterno.findUnique({
        where: { id },
        select: { socioAId: true, socioBId: true },
      });

      expect(guardado?.socioAId).toBe(ana.socioId);
      expect(guardado?.socioBId).toBe(beto.socioId);
    });

    it('**nadie juega contra sí mismo**', async () => {
      await cargar(ana, { rivalSocioId: ana.socioId }).expect(400);
    });

    it('**el ganador tiene que ser uno de los dos**', async () => {
      // Cata no jugó ese partido. Sin esta regla, el Elo movería el puntaje de
      // alguien que no estuvo en la cancha.
      await cargar(ana, { ganadorSocioId: cata.socioId }).expect(400);
    });

    it('el rival tiene que ser un socio de verdad', async () => {
      await cargar(ana, { rivalSocioId: 999_999 }).expect(404);
    });

    it('**un partido del futuro no se carga**', async () => {
      // No se jugó todavía. Cargarlo adelanta puntos de algo que no pasó, y en una
      // tabla que se ordena por fecha además desordena el Elo.
      await cargar(ana, { jugadoEn: haceDias(-1) }).expect(400);
    });

    it('uno de hoy sí, que es el caso normal', async () => {
      await cargar(ana, { jugadoEn: hoy() }).expect(201);
    });

    it('el marcador es opcional: lo que importa es quién ganó', async () => {
      await cargar(ana, { marcador: null }).expect(201);
    });

    it('quien no tiene ficha de socio no puede cargar', async () => {
      const visitante = await alguien('visita', { sinFicha: true });

      await cargar(visitante).expect(403);
    });

    it('sin sesión tampoco', async () => {
      await request(app.getHttpServer())
        .post('/api/partidos-internos')
        .send({
          rivalSocioId: beto.socioId,
          ganadorSocioId: ana.socioId,
          jugadoEn: hoy(),
        })
        .expect(401);
    });
  });

  describe('mis partidos', () => {
    it('el que cargué aparece en mi lista y en la del rival', async () => {
      await cargar(ana).expect(201);

      expect(await mios(ana)).toHaveLength(1);
      expect(await mios(beto)).toHaveLength(1);
    });

    it('**solo al rival le toca contestar**', async () => {
      // Es lo que decide si se dibuja el botón. Si le apareciera a quien lo cargó,
      // podría confirmarse a sí mismo con un clic.
      await cargar(ana).expect(201);

      expect((await mios(ana))[0].esperaMiRespuesta).toBe(false);
      expect((await mios(beto))[0].esperaMiRespuesta).toBe(true);
    });

    it('cada uno ve el partido desde su lado: el rival y si ganó', async () => {
      await cargar(ana).expect(201);

      const deAna = (await mios(ana))[0];
      const deBeto = (await mios(beto))[0];

      expect(deAna.rival).toContain('beto');
      expect(deAna.ganeYo).toBe(true);
      expect(deBeto.rival).toContain('ana');
      expect(deBeto.ganeYo).toBe(false);
    });

    it('el partido de otros dos no aparece en mi lista', async () => {
      await cargar(ana).expect(201);

      expect(await mios(cata)).toHaveLength(0);
    });

    it('quien no tiene ficha recibe una lista vacía, no un 403', async () => {
      // La verdad es que no tiene partidos. Un 403 se lee como que el sistema está
      // roto; es el mismo criterio que `GET /api/cuotas/mias`.
      const visitante = await alguien('visita2', { sinFicha: true });

      expect(await mios(visitante)).toEqual([]);
    });

    it('los más nuevos primero: la lista se mira para contestar lo último', async () => {
      await cargar(ana, { jugadoEn: haceDias(10) }).expect(201);
      await cargar(ana, { jugadoEn: haceDias(1) }).expect(201);

      const lista = await mios(ana);
      expect(lista[0].jugadoEn).toBe(haceDias(1));
    });
  });

  describe('contra quién puedo jugar', () => {
    const rivales = async (quien: Quien) => {
      const respuesta = await request(app.getHttpServer())
        .get('/api/partidos-internos/rivales')
        .set('Cookie', quien.cookie)
        .expect(200);

      return respuesta.body as {
        socioId: number;
        numeroSocio: string;
        nombre: string;
      }[];
    };

    it('están los otros socios y no yo', async () => {
      const lista = await rivales(ana);
      const ids = lista.map((r) => r.socioId);

      expect(ids).toContain(beto.socioId);
      expect(ids).not.toContain(ana.socioId);
    });

    it('**no sale ni el teléfono ni el correo de nadie**', async () => {
      // Es una lista para elegir rival, no el padrón. Se comprueba sobre el JSON
      // entero: un campo nuevo que filtre datos entra sin que nadie actualice esto.
      const crudo = JSON.stringify(await rivales(ana));

      expect(crudo).not.toContain(DOMINIO);
      expect(crudo).not.toContain('telefono');
      expect(crudo).not.toContain('email');
    });

    it('un socio retirado no aparece como rival, un suspendido sí', async () => {
      await prisma.socio.update({
        where: { id: cata.socioId },
        data: { estado: EstadoSocio.RETIRADO },
      });

      await prisma.socio.update({
        where: { id: beto.socioId },
        data: { estado: EstadoSocio.SUSPENDIDO },
      });

      // El que se fue del club no juega más. El suspendido sigue siendo socio: su
      // suspension es de reservas, no de la cancha.
      const ids = (await rivales(ana)).map((r) => r.socioId);
      expect(ids).not.toContain(cata.socioId);
      expect(ids).toContain(beto.socioId);
    });

    it('quien no tiene ficha recibe una lista vacía', async () => {
      const visitante = await alguien('visita3', { sinFicha: true });

      expect(await rivales(visitante)).toEqual([]);
    });
  });

  describe('confirmar y rechazar', () => {
    let partidoId: number;

    beforeEach(async () => {
      partidoId = await cargarYSacarId(ana);
    });

    it('**el rival confirma y el partido queda confirmado**', async () => {
      await responder(beto, partidoId, 'confirmacion').expect(200);

      const guardado = await prisma.partidoInterno.findUnique({
        where: { id: partidoId },
        select: { estado: true, confirmadoEn: true },
      });

      expect(guardado?.estado).toBe(EstadoPartidoInterno.CONFIRMADO);
      expect(guardado?.confirmadoEn).not.toBeNull();
    });

    it('**quien lo cargó no puede confirmarlo**', async () => {
      // Es la regla entera: si A pudiera confirmar lo suyo, la confirmación no
      // existiría y el ranking lo escribiría quien más carga.
      await responder(ana, partidoId, 'confirmacion').expect(403);

      const guardado = await prisma.partidoInterno.findUnique({
        where: { id: partidoId },
        select: { estado: true },
      });
      expect(guardado?.estado).toBe(EstadoPartidoInterno.PENDIENTE);
    });

    it('un tercero tampoco', async () => {
      await responder(cata, partidoId, 'confirmacion').expect(403);
    });

    it('el rival rechaza y queda rechazado', async () => {
      await responder(beto, partidoId, 'rechazo').expect(200);

      const guardado = await prisma.partidoInterno.findUnique({
        where: { id: partidoId },
        select: { estado: true },
      });
      expect(guardado?.estado).toBe(EstadoPartidoInterno.RECHAZADO);
    });

    it('**un rechazo no deja fecha de confirmación**', async () => {
      // La columna se llama `confirmadoEn`: escribirla al rechazar la convierte en
      // "cuándo contestó" sin avisarle a nadie, y deja este camino guardando algo
      // distinto del que usa el admin para la misma operación.
      await responder(beto, partidoId, 'rechazo').expect(200);

      const guardado = await prisma.partidoInterno.findUnique({
        where: { id: partidoId },
        select: { confirmadoEn: true },
      });
      expect(guardado?.confirmadoEn).toBeNull();
    });

    it('y el admin que rechaza tampoco', async () => {
      // El par del anterior: los dos caminos tienen que dejar la misma columna igual.
      await request(app.getHttpServer())
        .post(`/api/admin/partidos-internos/${partidoId}/resolucion`)
        .set('Cookie', jefe.cookie)
        .send({ estado: EstadoPartidoInterno.RECHAZADO })
        .expect(200);

      const guardado = await prisma.partidoInterno.findUnique({
        where: { id: partidoId },
        select: { confirmadoEn: true },
      });
      expect(guardado?.confirmadoEn).toBeNull();
    });

    it('**contestar dos veces no vuelve a contestar**', async () => {
      // Dos toques al botón, o dos pestañas abiertas. El segundo tiene que rebotar
      // contra el estado y no pisar el primero.
      await responder(beto, partidoId, 'confirmacion').expect(200);
      await responder(beto, partidoId, 'rechazo').expect(409);

      const guardado = await prisma.partidoInterno.findUnique({
        where: { id: partidoId },
        select: { estado: true },
      });
      expect(guardado?.estado).toBe(EstadoPartidoInterno.CONFIRMADO);
    });

    it('dos confirmaciones a la vez: una gana y la otra rebota', async () => {
      // Sin comparar contra el estado, las dos escriben y `confirmadoEn` queda con
      // la hora de la segunda. Es el mismo `updateMany` condicionado del resto.
      const [una, otra] = await Promise.all([
        responder(beto, partidoId, 'confirmacion'),
        responder(beto, partidoId, 'confirmacion'),
      ]);

      const estados = [una.status, otra.status].sort((a, b) => a - b);
      expect(estados).toEqual([200, 409]);
    });

    it('contestar un partido que no existe da 404', async () => {
      await responder(beto, 999_999, 'confirmacion').expect(404);
    });

    it('un partido contestado ya no espera respuesta de nadie', async () => {
      await responder(beto, partidoId, 'confirmacion').expect(200);

      expect((await mios(beto))[0].esperaMiRespuesta).toBe(false);
    });
  });

  describe('la salida de emergencia del admin', () => {
    let partidoId: number;

    beforeEach(async () => {
      partidoId = await cargarYSacarId(ana);
      await responder(beto, partidoId, 'rechazo').expect(200);
    });

    it('**el admin resuelve una disputa y queda marcado como tal**', async () => {
      // No hay tribunal que decida entre dos versiones: alguien del club llama por
      // teléfono y lo arregla. Lo que el sistema garantiza es que se note.
      await request(app.getHttpServer())
        .post(`/api/admin/partidos-internos/${partidoId}/resolucion`)
        .set('Cookie', jefe.cookie)
        .send({ estado: EstadoPartidoInterno.CONFIRMADO })
        .expect(200);

      const guardado = await prisma.partidoInterno.findUnique({
        where: { id: partidoId },
        select: { estado: true, resueltoPorAdmin: true },
      });

      expect(guardado?.estado).toBe(EstadoPartidoInterno.CONFIRMADO);
      expect(guardado?.resueltoPorAdmin).toBe(true);
    });

    it('el socio ve que lo resolvió el club, no su rival', async () => {
      await request(app.getHttpServer())
        .post(`/api/admin/partidos-internos/${partidoId}/resolucion`)
        .set('Cookie', jefe.cookie)
        .send({ estado: EstadoPartidoInterno.CONFIRMADO })
        .expect(200);

      expect((await mios(ana))[0].resueltoPorAdmin).toBe(true);
    });

    it('un socio cualquiera no resuelve nada', async () => {
      await request(app.getHttpServer())
        .post(`/api/admin/partidos-internos/${partidoId}/resolucion`)
        .set('Cookie', cata.cookie)
        .send({ estado: EstadoPartidoInterno.CONFIRMADO })
        .expect(403);
    });

    it('no se puede dejar un partido pendiente a mano', async () => {
      // Resolver es cerrar. Devolverlo a pendiente lo dejaría esperando una
      // respuesta que el rival ya dio.
      await request(app.getHttpServer())
        .post(`/api/admin/partidos-internos/${partidoId}/resolucion`)
        .set('Cookie', jefe.cookie)
        .send({ estado: EstadoPartidoInterno.PENDIENTE })
        .expect(400);
    });

    it('**el admin ve los partidos en disputa para saber cuáles mirar**', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/api/admin/partidos-internos?estado=RECHAZADO')
        .set('Cookie', jefe.cookie)
        .expect(200);

      const lista = respuesta.body as { id: number }[];
      expect(lista.map((p) => p.id)).toContain(partidoId);
    });
  });

  describe('lo que T56 va a leer', () => {
    it('un pendiente no queda entre los confirmados', async () => {
      // El contrato con el Elo: recorre los CONFIRMADO y nada más. Este test es el
      // que va a fallar si alguien afloja la regla de la confirmación.
      await cargar(ana).expect(201);

      const confirmados = await prisma.partidoInterno.count({
        where: { estado: EstadoPartidoInterno.CONFIRMADO },
      });
      expect(confirmados).toBe(0);
    });

    it('**un partido pendiente no caduca solo**', async () => {
      // Queda ahí, visible en la lista del rival, hasta que alguien lo toque.
      // Caducarlo exige un disparador temporal que el proyecto decidió no tener, y
      // un partido que se pierde en silencio es peor que uno que sigue esperando.
      await cargar(ana, { jugadoEn: haceDias(300) }).expect(201);

      const lista = await mios(beto);
      expect(lista[0].estado).toBe(EstadoPartidoInterno.PENDIENTE);
      expect(lista[0].esperaMiRespuesta).toBe(true);
    });
  });
});
