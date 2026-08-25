import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  EstadoInscripcionTorneo,
  EstadoSocio,
  EstadoTorneo,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T50: quién juega el torneo, con el cupo y la lista de espera.
 *
 * **Pasado el cupo no se rechaza a nadie: se entra en lista de espera.** Rechazar
 * obligaría al club a llevar la lista en un papel, que es de donde venimos. Promover
 * sí es manual: el club llama por teléfono antes de meter a alguien en un cuadro.
 */
describe('Inscripción a un torneo', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;
  let torneoId: number;
  let socioId: number;

  const DOMINIO = '@inscripcion-torneo.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Copa con cupo';
  const APELLIDO = 'DelCuadro';

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

    const usuario = await prisma.usuario.update({
      where: { email: `${sufijo}${DOMINIO}` },
      data: { esAdmin },
      select: { id: true },
    });

    return usuario.id;
  };

  const entrar = async (sufijo: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA })
      .expect(204);

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  /** Un jugador de afuera, que es la vía rápida para llenar un cupo. */
  const unJugador = async (nombre: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/jugadores')
      .set('Cookie', cookieAdmin)
      .send({ nombre, apellido: APELLIDO })
      .expect(201);

    return (respuesta.body as { id: number }).id;
  };

  const inscribir = (jugadorId: number, torneo = torneoId) =>
    request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneo}/inscripciones`)
      .set('Cookie', cookieAdmin)
      .send({ jugadorId });

  interface InscripcionPublicada {
    id: number;
    jugadorId: number;
    jugador: string;
    numeroSocio: string | null;
    siembra: number | null;
    estado: EstadoInscripcionTorneo;
  }

  const inscritos = async (torneo = torneoId) => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/torneos/${torneo}/inscripciones`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as {
      cupo: number;
      inscritos: InscripcionPublicada[];
      enEspera: InscripcionPublicada[];
    };
  };

  const crearTorneo = async (extra: Record<string, unknown> = {}) => {
    const categoria = await prisma.categoriaTorneo.create({
      data: { nombre: `Cat ${Date.now()}${Math.random()}`, puntosCampeon: 250 },
      select: { id: true },
    });

    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}`,
        categoriaId: categoria.id,
        fechaInicio: new Date('2026-12-01T00:00:00.000Z'),
        fechaFin: new Date('2026-12-07T00:00:00.000Z'),
        cierreInscripcion: new Date('2026-11-25T00:00:00.000Z'),
        cupo: 2,
        ...extra,
      },
      select: { id: true },
    });

    return torneo.id;
  };

  const limpiar = async () => {
    await prisma.inscripcionTorneo.deleteMany({});
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'Cat ' } },
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

    await crearCuenta('jefe', true);
    cookieAdmin = await entrar('jefe');

    const usuarioSocio = await crearCuenta('socia');
    const socio = await prisma.socio.create({
      data: {
        usuarioId: usuarioSocio,
        numeroSocio: `INS-${Date.now()}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2020-01-01T00:00:00.000Z'),
        alDiaHasta: new Date('2027-01-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    socioId = socio.id;
    cookieSocio = await entrar('socia');

    torneoId = await crearTorneo();
  });

  it('el club inscribe a un jugador y queda en el cuadro', async () => {
    const jugador = await unJugador('Primera');

    const respuesta = await inscribir(jugador);

    expect(respuesta.status).toBe(201);
    const lista = await inscritos();
    expect(lista.inscritos).toHaveLength(1);
    expect(lista.inscritos[0].estado).toBe(EstadoInscripcionTorneo.INSCRITA);
  });

  it('se puede inscribir a un socio por su ficha, sin pasar por jugadores', async () => {
    const respuesta = await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/inscripciones`)
      .set('Cookie', cookieAdmin)
      .send({ socioId })
      .expect(201);

    expect((respuesta.body as { id: number }).id).toBeGreaterThan(0);
    // Y le creó su jugador, reutilizable en el torneo siguiente.
    expect(await prisma.jugador.count({ where: { socioId } })).toBe(1);
  });

  it('**el inscrito que se pasa del cupo queda en espera, no rechazado**', async () => {
    // Rechazarlo obligaría al club a llevar la lista en un papel, que es de donde
    // venimos. El cupo de este torneo es 2.
    await inscribir(await unJugador('Primera')).expect(201);
    await inscribir(await unJugador('Segunda')).expect(201);

    const respuesta = await inscribir(await unJugador('Tercera'));

    expect(respuesta.status).toBe(201);
    const lista = await inscritos();
    expect(lista.inscritos).toHaveLength(2);
    expect(lista.enEspera).toHaveLength(1);
    expect(lista.enEspera[0].jugador).toContain('Tercera');
  });

  it('la lista de espera va por orden de llegada', async () => {
    await inscribir(await unJugador('Primera')).expect(201);
    await inscribir(await unJugador('Segunda')).expect(201);
    await inscribir(await unJugador('Tercera')).expect(201);
    await inscribir(await unJugador('Cuarta')).expect(201);

    const lista = await inscritos();

    expect(lista.enEspera.map((i) => i.jugador.split(' ')[0])).toEqual([
      'Tercera',
      'Cuarta',
    ]);
  });

  it('**dos inscripciones simultáneas al último lugar: una sola entra al cuadro**', async () => {
    // Sin el cerrojo, las dos cuentan un inscrito, las dos ven un lugar libre y el
    // cuadro se arma con tres jugadores para dos lugares.
    await inscribir(await unJugador('Primera')).expect(201);
    const unaId = await unJugador('SimultaneaA');
    const otraId = await unJugador('SimultaneaB');

    await Promise.all([inscribir(unaId), inscribir(otraId)]);

    const lista = await inscritos();
    expect(lista.inscritos).toHaveLength(2);
    expect(lista.enEspera).toHaveLength(1);
  });

  it('**el mismo jugador dos veces se rechaza**', async () => {
    const jugador = await unJugador('Repetida');
    await inscribir(jugador).expect(201);

    await inscribir(jugador).expect(409);
  });

  it('**inscribir después del cierre se rechaza**', async () => {
    const cerrado = await crearTorneo({
      cierreInscripcion: new Date('2020-01-01T00:00:00.000Z'),
      fechaInicio: new Date('2020-01-05T00:00:00.000Z'),
      fechaFin: new Date('2020-01-10T00:00:00.000Z'),
    });

    const respuesta = await inscribir(await unJugador('Tarde'), cerrado);

    expect(respuesta.status).toBe(409);
    expect((respuesta.body as { message: string }).message).toContain('cerró');
  });

  it('con el cuadro ya armado no se inscribe a nadie más', async () => {
    await prisma.torneo.update({
      where: { id: torneoId },
      data: { estado: EstadoTorneo.CUADRO_ARMADO },
    });

    await inscribir(await unJugador('Tarde')).expect(409);
  });

  it('**el socio moroso se inscribe igual: la regla de morosidad es de las canchas**', async () => {
    // Deliberado, ver `SPEC-torneos.md`. Extenderla a los torneos es una decisión de
    // club que nadie tomó.
    await prisma.socio.update({
      where: { id: socioId },
      data: { alDiaHasta: new Date('2020-01-01T00:00:00.000Z') },
    });

    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/inscripciones`)
      .set('Cookie', cookieAdmin)
      .send({ socioId })
      .expect(201);
  });

  it('**retirarse libera el lugar, y el que estaba en espera no entra solo**', async () => {
    // Promover es manual: el club llama por teléfono antes de meter a alguien en un
    // cuadro que ya se anunció.
    const primera = await inscribir(await unJugador('Primera')).expect(201);
    await inscribir(await unJugador('Segunda')).expect(201);
    await inscribir(await unJugador('Tercera')).expect(201);

    await request(app.getHttpServer())
      .post(
        `/api/admin/torneos/${torneoId}/inscripciones/${(primera.body as { id: number }).id}/retiro`,
      )
      .set('Cookie', cookieAdmin)
      .expect(200);

    const lista = await inscritos();
    expect(lista.inscritos).toHaveLength(1);
    expect(lista.enEspera).toHaveLength(1);
  });

  it('**el lugar que se libera es de quien esperaba, no del que llega después**', async () => {
    // Sin esto, la lista de espera deja de ser una fila: el que se inscribe después
    // de un retiro entra directo al cuadro y pasa por delante de quien lleva dos
    // semanas esperando. El club queda explicando por qué lo pasaron.
    const primera = await inscribir(await unJugador('Primera')).expect(201);
    await inscribir(await unJugador('Segunda')).expect(201);
    await inscribir(await unJugador('Tercera')).expect(201);

    await request(app.getHttpServer())
      .post(
        `/api/admin/torneos/${torneoId}/inscripciones/${(primera.body as { id: number }).id}/retiro`,
      )
      .set('Cookie', cookieAdmin)
      .expect(200);

    // Queda un lugar libre y alguien esperando: el que llega ahora hace fila.
    const tardia = await inscribir(await unJugador('Tardia')).expect(201);

    expect((tardia.body as { estado: string }).estado).toBe(
      EstadoInscripcionTorneo.LISTA_ESPERA,
    );
    const lista = await inscritos();
    expect(lista.enEspera.map((i) => i.jugador.split(' ')[0])).toEqual([
      'Tercera',
      'Tardia',
    ]);
  });

  it('promover al primero de la lista lo mete en el cuadro', async () => {
    await inscribir(await unJugador('Primera')).expect(201);
    await inscribir(await unJugador('Segunda')).expect(201);
    const tercera = await inscribir(await unJugador('Tercera')).expect(201);
    const primeraId = (await inscritos()).inscritos[0].id;

    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/inscripciones/${primeraId}/retiro`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    await request(app.getHttpServer())
      .post(
        `/api/admin/torneos/${torneoId}/inscripciones/${(tercera.body as { id: number }).id}/promocion`,
      )
      .set('Cookie', cookieAdmin)
      .expect(200);

    const lista = await inscritos();
    expect(lista.inscritos).toHaveLength(2);
    expect(lista.enEspera).toHaveLength(0);
  });

  it('**promover con el cuadro lleno se rechaza: sería un jugador de más**', async () => {
    await inscribir(await unJugador('Primera')).expect(201);
    await inscribir(await unJugador('Segunda')).expect(201);
    const tercera = await inscribir(await unJugador('Tercera')).expect(201);

    await request(app.getHttpServer())
      .post(
        `/api/admin/torneos/${torneoId}/inscripciones/${(tercera.body as { id: number }).id}/promocion`,
      )
      .set('Cookie', cookieAdmin)
      .expect(409);
  });

  it('**el que se retiró puede volver a inscribirse antes del cierre**', async () => {
    // Una lesión que se recupera. Con el único sobre (torneo, jugador) a secas,
    // quedaría fuera para siempre.
    const jugador = await unJugador('Lesionada');
    const inscripcion = await inscribir(jugador).expect(201);

    await request(app.getHttpServer())
      .post(
        `/api/admin/torneos/${torneoId}/inscripciones/${(inscripcion.body as { id: number }).id}/retiro`,
      )
      .set('Cookie', cookieAdmin)
      .expect(200);

    await inscribir(jugador).expect(201);
  });

  it('la retirada queda en la lista, marcada: el club ve quién se bajó', async () => {
    const jugador = await unJugador('Retirada');
    const inscripcion = await inscribir(jugador).expect(201);

    await request(app.getHttpServer())
      .post(
        `/api/admin/torneos/${torneoId}/inscripciones/${(inscripcion.body as { id: number }).id}/retiro`,
      )
      .set('Cookie', cookieAdmin)
      .expect(200);

    expect(
      await prisma.inscripcionTorneo.count({
        where: { torneoId, estado: EstadoInscripcionTorneo.RETIRADA },
      }),
    ).toBe(1);
  });

  /** T51: armar el cuadro, que es lo que la gente mira en el mural del club. */
  describe('El cuadro', () => {
    const armar = (torneo = torneoId) =>
      request(app.getHttpServer())
        .post(`/api/admin/torneos/${torneo}/cuadro`)
        .set('Cookie', cookieAdmin);

    const cuadro = async (torneo = torneoId) => {
      const respuesta = await request(app.getHttpServer())
        .get(`/api/admin/torneos/${torneo}/cuadro`)
        .set('Cookie', cookieAdmin)
        .expect(200);

      return respuesta.body as {
        estado: string;
        rondas: number;
        semillaSorteo: number | null;
        partidos: {
          id: number;
          ronda: number;
          ronda_nombre: string;
          posicion: number;
          jugadorAId: number | null;
          jugadorBId: number | null;
          ganadorId: number | null;
        }[];
      };
    };

    /** Cuatro inscritos en un torneo de cupo 4: cuadro redondo, sin byes. */
    const cuatroInscritos = async () => {
      const torneo = await crearTorneo({ cupo: 4 });
      for (const nombre of ['Ana', 'Beto', 'Cata', 'Dani']) {
        await inscribir(await unJugador(nombre), torneo).expect(201);
      }

      return torneo;
    };

    it('**armar cierra la inscripción y deja el cuadro entero**', async () => {
      const torneo = await cuatroInscritos();

      await armar(torneo).expect(201);

      const armado = await cuadro(torneo);
      expect(armado.estado).toBe(EstadoTorneo.CUADRO_ARMADO);
      // Cuatro jugadores: dos semifinales y una final.
      expect(armado.partidos).toHaveLength(3);
      expect(armado.rondas).toBe(2);
    });

    it('la ronda se nombra por el tamaño del cuadro', async () => {
      const torneo = await cuatroInscritos();
      await armar(torneo).expect(201);

      const armado = await cuadro(torneo);

      expect(armado.partidos.at(-1)?.ronda_nombre).toBe('Final');
      expect(armado.partidos[0].ronda_nombre).toBe('Semifinal');
    });

    it('**la semilla del sorteo queda guardada, para poder rehacerlo**', async () => {
      const torneo = await cuatroInscritos();
      await armar(torneo).expect(201);

      expect((await cuadro(torneo)).semillaSorteo).not.toBeNull();
    });

    it('los de la lista de espera no entran al cuadro', async () => {
      const torneo = await crearTorneo({ cupo: 2 });
      for (const nombre of ['Ana', 'Beto', 'EnEspera']) {
        await inscribir(await unJugador(nombre), torneo).expect(201);
      }

      await armar(torneo).expect(201);

      const enPrimera = (await cuadro(torneo)).partidos
        .filter((p) => p.ronda === 1)
        .flatMap((p) => [p.jugadorAId, p.jugadorBId])
        .filter((id) => id !== null);
      expect(enPrimera).toHaveLength(2);
    });

    it('con menos de dos inscritos no hay cuadro que armar', async () => {
      const torneo = await crearTorneo({ cupo: 4 });
      await inscribir(await unJugador('Sola'), torneo).expect(201);

      await armar(torneo).expect(409);
    });

    it('armar dos veces se rechaza', async () => {
      const torneo = await cuatroInscritos();
      await armar(torneo).expect(201);

      await armar(torneo).expect(409);
    });

    it('con el cuadro armado ya no se inscribe a nadie', async () => {
      const torneo = await cuatroInscritos();
      await armar(torneo).expect(201);

      await inscribir(await unJugador('Tarde'), torneo).expect(409);
    });

    it('**deshacer sin resultados devuelve el torneo a inscripción**', async () => {
      const torneo = await cuatroInscritos();
      await armar(torneo).expect(201);

      await request(app.getHttpServer())
        .post(`/api/admin/torneos/${torneo}/cuadro/deshacer`)
        .set('Cookie', cookieAdmin)
        .expect(200);

      const despues = await cuadro(torneo);
      expect(despues.estado).toBe(EstadoTorneo.INSCRIPCION);
      expect(despues.partidos).toHaveLength(0);
      expect(despues.semillaSorteo).toBeNull();
    });

    it('**deshacer con un resultado cargado se rechaza: sería rehacer la historia**', async () => {
      const torneo = await cuatroInscritos();
      await armar(torneo).expect(201);
      const partido = (await cuadro(torneo)).partidos[0];
      await prisma.partido.update({
        where: { id: partido.id },
        data: { marcador: '6-4 6-2', ganadorId: partido.jugadorAId },
      });

      const respuesta = await request(app.getHttpServer())
        .post(`/api/admin/torneos/${torneo}/cuadro/deshacer`)
        .set('Cookie', cookieAdmin);

      expect(respuesta.status).toBe(409);
      expect((respuesta.body as { message: string }).message).toContain(
        'partido jugado',
      );
    });

    it('**dos sembrados con el mismo número se rechazan**', async () => {
      // Se pisarían el lugar del cuadro y el segundo desaparecería del sorteo.
      const torneo = await crearTorneo({ cupo: 4 });
      const primera = await inscribir(await unJugador('Ana'), torneo).expect(
        201,
      );
      const segunda = await inscribir(await unJugador('Beto'), torneo).expect(
        201,
      );

      const sembrar = (id: number, siembra: number) =>
        request(app.getHttpServer())
          .patch(`/api/admin/torneos/${torneo}/inscripciones/${id}/siembra`)
          .set('Cookie', cookieAdmin)
          .send({ siembra });

      await sembrar((primera.body as { id: number }).id, 1).expect(200);
      await sembrar((segunda.body as { id: number }).id, 1).expect(409);
    });

    it('**los sembrados se leen arriba de la lista, en orden**', async () => {
      // MySQL pone los nulos primero en un `ASC`: ordenar por siembra en la consulta
      // dejaba al 1 y al 2 debajo de todos los sin sembrar.
      const torneo = await crearTorneo({ cupo: 4 });
      const ids: number[] = [];
      for (const nombre of ['Ana', 'Beto', 'Cata']) {
        const inscripcion = await inscribir(
          await unJugador(nombre),
          torneo,
        ).expect(201);
        ids.push((inscripcion.body as { id: number }).id);
      }

      // Se siembra al último de la lista, que sin ordenar quedaría al final.
      await request(app.getHttpServer())
        .patch(`/api/admin/torneos/${torneo}/inscripciones/${ids[2]}/siembra`)
        .set('Cookie', cookieAdmin)
        .send({ siembra: 1 })
        .expect(200);

      const lista = await inscritos(torneo);

      expect(lista.inscritos[0].jugador).toContain('Cata');
      expect(lista.inscritos[0].siembra).toBe(1);
    });

    it('**el sembrado 1 no se cruza con el 2 en primera ronda**', async () => {
      // Con cuatro jugadores y dos sembrados, la primera ronda son las semifinales:
      // los dos sembrados tienen que estar en semifinales distintas.
      const torneo = await crearTorneo({ cupo: 4 });
      const ids: number[] = [];
      for (const nombre of ['Ana', 'Beto', 'Cata', 'Dani']) {
        const inscripcion = await inscribir(
          await unJugador(nombre),
          torneo,
        ).expect(201);
        ids.push((inscripcion.body as { id: number }).id);
      }

      for (const [indice, id] of [ids[0], ids[1]].entries()) {
        await request(app.getHttpServer())
          .patch(`/api/admin/torneos/${torneo}/inscripciones/${id}/siembra`)
          .set('Cookie', cookieAdmin)
          .send({ siembra: indice + 1 })
          .expect(200);
      }

      await armar(torneo).expect(201);

      const lista = await inscritos(torneo);
      const sembrados = new Set(
        lista.inscritos
          .filter((i) => i.siembra !== null)
          .map((i) => i.jugadorId),
      );
      const primera = (await cuadro(torneo)).partidos.filter(
        (p) => p.ronda === 1,
      );

      for (const partido of primera) {
        const ambos =
          sembrados.has(partido.jugadorAId ?? 0) &&
          sembrados.has(partido.jugadorBId ?? 0);
        expect(ambos).toBe(false);
      }
    });
  });

  it('solo el admin inscribe y ve la lista', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/inscripciones`)
      .set('Cookie', cookieSocio)
      .send({ socioId })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/admin/torneos/${torneoId}/inscripciones`)
      .expect(401);
  });
});
