import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import { sembrarCategoriasDeJuego } from '../src/arranque';
import { MotivoBloqueo, Superficie } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T67: los partidos se programan en cancha y horario.
 *
 * **Programar escribe un `Bloqueo` con motivo `TORNEO`**, y eso es lo que hace que esta
 * tarea quepa: `catalogo-canchas` ya tiene la máquina y `clases` la usa igual. La
 * consecuencia que más importa —que ningún socio pueda reservar sobre un partido
 * programado— **no tiene una línea de código**, y por eso hay un test que la comprueba
 * por el endpoint de disponibilidad y no mirando la tabla.
 */
describe('Programación de partidos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;

  const MARCA = 'Copa programada';
  const APELLIDO = 'Programado';
  const DOMINIO = '@programa.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const CANCHA = 'Cancha de programación';

  /** Un sábado: el torneo se juega el fin de semana. */
  const SABADO = '2027-12-04';
  /** Un martes, para chocar con una restricción de martes. */
  const MARTES = '2027-11-30';

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
  });

  afterAll(async () => {
    await limpiar();
    await prisma.cancha.deleteMany({ where: { nombre: CANCHA } });
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

  it('el admin le pone cancha y hora a un partido', async () => {
    await programar(partidoId, enSabado()).expect(200);

    const guardado = await prisma.partido.findUniqueOrThrow({
      where: { id: partidoId },
    });
    expect(guardado.programadoInicio).not.toBeNull();
    expect(guardado.bloqueoId).not.toBeNull();
  });

  it('**programar escribe un `Bloqueo` con motivo TORNEO**', async () => {
    await programar(partidoId, enSabado()).expect(200);

    const bloqueo = await prisma.bloqueo.findFirstOrThrow({
      where: { canchaId, motivo: MotivoBloqueo.TORNEO },
    });
    expect(bloqueo.descripcion).toContain('Torneo');
  });

  it('**después de programar, esa hora deja de ofrecerse**', async () => {
    // Es la consecuencia que sale gratis del bloqueo, y por eso se comprueba por el
    // endpoint de disponibilidad y no mirando la tabla: si algún día `torneos` dejara
    // de escribir el bloqueo, la tabla seguiría cuadrando y la grilla mentiría.
    const librePrimero = await horasLibres();
    expect(librePrimero).toContain(alas('10:00'));

    await programar(partidoId, enSabado()).expect(200);

    expect(await horasLibres()).not.toContain(alas('10:00'));
  });

  describe('lo que rechaza, y dice por qué', () => {
    it('**un partido sin sus dos jugadores**', async () => {
      // Un cuadro de 4 tiene semifinales con jugadores y una final vacía.
      const cuatro = await unCuadroDeCuatro();

      const respuesta = await programar(cuatro.final, enSabado()).expect(400);
      expect((respuesta.body as { message: string }).message).toContain(
        'dos jugadores',
      );
    });

    it('**la restricción horaria de uno de los dos, y lo nombra**', async () => {
      await limpiar();
      const conRestriccion = await unTorneoJugable([
        { diaSemana: 2, horaDesde: '18:00', horaHasta: '21:00' },
      ]);
      torneoId = conRestriccion.torneoId;

      const respuesta = await programar(conRestriccion.partidoId, {
        canchaId,
        fecha: MARTES,
        horaDesde: '20:00',
        horaHasta: '22:00',
      }).expect(409);

      const mensaje = (respuesta.body as { message: string }).message;
      expect(mensaje).toContain('Pedro');
      expect(mensaje).toContain('los martes de 18:00 a 21:00');
    });

    it('**y también después de las 21:00, que es donde el día cambia en UTC**', async () => {
      // Chile va tres o cuatro horas atrás: un martes a las 21:00 locales ya es
      // miércoles en UTC. Leyendo el día del instante, la restricción de ese martes no
      // se encontraba — y esa ventana es justo cuando el club programa entre semana.
      // Este test es el borde; el de arriba usaba las 20:00 y pasaba por casualidad.
      await limpiar();
      const conRestriccion = await unTorneoJugable([
        { diaSemana: 2, horaDesde: '18:00', horaHasta: '23:00' },
      ]);
      torneoId = conRestriccion.torneoId;

      const respuesta = await programar(conRestriccion.partidoId, {
        canchaId,
        fecha: MARTES,
        horaDesde: '21:00',
        horaHasta: '22:00',
      }).expect(409);

      expect((respuesta.body as { message: string }).message).toContain(
        'los martes de 18:00 a 23:00',
      );
    });

    it('con la restricción de otro día, el mismo horario se acepta', async () => {
      await limpiar();
      const conRestriccion = await unTorneoJugable([
        { diaSemana: 3, horaDesde: '18:00', horaHasta: '21:00' },
      ]);
      torneoId = conRestriccion.torneoId;

      await programar(conRestriccion.partidoId, {
        canchaId,
        fecha: MARTES,
        horaDesde: '20:00',
        horaHasta: '22:00',
      }).expect(200);
    });

    it('la cancha cerrada a esa hora', async () => {
      await programar(
        partidoId,
        enSabado({ horaDesde: '05:00', horaHasta: '07:00' }),
      ).expect(404);
    });

    it('**la cancha ya ocupada por otra cosa**', async () => {
      await prisma.bloqueo.create({
        data: {
          canchaId,
          inicio: new Date('2027-12-04T13:00:00.000Z'),
          fin: new Date('2027-12-04T17:00:00.000Z'),
          motivo: MotivoBloqueo.MANTENCION,
          descripcion: 'Riego',
        },
      });

      await programar(partidoId, enSabado()).expect(409);
    });

    it('**dos partidos no caen en la misma cancha a la misma hora**', async () => {
      await programar(partidoId, enSabado()).expect(200);

      const otro = await unTorneoJugable();
      torneoId = otro.torneoId;

      await programar(otro.partidoId, enSabado()).expect(409);
    });

    it('una hora que termina antes de empezar', async () => {
      await programar(
        partidoId,
        enSabado({ horaDesde: '12:00', horaHasta: '10:00' }),
      ).expect(400);
    });

    it('una fecha que no es una fecha', async () => {
      await programar(partidoId, enSabado({ fecha: '2027-13-45' })).expect(400);
    });

    it('solo el admin programa', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/admin/torneos/${torneoId}/partidos/${partidoId}/programacion`,
        )
        .send(enSabado())
        .expect(401);
    });
  });

  describe('desprogramar y reprogramar', () => {
    it('**desprogramar libera la cancha**', async () => {
      await programar(partidoId, enSabado()).expect(200);
      expect(await horasLibres()).not.toContain(alas('10:00'));

      await request(app.getHttpServer())
        .delete(
          `/api/admin/torneos/${torneoId}/partidos/${partidoId}/programacion`,
        )
        .set('Cookie', cookieAdmin)
        .expect(200);

      expect(await horasLibres()).toContain(alas('10:00'));
      expect(
        await prisma.bloqueo.count({
          where: { canchaId, motivo: MotivoBloqueo.TORNEO },
        }),
      ).toBe(0);
    });

    it('**reprogramar libera la hora anterior**', async () => {
      // Sin borrar el bloqueo viejo dentro de la misma transacción, la cancha queda
      // cerrada en dos horas por un partido que solo se juega en una.
      await programar(partidoId, enSabado()).expect(200);
      await programar(
        partidoId,
        enSabado({ horaDesde: '15:00', horaHasta: '17:00' }),
      ).expect(200);

      const libres = await horasLibres();
      expect(libres).toContain(alas('10:00'));
      expect(libres).not.toContain(alas('15:00'));
      expect(
        await prisma.bloqueo.count({
          where: { canchaId, motivo: MotivoBloqueo.TORNEO },
        }),
      ).toBe(1);
    });

    it('desprogramar un partido que no está programado se rechaza', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/admin/torneos/${torneoId}/partidos/${partidoId}/programacion`,
        )
        .set('Cookie', cookieAdmin)
        .expect(409);
    });

    it('**deshacer un resultado suelta la cancha del partido deshecho**', async () => {
      // Una cancha tomada por un partido que ya no existe es una hora que el club
      // pierde sin darse cuenta, y que ningún socio puede tomar porque el bloqueo
      // sigue ahí.
      const cuatro = await unCuadroDeCuatro();
      torneoId = cuatro.torneoId;

      // Se juega una semifinal, se programa la final y después se corrige la semi.
      await cargar(cuatro.semis[0]);
      await cargar(cuatro.semis[1]);
      await programar(cuatro.final, enSabado()).expect(200);
      expect(await horasLibres()).not.toContain(alas('10:00'));

      // Corregir la primera semifinal deshace la final.
      await cargar(cuatro.semis[0], true);

      expect(await horasLibres()).toContain(alas('10:00'));
      const final = await prisma.partido.findUniqueOrThrow({
        where: { id: cuatro.final },
      });
      expect(final.bloqueoId).toBeNull();
      expect(final.programadoInicio).toBeNull();
    });
  });

  /** Las horas que la disponibilidad ofrece ese sábado en esa cancha. */
  /**
   * Los bloques libres de ese sábado, como **instantes**.
   *
   * En ISO y no en "HH:MM": la respuesta viene en UTC y el club está en otra zona, así
   * que comparar el texto de la hora probaría el huso horario y no la programación.
   * `instanteEnElClub` es la misma conversión que usa el servidor.
   */
  const horasLibres = async () => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/disponibilidad?cancha=${canchaId}&fecha=${SABADO}`)
      .expect(200);

    return (respuesta.body as { inicio: string; bloqueado: boolean }[])
      .filter((bloque) => !bloque.bloqueado)
      .map((bloque) => new Date(bloque.inicio).toISOString());
  };

  /** El instante en que empieza esa hora local del club, ese sábado. */
  const alas = (hora: string) => instanteEnElClub(SABADO, hora).toISOString();

  /** Un cuadro de cuatro: dos semifinales con gente y una final vacía. */
  const unCuadroDeCuatro = async () => {
    const categoria = await prisma.categoriaTorneo.create({
      data: {
        nombre: `CatProg ${Date.now()}${Math.random()}`,
        puntosCampeon: 250,
      },
    });

    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} cuatro ${Date.now()}`,
        fechaInicio: new Date('2027-12-04T00:00:00.000Z'),
        fechaFin: new Date('2027-12-05T00:00:00.000Z'),
        cierreInscripcion: new Date('2027-11-25T00:00:00.000Z'),
        cuadros: {
          create: {
            categoriaJuegoId: cuartaId,
            cupo: 4,
            categoriaId: categoria.id,
          },
        },
      },
      select: { id: true, cuadros: { select: { id: true } } },
    });

    for (const nombre of ['Ana', 'Beto', 'Cata', 'Dani']) {
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
        },
      });
    }

    await request(app.getHttpServer())
      .post(`/api/admin/cuadros/${torneo.cuadros[0].id}/armar`)
      .set('Cookie', cookieAdmin)
      .expect(201);

    const partidos = await prisma.partido.findMany({
      where: { torneoCategoriaId: torneo.cuadros[0].id },
      orderBy: [{ ronda: 'asc' }, { posicion: 'asc' }],
    });

    return {
      torneoId: torneo.id,
      semis: partidos.filter((p) => p.ronda === 1).map((p) => p.id),
      final: partidos.find((p) => p.ronda === 2)!.id,
    };
  };

  const cargar = async (partido: number, elOtro = false) => {
    const fila = await prisma.partido.findUniqueOrThrow({
      where: { id: partido },
    });

    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/partidos/${partido}/resultado`)
      .set('Cookie', cookieAdmin)
      .send({
        ganadorId: elOtro ? fila.jugadorBId : fila.jugadorAId,
        marcador: '6-4 6-2',
      })
      .expect(200);
  };
});
