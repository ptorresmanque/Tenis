import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  EstadoReserva,
  NivelClase,
  Superficie,
  TipoClase,
} from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { EnviadorCorreo } from '../src/identidad/correo';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T231. Las clases de preparación física, en el gimnasio (`SPEC-clases.md` § Series con un
 * horario por día y clases en el gimnasio, criterios 20 a 24 y 26).
 *
 * El gimnasio no tiene cancha, ni grilla, ni reservas: lo único que cuidar es que haya una
 * clase a la vez. El caso que importa es el concurrente: dos clases pedidas a la vez para la
 * misma hora, que sin candado entran las dos.
 *
 * En 2044, que nadie más usa: el gimnasio es uno solo para toda la base, así que una clase de
 * otra prueba a la misma hora lo ocuparía. El 7 de marzo de 2044 es lunes.
 */
describe('Clases de preparación física en el gimnasio', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@clases-t231.test';
  const CANCHA = 'Cancha T231';
  const CONTRASENA = 'raqueta lluviosa 44';
  const DIA = '2044-03-07';

  let canchaId: number;
  /** La ficha que usa el admin, sin cuenta. */
  let ficha: number;
  /** La del profesor que entra al panel (26). */
  let fichaDelProfe: number;
  let fichaDeOtro: number;
  let configuracionAntes: {
    gimnasioCupoGrupal: number;
    topeCanchasConLuz: number | null;
    topeCanchasConLuzDesde: string;
  };

  const cookies: Record<string, string> = {};
  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const crearCuenta = async (quien: string, esAdmin = false) => {
    const usuario = await prisma.usuario.create({
      data: {
        email: `${quien}${DOMINIO}`,
        nombre: quien,
        apellido: 'T231',
        telefono: '56911112222',
        passwordHash: await hashear(CONTRASENA),
        esAdmin,
      },
      select: { id: true },
    });

    const respuesta = await request(servidor())
      .post('/api/auth/login')
      .send({ email: `${quien}${DOMINIO}`, contrasena: CONTRASENA })
      .expect(204);
    cookies[quien] = (
      respuesta.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];

    return usuario.id;
  };

  const crearFicha = async (nombreVisible: string, usuarioId?: number) =>
    (
      await prisma.profesor.create({
        data: {
          nombreVisible,
          telefono: '56933334444',
          especialidad: 'Preparación física',
          usuarioId,
        },
        select: { id: true },
      })
    ).id;

  const como = (quien: string) => ({
    get: (ruta: string) =>
      request(servidor())
        .get(`/api/admin/${ruta}`)
        .set('Cookie', cookies[quien]),
    post: (ruta: string, cuerpo: object = {}) =>
      request(servidor())
        .post(`/api/admin/${ruta}`)
        .set('Cookie', cookies[quien])
        .send(cuerpo),
    patch: (ruta: string, cuerpo: object = {}) =>
      request(servidor())
        .patch(`/api/admin/${ruta}`)
        .set('Cookie', cookies[quien])
        .send(cuerpo),
  });
  const admin = () => como('jefe');

  /** Una clase del gimnasio: sin cancha ni nivel. Individual, si no se dice otra cosa. */
  const gimnasio = (
    horaDesde: string,
    horaHasta: string,
    parche: object = {},
  ) => ({
    tipo: TipoClase.PREPARACION_FISICA,
    profesorId: ficha,
    fecha: DIA,
    horaDesde,
    horaHasta,
    cupoMaximo: 1,
    ...parche,
  });

  const tenis = (
    horaDesde: string,
    horaHasta: string,
    parche: object = {},
  ) => ({
    tipo: TipoClase.TENIS,
    canchaId,
    profesorId: ficha,
    fecha: DIA,
    horaDesde,
    horaHasta,
    cupoMaximo: 6,
    nivel: NivelClase.INICIACION,
    ...parche,
  });

  const agendar = async (cuerpo: object) =>
    (await admin().post('clases', cuerpo).expect(201)).body as {
      id: number;
      bloqueoId: number | null;
    };

  const limpiar = async () => {
    // Las clases del gimnasio no caen con ninguna cancha: se borran antes que sus profesores.
    const deLaPrueba = { profesor: { nombreVisible: { endsWith: 'T231' } } };
    await prisma.clase.deleteMany({ where: deLaPrueba });
    await prisma.serieDeClases.deleteMany({ where: deLaPrueba });
    await prisma.cancha.deleteMany({ where: { nombre: CANCHA } });
    await prisma.profesor.deleteMany({
      where: { nombreVisible: { endsWith: 'T231' } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .overrideProvider(EnviadorCorreo)
      .useValue({ enviar: () => Promise.resolve() })
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);

    await limpiar();

    configuracionAntes = await prisma.configuracionClub.findUniqueOrThrow({
      where: { id: 1 },
      select: {
        gimnasioCupoGrupal: true,
        topeCanchasConLuz: true,
        topeCanchasConLuzDesde: true,
      },
    });
    await prisma.configuracionClub.update({
      where: { id: 1 },
      data: { gimnasioCupoGrupal: 8 },
    });

    canchaId = (
      await prisma.cancha.create({
        data: {
          nombre: CANCHA,
          superficie: Superficie.CEMENTO,
          iluminacion: true,
          horarios: {
            create: {
              diaSemana: 1,
              horaApertura: '08:00',
              horaCierre: '23:00',
            },
          },
          franjas: {
            create: {
              horaDesde: '08:00',
              horaHasta: '23:00',
              montoClp: 12000,
              vigenteDesde: new Date('2026-01-01'),
            },
          },
        },
        select: { id: true },
      })
    ).id;

    await crearCuenta('jefe', true);
    ficha = await crearFicha('Profe T231');
    fichaDelProfe = await crearFicha(
      'Profe con cuenta T231',
      await crearCuenta('profe'),
    );
    fichaDeOtro = await crearFicha('Otro profe T231');
  });

  afterAll(async () => {
    await prisma.configuracionClub.update({
      where: { id: 1 },
      data: configuracionAntes,
    });
    await limpiar();
    await app.close();
  });

  describe('agendar (criterio 20)', () => {
    it('**se agenda sin cancha ni nivel, sin bloqueo, y la reserva de esa hora sigue en pie**', async () => {
      const reserva = await prisma.reserva.create({
        data: {
          folio: 'T231001',
          canchaId,
          inicio: instanteEnElClub(DIA, '10:00'),
          fin: instanteEnElClub(DIA, '11:00'),
          estado: EstadoReserva.CONFIRMADA,
          nombre: 'Visitante T231',
          email: `visitante${DOMINIO}`,
          telefono: '56900000000',
        },
        select: { id: true },
      });
      const bloqueosAntes = await prisma.bloqueo.count();

      const respuesta = await admin()
        .post('clases', gimnasio('10:00', '11:00'))
        .expect(201);

      expect(respuesta.body).toEqual({
        id: expect.any(Number) as number,
        bloqueoId: null,
        canceladas: [],
      });
      expect(
        await prisma.clase.findUniqueOrThrow({
          where: { id: (respuesta.body as { id: number }).id },
          select: { tipo: true, canchaId: true, nivel: true, bloqueoId: true },
        }),
      ).toEqual({
        tipo: TipoClase.PREPARACION_FISICA,
        canchaId: null,
        nivel: null,
        bloqueoId: null,
      });
      expect(await prisma.bloqueo.count()).toBe(bloqueosAntes);
      expect(
        (
          await prisma.reserva.findUniqueOrThrow({
            where: { id: reserva.id },
            select: { estado: true },
          })
        ).estado,
      ).toBe(EstadoReserva.CONFIRMADA);
    });

    it('la simulación no tiene a quién avisar', async () => {
      const respuesta = await admin()
        .post('clases/simulacion', gimnasio('12:00', '13:00'))
        .expect(200);

      expect(respuesta.body).toEqual({ afectadas: [] });
    });

    it('sin tipo, la clase es de tenis, como hasta hoy', async () => {
      const { tipo: _tipo, ...sinTipo } = tenis('12:00', '13:00');
      const { id } = await agendar(sinTipo);

      expect(
        await prisma.clase.findUniqueOrThrow({
          where: { id },
          select: { tipo: true, canchaId: true },
        }),
      ).toEqual({ tipo: TipoClase.TENIS, canchaId });
    });
  });

  describe('una clase a la vez (criterio 21)', () => {
    it('**otra que se cruza responde 409 GIMNASIO_OCUPADO; la que empieza cuando termina, entra**', async () => {
      await agendar(gimnasio('14:00', '15:00'));

      const cruzada = await admin()
        .post('clases', gimnasio('14:30', '15:30'))
        .expect(409);

      expect(cruzada.body).toMatchObject({
        motivo: 'GIMNASIO_OCUPADO',
        message: expect.stringContaining('14:00') as string,
      });
      await agendar(gimnasio('15:00', '16:00'));
    });

    it('la simulación de una que se cruza ya lo dice', async () => {
      const respuesta = await admin()
        .post('clases/simulacion', gimnasio('14:00', '15:00'))
        .expect(409);

      expect(respuesta.body).toMatchObject({ motivo: 'GIMNASIO_OCUPADO' });
    });

    it('una cancelada ya no ocupa el gimnasio', async () => {
      const { id } = await agendar(gimnasio('16:00', '17:00'));
      await admin()
        .post(`clases/${id}/cancelacion`, { motivo: 'Se enfermó el profesor' })
        .expect(200);

      await agendar(gimnasio('16:00', '17:00'));
    });

    it('**pedidas a la vez para la misma hora, entra una**', async () => {
      const respuestas = await Promise.all(
        [1, 2, 3, 4, 5].map(() =>
          admin().post('clases', gimnasio('17:00', '18:00')),
        ),
      );

      expect(respuestas.map((r) => r.status).sort()).toEqual([
        201, 409, 409, 409, 409,
      ]);
      expect(
        await prisma.clase.count({
          where: {
            tipo: TipoClase.PREPARACION_FISICA,
            inicio: instanteEnElClub(DIA, '17:00'),
          },
        }),
      ).toBe(1);
    });
  });

  it('**no cuenta para el tope de canchas con luz** (criterio 22)', async () => {
    await prisma.configuracionClub.update({
      where: { id: 1 },
      data: { topeCanchasConLuz: 1, topeCanchasConLuzDesde: '08:00' },
    });

    try {
      await agendar(gimnasio('19:00', '20:00'));
      // Con el tope en una cancha, la de tenis entra: el gimnasio no enciende ninguna.
      await agendar(tenis('19:00', '20:00'));
    } finally {
      await prisma.configuracionClub.update({
        where: { id: 1 },
        data: {
          topeCanchasConLuz: configuracionAntes.topeCanchasConLuz,
          topeCanchasConLuzDesde: configuracionAntes.topeCanchasConLuzDesde,
        },
      });
    }
  });

  describe('el cupo (criterio 23)', () => {
    it('**la grupal llega hasta el cupo del club; uno más responde 400**', async () => {
      await agendar(gimnasio('08:00', '09:00', { cupoMaximo: 8 }));

      const respuesta = await admin()
        .post('clases', gimnasio('09:00', '10:00', { cupoMaximo: 9 }))
        .expect(400);

      expect((respuesta.body as { message: string }).message).toMatch(/8/);
    });

    it('el cupo lo pone el club: con 10, una de 9 entra', async () => {
      await prisma.configuracionClub.update({
        where: { id: 1 },
        data: { gimnasioCupoGrupal: 10 },
      });

      try {
        await agendar(gimnasio('09:00', '10:00', { cupoMaximo: 9 }));
      } finally {
        await prisma.configuracionClub.update({
          where: { id: 1 },
          data: { gimnasioCupoGrupal: 8 },
        });
      }
    });
  });

  describe('lo que lleva cada tipo (criterio 24)', () => {
    const RECHAZOS: [string, () => object, RegExp][] = [
      [
        'tenis sin cancha',
        () => tenis('21:00', '22:00', { canchaId: undefined }),
        /cancha/i,
      ],
      [
        'tenis sin nivel',
        () => tenis('21:00', '22:00', { nivel: undefined }),
        /nivel/i,
      ],
      [
        'el gimnasio con cancha',
        () => gimnasio('21:00', '22:00', { canchaId }),
        /cancha/i,
      ],
      [
        'el gimnasio con nivel',
        () => gimnasio('21:00', '22:00', { nivel: NivelClase.INICIACION }),
        /nivel/i,
      ],
      [
        'el gimnasio sin alumnos',
        () => gimnasio('21:00', '22:00', { cupoMaximo: 0 }),
        /cupo/i,
      ],
      [
        'un tipo que no existe',
        () => gimnasio('21:00', '22:00', { tipo: 'PESAS' }),
        /tipo/i,
      ],
    ];

    it.each(RECHAZOS)('%s responde 400', async (_caso, cuerpo, mensaje) => {
      const respuesta = await admin().post('clases', cuerpo()).expect(400);

      expect((respuesta.body as { message: string }).message).toMatch(mensaje);
    });
  });

  describe('mover', () => {
    let movida: number;

    beforeAll(async () => {
      ({ id: movida } = await agendar(gimnasio('20:00', '21:00')));
      await agendar(gimnasio('22:00', '23:00'));
    });

    it('cambia la hora, y no choca consigo misma', async () => {
      await admin()
        .patch(`clases/${movida}`, {
          fecha: DIA,
          horaDesde: '20:30',
          horaHasta: '21:30',
        })
        .expect(200);

      expect(
        await prisma.clase.findUniqueOrThrow({
          where: { id: movida },
          select: { inicio: true, canchaId: true },
        }),
      ).toEqual({ inicio: instanteEnElClub(DIA, '20:30'), canchaId: null });
    });

    it('**sobre otra del gimnasio responde 409 GIMNASIO_OCUPADO y queda donde estaba**', async () => {
      const respuesta = await admin()
        .patch(`clases/${movida}`, {
          fecha: DIA,
          horaDesde: '21:30',
          horaHasta: '22:30',
        })
        .expect(409);

      expect(respuesta.body).toMatchObject({ motivo: 'GIMNASIO_OCUPADO' });
      expect(
        (
          await prisma.clase.findUniqueOrThrow({
            where: { id: movida },
            select: { inicio: true },
          })
        ).inicio,
      ).toEqual(instanteEnElClub(DIA, '20:30'));
    });

    it('a una cancha no se mueve: mover no cambia el tipo', async () => {
      const respuesta = await admin()
        .patch(`clases/${movida}`, {
          fecha: DIA,
          horaDesde: '20:30',
          horaHasta: '21:30',
          canchaId,
        })
        .expect(400);

      expect((respuesta.body as { message: string }).message).toMatch(
        /gimnasio/i,
      );
    });
  });

  describe('el profesor (criterio 26)', () => {
    const NOCHE = '2044-03-08';

    it('agenda una del gimnasio a su nombre', async () => {
      await como('profe')
        .post('clases', {
          ...gimnasio('08:00', '09:00'),
          fecha: NOCHE,
          profesorId: fichaDelProfe,
        })
        .expect(201);
    });

    it('a nombre de otro, 403', async () => {
      await como('profe')
        .post('clases', {
          ...gimnasio('10:00', '11:00'),
          fecha: NOCHE,
          profesorId: fichaDeOtro,
        })
        .expect(403);
    });
  });

  /** T232. La serie del gimnasio: sus días van sin cancha y ella, sin nivel. */
  describe('series del gimnasio (criterios 18 y 20)', () => {
    /** Lunes de 7 a 8 y miércoles de 18 a 19, sin cancha. Individual. */
    const serieDelGimnasio = (parche: object = {}) => ({
      tipo: TipoClase.PREPARACION_FISICA,
      profesorId: ficha,
      dias: [
        { diaSemana: 1, horaDesde: '07:00', horaHasta: '08:00' },
        { diaSemana: 3, horaDesde: '18:00', horaHasta: '19:00' },
      ],
      desde: '2044-04-04',
      hasta: '2044-04-13',
      cupoMaximo: 1,
      ...parche,
    });

    it('**genera sus clases en el gimnasio, cada una con el horario de su día**', async () => {
      const respuesta = await admin()
        .post('clases/series', { ...serieDelGimnasio(), decisiones: {} })
        .expect(201);
      const { id, clases } = respuesta.body as {
        id: number;
        clases: { id: number; fecha: string }[];
      };

      expect(clases.map((clase) => clase.fecha)).toEqual([
        '2044-04-04',
        '2044-04-06',
        '2044-04-11',
        '2044-04-13',
      ]);
      expect(
        await prisma.clase.findMany({
          where: { serieId: id },
          orderBy: { inicio: 'asc' },
          select: { tipo: true, canchaId: true, nivel: true, inicio: true },
        }),
      ).toEqual(
        [
          ['2044-04-04', '07:00'],
          ['2044-04-06', '18:00'],
          ['2044-04-11', '07:00'],
          ['2044-04-13', '18:00'],
        ].map(([fecha, hora]) => ({
          tipo: TipoClase.PREPARACION_FISICA,
          canchaId: null,
          nivel: null,
          inicio: instanteEnElClub(fecha, hora),
        })),
      );
      expect(
        await prisma.serieDeClases.findUniqueOrThrow({
          where: { id },
          select: {
            tipo: true,
            nivel: true,
            dias: { select: { canchaId: true } },
          },
        }),
      ).toEqual({
        tipo: TipoClase.PREPARACION_FISICA,
        nivel: null,
        dias: [{ canchaId: null }, { canchaId: null }],
      });
    });

    it('**la fecha que se cruza con otra del gimnasio solo se salta; sin saltarla, FALTA_DECIDIR**', async () => {
      // El miércoles 20 ya tiene una suelta a las 18:00.
      await agendar({ ...gimnasio('18:00', '19:00'), fecha: '2044-04-20' });
      const serie = serieDelGimnasio({
        dias: [{ diaSemana: 3, horaDesde: '18:30', horaHasta: '19:30' }],
        desde: '2044-04-18',
        hasta: '2044-04-27',
      });

      const { fechas } = (
        await admin().post('clases/series/simulacion', serie).expect(200)
      ).body as {
        fechas: {
          fecha: string;
          choque: string | null;
          afectadas: unknown[];
        }[];
      };
      expect(fechas).toEqual([
        expect.objectContaining({
          fecha: '2044-04-20',
          choque: expect.stringContaining(
            'El gimnasio ya tiene una clase',
          ) as string,
          afectadas: [],
        }),
        expect.objectContaining({
          fecha: '2044-04-27',
          choque: null,
          afectadas: [],
        }),
      ]);

      const sinSaltar = await admin()
        .post('clases/series', { ...serie, decisiones: {} })
        .expect(409);
      expect(sinSaltar.body).toMatchObject({ motivo: 'FALTA_DECIDIR' });

      const saltando = await admin()
        .post('clases/series', {
          ...serie,
          decisiones: { '2044-04-20': 'saltar' },
        })
        .expect(201);
      expect(saltando.body).toMatchObject({
        clases: [{ fecha: '2044-04-27' }],
        saltadas: ['2044-04-20'],
      });
    });

    it('el cupo sobre el tope rechaza la serie entera, no cada fecha', async () => {
      const respuesta = await admin()
        .post('clases/series/simulacion', serieDelGimnasio({ cupoMaximo: 9 }))
        .expect(400);

      expect((respuesta.body as { message: string }).message).toMatch(/8/);
    });

    const RECHAZOS: [string, () => object, RegExp][] = [
      [
        'una del gimnasio con cancha en algún día',
        () =>
          serieDelGimnasio({
            dias: [
              { diaSemana: 1, horaDesde: '07:00', horaHasta: '08:00' },
              {
                diaSemana: 3,
                horaDesde: '18:00',
                horaHasta: '19:00',
                canchaId,
              },
            ],
          }),
        /cancha/i,
      ],
      [
        'una del gimnasio con nivel',
        () => serieDelGimnasio({ nivel: NivelClase.INICIACION }),
        /nivel/i,
      ],
      [
        'una de tenis sin cancha',
        () =>
          serieDelGimnasio({
            tipo: TipoClase.TENIS,
            nivel: NivelClase.INICIACION,
          }),
        /cancha/i,
      ],
    ];

    it.each(RECHAZOS)('%s responde 400', async (_caso, cuerpo, mensaje) => {
      const respuesta = await admin()
        .post('clases/series/simulacion', cuerpo())
        .expect(400);

      expect((respuesta.body as { message: string }).message).toMatch(mensaje);
    });

    it('el profesor agenda una serie del gimnasio a su nombre (26)', async () => {
      await como('profe')
        .post('clases/series', {
          ...serieDelGimnasio({
            profesorId: fichaDelProfe,
            desde: '2044-05-02',
            hasta: '2044-05-04',
          }),
          decisiones: {},
        })
        .expect(201);
    });
  });

  /** T232. Lo público dice el tipo y el lugar: "Gimnasio" donde va la cancha. */
  describe('lo público', () => {
    const publicas = async () =>
      (
        await request(servidor())
          .get('/api/clases/publicas?desde=2044-04-04')
          .expect(200)
      ).body as {
        clases: {
          id: number;
          tipo: string;
          lugar: string;
          nivel: string | null;
        }[];
        series: {
          tipo: string;
          nivel: string | null;
          profesor: string;
          dias: { lugar: string }[];
        }[];
      };

    it('**la clase suelta del gimnasio sale con su tipo, "Gimnasio" y sin nivel**', async () => {
      const { id } = await agendar({
        ...gimnasio('06:00', '07:00'),
        fecha: '2044-04-05',
      });

      expect(
        (await publicas()).clases.find((clase) => clase.id === id),
      ).toMatchObject({
        tipo: TipoClase.PREPARACION_FISICA,
        lugar: 'Gimnasio',
        nivel: null,
        // Con el cupo, la página dice si es grupal o individual (T234).
        cupoMaximo: 1,
      });
    });

    it('**la serie del gimnasio también, con "Gimnasio" en cada día**', async () => {
      const deLaPrueba = (await publicas()).series.filter(
        (serie) => serie.profesor === 'Profe T231',
      );

      expect(deLaPrueba[0]).toMatchObject({
        tipo: TipoClase.PREPARACION_FISICA,
        nivel: null,
        dias: [{ lugar: 'Gimnasio' }, { lugar: 'Gimnasio' }],
      });
    });
  });

  describe('lo que se ve (A7)', () => {
    it('**la agenda del día dice "Gimnasio" donde va la cancha, con el tipo**', async () => {
      const clases = (await admin().get(`clases?fecha=${DIA}`).expect(200))
        .body as {
        inicio: string;
        tipo: string;
        lugar: string;
        nivel: string | null;
      }[];

      const a = (hora: string) =>
        clases.find(
          (clase) => clase.inicio === instanteEnElClub(DIA, hora).toISOString(),
        );

      expect(a('10:00')).toMatchObject({
        tipo: TipoClase.PREPARACION_FISICA,
        lugar: 'Gimnasio',
        nivel: null,
        // Sin cancha: el tablero de la agenda la pone en la columna del gimnasio (T269).
        canchaId: null,
      });
      expect(a('12:00')).toMatchObject({
        tipo: TipoClase.TENIS,
        lugar: CANCHA,
        canchaId: expect.any(Number) as number,
      });
    });

    it('la ficha también', async () => {
      const { id } = await agendar(gimnasio('13:00', '14:00'));

      expect(
        (await admin().get(`clases/${id}`).expect(200)).body,
      ).toMatchObject({
        tipo: TipoClase.PREPARACION_FISICA,
        lugar: 'Gimnasio',
        nivel: null,
      });
    });
  });
});
