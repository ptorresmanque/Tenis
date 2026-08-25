import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoTorneo } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T52: cargar resultados y avanzar el cuadro.
 *
 * **El ganador avanza solo**, y eso es lo que hace que el cuadro del mural esté al día
 * sin que nadie lo copie a mano. Lo que más cuida este archivo: que **corregir un
 * resultado limpie lo que venía después**. Si el admin se equivocó de ganador en
 * semifinales, la final no puede quedar con el jugador equivocado esperando.
 */
describe('Resultados del cuadro', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let torneoId: number;

  const DOMINIO = '@resultados.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Copa con resultados';
  const APELLIDO = 'DeLaFinal';

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: APELLIDO,
      })
      .expect(201);

    await prisma.usuario.update({
      where: { email: `${sufijo}${DOMINIO}` },
      data: { esAdmin },
    });
  };

  const entrar = async (sufijo: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA })
      .expect(204);

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  interface PartidoPublicado {
    id: number;
    ronda: number;
    posicion: number;
    jugadorAId: number | null;
    jugadorBId: number | null;
    ganadorId: number | null;
    marcador: string | null;
    walkover: boolean;
  }

  const cuadro = async () => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/torneos/${torneoId}/cuadro`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as {
      estado: string;
      partidos: PartidoPublicado[];
    };
  };

  const partido = async (ronda: number, posicion: number) => {
    const encontrado = (await cuadro()).partidos.find(
      (p) => p.ronda === ronda && p.posicion === posicion,
    );

    if (!encontrado) throw new Error(`No hay partido ${ronda}/${posicion}`);

    return encontrado;
  };

  const cargar = (id: number, cuerpo: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/partidos/${id}/resultado`)
      .set('Cookie', cookieAdmin)
      .send(cuerpo);

  const consecuencias = async (id: number) => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/torneos/${torneoId}/partidos/${id}/consecuencias`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as { deshace: number };
  };

  const limpiar = async () => {
    await prisma.partido.deleteMany({});
    await prisma.inscripcionTorneo.deleteMany({});
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatRes' } },
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

  /** Un cuadro de cuatro: dos semifinales y una final, sin byes. */
  beforeEach(async () => {
    await limpiar();

    await crearCuenta('jefe', true);
    cookieAdmin = await entrar('jefe');

    const categoria = await prisma.categoriaTorneo.create({
      data: { nombre: `CatRes ${Date.now()}`, puntosCampeon: 250 },
      select: { id: true },
    });

    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}`,
        categoriaId: categoria.id,
        fechaInicio: new Date('2026-12-01T00:00:00.000Z'),
        fechaFin: new Date('2026-12-07T00:00:00.000Z'),
        cierreInscripcion: new Date('2026-11-25T00:00:00.000Z'),
        cupo: 4,
      },
      select: { id: true },
    });
    torneoId = torneo.id;

    for (const nombre of ['Ana', 'Beto', 'Cata', 'Dani']) {
      const jugador = await request(app.getHttpServer())
        .post('/api/admin/jugadores')
        .set('Cookie', cookieAdmin)
        .send({ nombre, apellido: APELLIDO })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/admin/torneos/${torneoId}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .send({ jugadorId: (jugador.body as { id: number }).id })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/cuadro`)
      .set('Cookie', cookieAdmin)
      .expect(201);
  });

  it('**cargar el resultado avanza al ganador a la ronda siguiente**', async () => {
    const semi = await partido(1, 1);

    await cargar(semi.id, {
      ganadorId: semi.jugadorAId,
      marcador: '6-4 6-2',
    }).expect(200);

    const final = await partido(2, 1);
    expect(final.jugadorAId).toBe(semi.jugadorAId);
    expect((await partido(1, 1)).marcador).toBe('6-4 6-2');
  });

  it('**el de la posición 2 entra por el lado de abajo, no encima del otro**', async () => {
    const primera = await partido(1, 1);
    const segunda = await partido(1, 2);

    await cargar(primera.id, { ganadorId: primera.jugadorAId }).expect(200);
    await cargar(segunda.id, { ganadorId: segunda.jugadorBId }).expect(200);

    const final = await partido(2, 1);
    expect(final.jugadorAId).toBe(primera.jugadorAId);
    expect(final.jugadorBId).toBe(segunda.jugadorBId);
  });

  it('**el walkover cuenta como partido ganado**', async () => {
    // Criterio ATP: quien llegó porque su rival no se presentó ganó los partidos
    // anteriores, y no darle la ronda alcanzada lo castiga por algo que hizo otro.
    const semi = await partido(1, 1);

    await cargar(semi.id, {
      ganadorId: semi.jugadorBId,
      walkover: true,
    }).expect(200);

    const guardado = await partido(1, 1);
    expect(guardado.ganadorId).toBe(semi.jugadorBId);
    expect(guardado.walkover).toBe(true);
    expect((await partido(2, 1)).jugadorAId).toBe(semi.jugadorBId);
  });

  it('el walkover no obliga a inventar un marcador', async () => {
    const semi = await partido(1, 1);

    await cargar(semi.id, {
      ganadorId: semi.jugadorAId,
      walkover: true,
    }).expect(200);

    expect((await partido(1, 1)).marcador).toBeNull();
  });

  it('**un partido sin sus dos jugadores no acepta resultado**', async () => {
    // Es el error que deja un cuadro contando los puntos de un partido que no se jugó.
    const final = await partido(2, 1);

    const respuesta = await cargar(final.id, { ganadorId: 1 });

    expect(respuesta.status).toBe(400);
    expect((respuesta.body as { message: string }).message).toContain(
      'dos jugadores',
    );
  });

  it('el ganador tiene que ser uno de los dos que juegan', async () => {
    const semi = await partido(1, 1);
    const ajeno = (await partido(1, 2)).jugadorAId;

    await cargar(semi.id, { ganadorId: ajeno }).expect(400);
  });

  it('**corregir semifinales deshace la final**', async () => {
    // El caso obligatorio: si el admin se equivocó de ganador, la final no puede
    // quedar con el jugador equivocado esperando.
    const primera = await partido(1, 1);
    const segunda = await partido(1, 2);
    await cargar(primera.id, { ganadorId: primera.jugadorAId }).expect(200);
    await cargar(segunda.id, { ganadorId: segunda.jugadorAId }).expect(200);

    const final = await partido(2, 1);
    await cargar(final.id, { ganadorId: final.jugadorAId }).expect(200);
    expect((await partido(2, 1)).ganadorId).not.toBeNull();

    // Ahora se corrige la semifinal: la final tiene que quedar sin resultado.
    const respuesta = await cargar(primera.id, {
      ganadorId: primera.jugadorBId,
    }).expect(200);

    expect((respuesta.body as { deshechos: number }).deshechos).toBe(1);
    const finalDespues = await partido(2, 1);
    expect(finalDespues.ganadorId).toBeNull();
    expect(finalDespues.marcador).toBeNull();
    expect(finalDespues.jugadorAId).toBe(primera.jugadorBId);
  });

  it('**avisa cuántos partidos deshace antes de deshacerlos**', async () => {
    const primera = await partido(1, 1);
    const segunda = await partido(1, 2);
    await cargar(primera.id, { ganadorId: primera.jugadorAId }).expect(200);
    await cargar(segunda.id, { ganadorId: segunda.jugadorAId }).expect(200);
    const final = await partido(2, 1);
    await cargar(final.id, { ganadorId: final.jugadorAId }).expect(200);

    const aviso = await consecuencias(primera.id);

    expect(aviso.deshace).toBe(1);
    // Y no escribió nada: la final sigue resuelta hasta que el admin confirme.
    expect((await partido(2, 1)).ganadorId).not.toBeNull();
  });

  it('corregir un partido sin nada después no deshace nada', async () => {
    const primera = await partido(1, 1);
    await cargar(primera.id, { ganadorId: primera.jugadorAId }).expect(200);

    const respuesta = await cargar(primera.id, {
      ganadorId: primera.jugadorBId,
    }).expect(200);

    expect((respuesta.body as { deshechos: number }).deshechos).toBe(0);
    expect((await partido(2, 1)).jugadorAId).toBe(primera.jugadorBId);
  });

  it('corregir una semifinal no toca la otra', async () => {
    // Los partidos de la otra mitad no tienen nada que ver con este error.
    const primera = await partido(1, 1);
    const segunda = await partido(1, 2);
    await cargar(primera.id, { ganadorId: primera.jugadorAId }).expect(200);
    await cargar(segunda.id, { ganadorId: segunda.jugadorAId }).expect(200);

    await cargar(primera.id, { ganadorId: primera.jugadorBId }).expect(200);

    expect((await partido(1, 2)).ganadorId).toBe(segunda.jugadorAId);
    expect((await partido(2, 1)).jugadorBId).toBe(segunda.jugadorAId);
  });

  it('**el torneo pasa a finalizado cuando la final tiene ganador**', async () => {
    // Ahí, y no antes, sus resultados pueden entrar al ranking: un torneo a medias no
    // reparte puntos de campeón.
    const primera = await partido(1, 1);
    const segunda = await partido(1, 2);
    await cargar(primera.id, { ganadorId: primera.jugadorAId }).expect(200);
    await cargar(segunda.id, { ganadorId: segunda.jugadorAId }).expect(200);

    expect((await cuadro()).estado).toBe(EstadoTorneo.CUADRO_ARMADO);

    const final = await partido(2, 1);
    await cargar(final.id, { ganadorId: final.jugadorAId }).expect(200);

    expect((await cuadro()).estado).toBe(EstadoTorneo.FINALIZADO);
  });

  it('**corregir la semifinal de un torneo finalizado lo devuelve a en juego**', async () => {
    // Si no, queda diciendo que tiene campeón mientras la final espera resultado, y
    // de ese estado salen los puntos del ranking.
    const primera = await partido(1, 1);
    const segunda = await partido(1, 2);
    await cargar(primera.id, { ganadorId: primera.jugadorAId }).expect(200);
    await cargar(segunda.id, { ganadorId: segunda.jugadorAId }).expect(200);
    const final = await partido(2, 1);
    await cargar(final.id, { ganadorId: final.jugadorAId }).expect(200);
    expect((await cuadro()).estado).toBe(EstadoTorneo.FINALIZADO);

    await cargar(primera.id, { ganadorId: primera.jugadorBId }).expect(200);

    expect((await cuadro()).estado).toBe(EstadoTorneo.CUADRO_ARMADO);
    expect((await partido(2, 1)).ganadorId).toBeNull();
  });

  it('**un torneo cancelado no acepta resultados: no se jugó**', async () => {
    // Un partido cargado ahí repartiría puntos de algo que no ocurrió.
    await prisma.torneo.update({
      where: { id: torneoId },
      data: { estado: EstadoTorneo.CANCELADO },
    });
    const semi = await partido(1, 1);

    await cargar(semi.id, { ganadorId: semi.jugadorAId }).expect(409);
  });

  it('el finalizado sí los acepta: corregir una final ya jugada es para eso', async () => {
    const primera = await partido(1, 1);
    const segunda = await partido(1, 2);
    await cargar(primera.id, { ganadorId: primera.jugadorAId }).expect(200);
    await cargar(segunda.id, { ganadorId: segunda.jugadorAId }).expect(200);
    const final = await partido(2, 1);
    await cargar(final.id, { ganadorId: final.jugadorAId }).expect(200);

    await cargar(final.id, { ganadorId: final.jugadorBId }).expect(200);

    expect((await partido(2, 1)).ganadorId).toBe(final.jugadorBId);
  });

  it('un partido de otro torneo no se carga desde este', async () => {
    const otro = await prisma.torneo.findFirstOrThrow({
      where: { id: torneoId },
      select: { id: true },
    });
    const ajeno = await partido(1, 1);

    await request(app.getHttpServer())
      .post(
        `/api/admin/torneos/${otro.id + 999}/partidos/${ajeno.id}/resultado`,
      )
      .set('Cookie', cookieAdmin)
      .send({ ganadorId: ajeno.jugadorAId })
      .expect(404);
  });

  it('solo el admin carga resultados', async () => {
    const semi = await partido(1, 1);

    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/partidos/${semi.id}/resultado`)
      .send({ ganadorId: semi.jugadorAId })
      .expect(401);
  });
});
