import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoTorneo } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T53: los torneos que se ven desde la calle.
 *
 * El calendario es de las pocas cosas que un tercero mira antes de asociarse, y el
 * cuadro es el mismo mural del club en el teléfono de quien está en la cancha de al
 * lado.
 *
 * Lo que este archivo cuida por encima de todo: que **no salga el teléfono de nadie**.
 * El club lo tiene para llamar a un jugador, no para publicarlo.
 */
describe('GET /api/torneos/publicos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let torneoId: number;
  let cuadroId: number;

  const DOMINIO = '@torneos-publicos.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Copa publicada';
  const APELLIDO = 'DelMural';
  /**
   * Un teléfono por jugador, y **guardados como los guarda el servidor**.
   *
   * Desde T64 el teléfono es único —es la llave con que se decide si dos inscripciones
   * son la misma persona—, así que cuatro jugadores no pueden compartirlo. Y la
   * comprobación de fuga tiene que buscar la **forma normalizada**: el servidor guarda
   * `56999990001`, así que buscar `+56 9 9999 0001` en el JSON no encontraría nada ni
   * aunque estuviera filtrando el número entero.
   */
  const TELEFONOS = [
    '+56 9 9999 0001',
    '+56 9 9999 0002',
    '+56 9 9999 0003',
    '+56 9 9999 0004',
  ];
  const GUARDADOS = [
    '56999990001',
    '56999990002',
    '56999990003',
    '56999990004',
  ];

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

  interface TorneoPublico {
    id: number;
    nombre: string;
    fechaInicio: string;
    estado: string;
    categorias: {
      id: number;
      categoria: string;
      /** Cuánto cuesta inscribirse en **esta** categoría. */
      montoClp: number;
      cupo: number;
      cuposLibres: number | null;
      armado: boolean;
    }[];
  }

  const calendario = async (consulta = '') => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/torneos/publicos${consulta}`)
      .expect(200);

    return respuesta.body as TorneoPublico[];
  };

  const cuadro = async (id = cuadroId) => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/torneos/cuadros/${id}`)
      .expect(200);

    return respuesta.body as {
      nombre: string;
      estado: string;
      /** `null` mientras la categoría no llega al umbral (T375). */
      inscritos:
        { nombre: string; pago: 'PAGADO' | 'PENDIENTE' | null }[] | null;
      partidos: {
        ronda: number;
        ronda_nombre: string;
        jugadorA: string | null;
        jugadorB: string | null;
        siembraA: number | null;
        siembraB: number | null;
        ganador: string | null;
        marcador: string | null;
        inicio: string | null;
        fin: string | null;
        cancha: string | null;
      }[];
    };
  };

  const limpiar = async () => {
    // **Acotado a los torneos de este archivo.** Jest corre los archivos en paralelo:
    // un `deleteMany({})` acá le borra el cuadro a otra suite a mitad de un test, y
    // eso salía como un fallo intermitente sin causa aparente en otro archivo.
    const mios = { torneo: { nombre: { startsWith: MARCA } } };
    await prisma.partido.deleteMany({ where: mios });
    await prisma.inscripcionTorneo.deleteMany({ where: mios });
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
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
    await app.listen(0, '127.0.0.1');

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

    const categoriaJuego = await prisma.categoriaJuego.findFirstOrThrow({
      orderBy: { orden: 'asc' },
    });

    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}`,
        fechaInicio: new Date('2026-12-01T00:00:00.000Z'),
        fechaFin: new Date('2026-12-07T00:00:00.000Z'),
        cierreInscripcion: new Date('2026-11-25T00:00:00.000Z'),
        cuadros: {
          create: {
            categoriaJuegoId: categoriaJuego.id,
            cupo: 4,
          },
        },
      },
      select: { id: true, cuadros: { select: { id: true } } },
    });
    torneoId = torneo.id;
    cuadroId = torneo.cuadros[0].id;

    // Los cuatro jugadores llevan teléfono: es lo que no puede salir publicado.
    for (const [i, nombre] of ['Ana', 'Beto', 'Cata', 'Dani'].entries()) {
      const jugador = await request(app.getHttpServer())
        .post('/api/admin/jugadores')
        .set('Cookie', cookieAdmin)
        .send({ nombre, apellido: APELLIDO, telefono: TELEFONOS[i] })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/admin/cuadros/${cuadroId}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .send({ jugadorId: (jugador.body as { id: number }).id })
        .expect(201);
    }
  });

  it('**el calendario se ve sin cuenta**', async () => {
    const torneos = await calendario('?anio=2026');
    const suyo = torneos.find((t) => t.id === torneoId);

    expect(suyo?.nombre).toContain(MARCA);
    // Sin categoría de torneo (T199): cuánto vale ganarlo lo dicen sus tours.
    expect(suyo?.categorias[0]).not.toHaveProperty('valor');
  });

  it('**dice cuánto cuesta inscribirse en cada categoría**', async () => {
    // Es la pregunta que sigue a "¿quedan cupos?", y el monto cuelga del cuadro: Honor
    // puede costar el doble que la 5ª en el mismo torneo. Sin esto, quien mira el
    // calendario tiene que llamar al club para saber el precio, que es justo lo que la
    // inscripción en línea vino a sacar del teléfono.
    // El monto se pone acá y no en el fixture: un cuadro con inscripciones pendientes
    // de pago no se puede armar, y los demás tests de este archivo arman el suyo.
    await prisma.torneoCategoria.update({
      where: { id: cuadroId },
      data: { montoInscripcionClp: 12_000 },
    });

    const suyo = (await calendario('?anio=2026')).find(
      (t) => t.id === torneoId,
    );

    expect(suyo?.categorias[0].montoClp).toBe(12_000);
  });

  describe('las fotos de antes del torneo (T313, SPEC-sitio.md A1 y A2)', () => {
    /** Una foto en la base, sin archivo: la lista solo publica sus direcciones. */
    const foto = (
      momento: 'ANTES' | 'DURANTE' | 'DESPUES',
      descripcion: string,
      extra = {},
    ) =>
      prisma.fotoTorneo.create({
        data: {
          torneoId,
          momento,
          descripcion,
          rutaWeb: 'x.webp',
          rutaMiniatura: 'x-m.webp',
          ...extra,
        },
        select: { id: true },
      });

    it('**cada torneo trae sus afiches**: las de antes, de la más vieja a la más nueva', async () => {
      const afiche = await foto('ANTES', 'El afiche', {
        creadaEn: new Date('2026-10-01T12:00:00Z'),
      });
      const bases = await foto('ANTES', 'Las bases', {
        creadaEn: new Date('2026-10-02T12:00:00Z'),
      });
      await foto('DURANTE', 'La final');
      await foto('DESPUES', 'La premiación');

      const suyo = (await calendario('?anio=2026')).find(
        (t) => t.id === torneoId,
      )!;

      expect(suyo.afiches).toEqual([
        {
          id: afiche.id,
          partidoId: null,
          momento: 'ANTES',
          descripcion: 'El afiche',
          miniatura: `/api/torneos/fotos/${afiche.id}/miniatura`,
          imagen: `/api/torneos/fotos/${afiche.id}/imagen`,
        },
        expect.objectContaining({ id: bases.id, descripcion: 'Las bases' }),
      ]);
    });

    it('**la previa de un partido no es un afiche**, aunque también sea de antes', async () => {
      const partido = await prisma.partido.create({
        data: { torneoId, torneoCategoriaId: cuadroId, ronda: 1, posicion: 1 },
        select: { id: true },
      });
      await foto('ANTES', 'Ana y Beto antes de salir', {
        partidoId: partido.id,
      });

      const suyo = (await calendario('?anio=2026')).find(
        (t) => t.id === torneoId,
      )!;

      expect(suyo.afiches).toEqual([]);
    });

    it('un torneo sin fotos trae la lista vacía', async () => {
      const suyo = (await calendario('?anio=2026')).find(
        (t) => t.id === torneoId,
      )!;

      expect(suyo.afiches).toEqual([]);
    });
  });

  it('dice cuántos cupos quedan, que es lo que decide si alguien pregunta', async () => {
    const suyo = (await calendario('?anio=2026')).find(
      (t) => t.id === torneoId,
    );

    // T62: el cupo es de cada cuadro, así que el calendario los publica por categoría.
    expect(suyo?.categorias).toHaveLength(1);
    expect(suyo?.categorias[0].cupo).toBe(4);
    expect(suyo?.categorias[0].cuposLibres).toBe(0);
  });

  /** El `beforeEach` deja 4 inscritos de 4: con otro cupo, la misma gente queda en otro lado del umbral. */
  const conCupo = (cupo: number) =>
    prisma.torneoCategoria.update({
      where: { id: cuadroId },
      data: { cupo },
    });

  /** Más inscritos, directo a la base: dieciséis pasadas por la API no prueban nada más. */
  const sumarInscritos = async (cuantos: number) => {
    for (let i = 0; i < cuantos; i++) {
      const jugador = await prisma.jugador.create({
        data: { nombre: `Extra${i}`, apellido: APELLIDO },
        select: { id: true },
      });
      await prisma.inscripcionTorneo.create({
        data: {
          torneoId,
          torneoCategoriaId: cuadroId,
          jugadorId: jugador.id,
        },
      });
    }
  };

  /**
   * T374, `SPEC.md` § Inscritos a la vista desde el 80 %. Con pocos inscritos, «quedan 30 de
   * 32» desmotiva al que está por inscribirse. El número sale desde el 80 % del cupo o desde
   * los 16 inscritos; antes, `null`: hay cupos y no se dice cuántos.
   */
  describe('cuántos cupos quedan, desde el 80 % o los 16 inscritos (T374)', () => {
    const cuposLibres = async () =>
      (await calendario('?anio=2026')).find((t) => t.id === torneoId)!
        .categorias[0].cuposLibres;

    it('con 4 inscritos de 5 (el 80 %) dice cuántos quedan', async () => {
      await conCupo(5);

      expect(await cuposLibres()).toBe(1);
    });

    it('**con 4 inscritos de 6 no dice cuántos quedan**', async () => {
      await conCupo(6);

      expect(await cuposLibres()).toBeNull();
    });

    it('**con 16 inscritos lo dice aunque el cupo sea de 32**', async () => {
      await conCupo(32);
      await sumarInscritos(12);

      expect(await cuposLibres()).toBe(16);
    });

    it('con 15 de 32 no lo dice', async () => {
      await conCupo(32);
      await sumarInscritos(11);

      expect(await cuposLibres()).toBeNull();
    });

    it('**cuenta lo que ocupa cupo**: el cupo ofrecido sí, la espera sin oferta no', async () => {
      // Con cupo 5, los 4 inscritos están justo en el 80 %: basta con que uno deje de contar.
      await conCupo(5);
      const [ana, beto] = await prisma.inscripcionTorneo.findMany({
        where: { torneoCategoriaId: cuadroId },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      await prisma.inscripcionTorneo.update({
        where: { id: ana.id },
        data: {
          estado: 'LISTA_ESPERA',
          cupoOfrecidoHasta: new Date('2026-11-01T00:00:00Z'),
        },
      });
      await prisma.inscripcionTorneo.update({
        where: { id: beto.id },
        data: { estadoPago: 'PENDIENTE' },
      });

      expect(await cuposLibres()).toBe(1);

      await prisma.inscripcionTorneo.update({
        where: { id: ana.id },
        data: { cupoOfrecidoHasta: null },
      });

      expect(await cuposLibres()).toBeNull();
    });

    it('**con el cuadro armado lo dice, aunque haya pocos**: el árbol ya muestra a todos', async () => {
      await conCupo(6);
      await request(app.getHttpServer())
        .post(`/api/admin/cuadros/${cuadroId}/armar`)
        .set('Cookie', cookieAdmin)
        .expect(201);

      expect(await cuposLibres()).toBe(2);
    });
  });

  /**
   * T375, `SPEC.md` § Inscritos a la vista desde el 80 %. Lo mismo para la lista de «Ver quiénes
   * juegan»: dos nombres desmotivan tanto como «quedan 30 de 32». Decide con el mismo número que
   * el calendario, así el modal y la tabla no se contradicen.
   */
  describe('quiénes juegan, desde el 80 % o los 16 inscritos (T375)', () => {
    const inscritos = async () => (await cuadro()).inscritos;

    it('con 4 inscritos de 5 (el 80 %) publica la lista', async () => {
      await conCupo(5);

      expect(await inscritos()).toHaveLength(4);
    });

    it('**con 4 inscritos de 6 no publica la lista, ni un nombre**', async () => {
      await conCupo(6);

      const respuesta = await cuadro();

      expect(respuesta.inscritos).toBeNull();
      expect(JSON.stringify(respuesta)).not.toContain(APELLIDO);
    });

    it('**con 16 inscritos la publica aunque el cupo sea de 32**', async () => {
      await conCupo(32);
      await sumarInscritos(12);

      expect(await inscritos()).toHaveLength(16);
    });

    it('con 15 de 32 no la publica', async () => {
      await conCupo(32);
      await sumarInscritos(11);

      expect(await inscritos()).toBeNull();
    });

    it('**decide con el número del calendario**: un cupo ofrecido cuenta, la espera sin oferta no', async () => {
      // Con cupo 5 los 4 están justo en el 80 %. Ana pasa a la espera con un cupo ofrecido:
      // sigue ocupando cupo, así que la lista se ve, aunque ella no esté en la lista.
      await conCupo(5);
      const [ana] = await prisma.inscripcionTorneo.findMany({
        where: { torneoCategoriaId: cuadroId },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      await prisma.inscripcionTorneo.update({
        where: { id: ana.id },
        data: {
          estado: 'LISTA_ESPERA',
          cupoOfrecidoHasta: new Date('2026-11-01T00:00:00Z'),
        },
      });

      expect(await inscritos()).toHaveLength(3);

      await prisma.inscripcionTorneo.update({
        where: { id: ana.id },
        data: { cupoOfrecidoHasta: null },
      });

      expect(await inscritos()).toBeNull();
    });

    it('**con el cuadro armado la publica, aunque haya pocos**', async () => {
      await conCupo(6);
      await request(app.getHttpServer())
        .post(`/api/admin/cuadros/${cuadroId}/armar`)
        .set('Cookie', cookieAdmin)
        .expect(201);

      expect(await inscritos()).toHaveLength(4);
    });
  });

  it('**ninguna respuesta pública trae un teléfono**', async () => {
    // El club tiene el teléfono de un jugador para llamarlo, no para publicarlo. Se
    // comprueba sobre el JSON entero: un campo nuevo que lo filtre entra sin que nadie
    // se acuerde de actualizar este test.
    await request(app.getHttpServer())
      .post(`/api/admin/cuadros/${cuadroId}/armar`)
      .set('Cookie', cookieAdmin)
      .expect(201);

    const delCalendario = JSON.stringify(await calendario('?anio=2026'));
    const delCuadro = JSON.stringify(await cuadro());

    for (const guardado of GUARDADOS) {
      expect(delCalendario).not.toContain(guardado);
      expect(delCuadro).not.toContain(guardado);
    }
    expect(delCuadro).not.toContain('telefono');
  });

  it('**la lista de inscritos sale con nombre y apellido**', async () => {
    const publicado = await cuadro();

    expect(publicado.inscritos).toHaveLength(4);
    expect(publicado.inscritos![0].nombre).toContain(APELLIDO);
  });

  /** T134. Lo que "Ver quiénes juegan" muestra antes de armar el cuadro. */
  describe('los inscritos, antes del cuadro (T134)', () => {
    const inscripciones = () =>
      prisma.inscripcionTorneo.findMany({
        where: { torneoCategoriaId: cuadroId },
        orderBy: { id: 'asc' },
        select: { id: true },
      });

    it('**van en el orden en que se inscribieron, no en el de la siembra**', async () => {
      // La siembra al revés: si la lista ordenara por siembra, Dani saldría primera.
      const filas = await inscripciones();
      for (const [i, fila] of filas.entries()) {
        await prisma.inscripcionTorneo.update({
          where: { id: fila.id },
          data: { siembra: filas.length - i },
        });
      }

      const publicado = await cuadro();

      expect(publicado.inscritos!.map((i) => i.nombre.split(' ')[0])).toEqual([
        'Ana',
        'Beto',
        'Cata',
        'Dani',
      ]);
    });

    it('**con su estado de pago, en una categoría que cobra**', async () => {
      await prisma.torneoCategoria.update({
        where: { id: cuadroId },
        data: { montoInscripcionClp: 15000 },
      });
      const [ana, beto] = await inscripciones();
      await prisma.inscripcionTorneo.update({
        where: { id: ana.id },
        data: { estadoPago: 'PAGADA' },
      });
      await prisma.inscripcionTorneo.update({
        where: { id: beto.id },
        data: { estadoPago: 'PENDIENTE' },
      });

      const publicado = await cuadro();

      expect(publicado.inscritos![0].pago).toBe('PAGADO');
      expect(publicado.inscritos![1].pago).toBe('PENDIENTE');
    });

    it('en una categoría gratis no lleva estado de pago', async () => {
      const publicado = await cuadro();

      expect(publicado.inscritos!.every((i) => i.pago === null)).toBe(true);
    });
  });

  it('antes de armar el cuadro hay inscritos y todavía no hay partidos', async () => {
    // Es lo que la gente quiere saber en ese momento: quiénes se anotaron.
    const publicado = await cuadro();

    expect(publicado.estado).toBe(EstadoTorneo.INSCRIPCION);
    expect(publicado.partidos).toHaveLength(0);
  });

  it('**el cuadro se publica con los resultados que ya se cargaron**', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/cuadros/${cuadroId}/armar`)
      .set('Cookie', cookieAdmin)
      .expect(201);

    const interno = await request(app.getHttpServer())
      .get(`/api/admin/cuadros/${cuadroId}`)
      .set('Cookie', cookieAdmin)
      .expect(200);
    const semi = (
      interno.body as {
        partidos: { id: number; ronda: number; jugadorAId: number }[];
      }
    ).partidos.find((p) => p.ronda === 1)!;

    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/partidos/${semi.id}/resultado`)
      .set('Cookie', cookieAdmin)
      .send({ ganadorId: semi.jugadorAId, marcador: '6-4 6-2' })
      .expect(200);

    const publicado = await cuadro();
    const jugado = publicado.partidos.find((p) => p.marcador !== null);

    expect(jugado?.marcador).toBe('6-4 6-2');
    expect(jugado?.ganador).toContain(APELLIDO);
    expect(jugado?.ronda_nombre).toBe('Semifinal');
  });

  it('**cada partido trae la siembra de sus dos jugadores**: el árbol la muestra (opción B)', async () => {
    // Es pública, como en el cuadro del mural y en el de la ATP. Se siembra a todos, en el
    // orden en que se inscribieron.
    const inscritos = await prisma.inscripcionTorneo.findMany({
      where: { torneoCategoriaId: cuadroId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        jugador: { select: { nombre: true, apellido: true } },
      },
    });
    const siembra = new Map<string, number>();
    for (const [i, inscrito] of inscritos.entries()) {
      await prisma.inscripcionTorneo.update({
        where: { id: inscrito.id },
        data: { siembra: i + 1 },
      });
      siembra.set(
        `${inscrito.jugador.nombre} ${inscrito.jugador.apellido}`,
        i + 1,
      );
    }
    await request(app.getHttpServer())
      .post(`/api/admin/cuadros/${cuadroId}/armar`)
      .set('Cookie', cookieAdmin)
      .expect(201);

    const primeraRonda = (await cuadro()).partidos.filter((p) => p.ronda === 1);

    expect(primeraRonda.length).toBeGreaterThan(0);
    for (const partido of primeraRonda) {
      expect(partido.siembraA).toBe(
        siembra.get(partido.jugadorA ?? '') ?? null,
      );
      expect(partido.siembraB).toBe(
        siembra.get(partido.jugadorB ?? '') ?? null,
      );
    }
  });

  it('**un partido programado trae el día, la hora y la cancha** (T134)', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/cuadros/${cuadroId}/armar`)
      .set('Cookie', cookieAdmin)
      .expect(201);

    // Programado como lo deja T67: el partido con su hora y el bloqueo de su cancha. El
    // camino entero de programar se prueba en `torneos-programacion.spec.ts`.
    const cancha = await prisma.cancha.create({
      data: { nombre: `${MARCA} cancha ${Date.now()}`, superficie: 'CEMENTO' },
      select: { id: true, nombre: true },
    });
    const inicio = new Date('2026-12-05T13:00:00.000Z');
    const fin = new Date('2026-12-05T15:00:00.000Z');
    const bloqueo = await prisma.bloqueo.create({
      data: { canchaId: cancha.id, inicio, fin, motivo: 'TORNEO' },
      select: { id: true },
    });
    const primero = await prisma.partido.findFirstOrThrow({
      where: { torneoCategoriaId: cuadroId, ronda: 1 },
      orderBy: { posicion: 'asc' },
      select: { id: true },
    });
    await prisma.partido.update({
      where: { id: primero.id },
      data: {
        programadoInicio: inicio,
        programadoFin: fin,
        bloqueoId: bloqueo.id,
      },
    });

    const publicado = await cuadro();
    const [programado, sinProgramar] = publicado.partidos;

    expect(programado).toMatchObject({
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      cancha: cancha.nombre,
    });
    expect(sinProgramar).toMatchObject({
      inicio: null,
      fin: null,
      cancha: null,
    });
  });

  it('**un torneo cancelado no se publica**', async () => {
    // No se va a jugar: en el calendario es ruido en la pantalla que alguien mira
    // para decidir si se asocia.
    await prisma.torneo.update({
      where: { id: torneoId },
      data: { estado: EstadoTorneo.CANCELADO },
    });

    expect(
      (await calendario('?anio=2026')).some((t) => t.id === torneoId),
    ).toBe(false);
    await request(app.getHttpServer())
      .get(`/api/torneos/cuadros/${cuadroId}`)
      .expect(404);
  });

  it('el calendario es de un año: lo del año que viene no se mezcla', async () => {
    expect(
      (await calendario('?anio=2025')).some((t) => t.id === torneoId),
    ).toBe(false);
  });

  it('un año ilegible se cae al actual en vez de fallar', async () => {
    await request(app.getHttpServer())
      .get('/api/torneos/publicos?anio=nomeacuerdo')
      .expect(200);
  });

  it('las fechas salen como fecha civil, no como instante', async () => {
    const suyo = (await calendario('?anio=2026')).find(
      (t) => t.id === torneoId,
    );

    expect(suyo?.fechaInicio).toBe('2026-12-01');
  });
});
