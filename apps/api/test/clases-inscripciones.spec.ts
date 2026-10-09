import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hoyEnElClub } from '../src/comun/tiempo';
import { EnviadorCorreo } from '../src/identidad/correo';
import {
  EstadoClase,
  EstadoInscripcion,
  EstadoSocio,
  NivelClase,
  Superficie,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T47: quién viene a la clase, con el cupo impuesto por el servidor.
 *
 * **El cupo lo decide la base, no la pantalla.** Dos personas apretando el último
 * cupo a la vez es el caso que este archivo existe para cerrar: sin la fila de la
 * clase tomada como cerrojo, las dos cuentan cinco inscritos, las dos ven un lugar
 * libre y las dos entran. El profesor se entera con siete alumnos en la cancha.
 */
describe('Inscripciones a una clase', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let canchaId: number;
  let profesorId: number;
  let claseId: number;
  let socioId: number;
  let cookieAdmin: string;
  let cookieSocio: string;

  const correo = { enviar: () => Promise.resolve() };

  const NOMBRE_CANCHA = 'Cancha de los inscritos';
  const DOMINIO = '@inscripciones.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  const enTresDias = () =>
    new Date(hoyEnElClub().getTime() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'De la clase',
      });

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
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA });

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  const crearSocio = async (sufijo: string) => {
    const usuarioId = await crearCuenta(sufijo);
    const socio = await prisma.socio.create({
      data: {
        usuarioId,
        numeroSocio: `INS-${sufijo}-${Date.now()}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2020-01-01T00:00:00.000Z'),
        alDiaHasta: new Date('2027-01-01T00:00:00.000Z'),
      },
      select: { id: true },
    });

    return socio.id;
  };

  const inscribir = (cuerpo: Record<string, unknown>, clase = claseId) =>
    request(app.getHttpServer())
      .post(`/api/admin/clases/${clase}/inscripciones`)
      .set('Cookie', cookieAdmin)
      .send(cuerpo);

  const laClase = async (id = claseId) => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/clases/${id}`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as {
      id: number;
      estado: string;
      cupoMaximo: number;
      cupoTomado: number;
      inscritos: {
        id: number;
        nombre: string;
        telefono: string;
        esSocio: boolean;
        estado: string;
      }[];
    };
  };

  /** Una clase con el cupo que pida el test. */
  const crearClase = async (cupoMaximo: number, hora = '18:00') => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/clases')
      .set('Cookie', cookieAdmin)
      .send({
        canchaId,
        profesorId,
        fecha: enTresDias(),
        horaDesde: hora,
        horaHasta: hora === '18:00' ? '19:00' : '21:00',
        cupoMaximo,
        nivel: NivelClase.INICIACION,
      })
      .expect(201);

    return (respuesta.body as { id: number }).id;
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnviadorCorreo)
      .useValue(correo)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await prisma.profesor.deleteMany({
      where: { nombreVisible: 'Profe de inscripciones' },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await prisma.profesor.deleteMany({
      where: { nombreVisible: 'Profe de inscripciones' },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    const cancha = await prisma.cancha.create({
      data: {
        nombre: NOMBRE_CANCHA,
        superficie: Superficie.ARCILLA,
        techada: false,
        iluminacion: true,
        activa: true,
        horarios: {
          create: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
            diaSemana,
            horaApertura: '08:00',
            horaCierre: '22:00',
          })),
        },
        franjas: {
          create: {
            horaDesde: '08:00',
            horaHasta: '22:00',
            montoClp: 12000,
            vigenteDesde: new Date('2026-01-01'),
          },
        },
      },
      select: { id: true },
    });
    canchaId = cancha.id;

    const profesor = await prisma.profesor.create({
      data: {
        nombreVisible: 'Profe de inscripciones',
        telefono: '+56944444444',
        especialidad: 'Iniciación',
      },
      select: { id: true },
    });
    profesorId = profesor.id;

    await crearCuenta('jefe', true);
    cookieAdmin = await entrar('jefe');
    socioId = await crearSocio('socia');
    cookieSocio = await entrar('socia');

    claseId = await crearClase(2);
  });

  it('el club inscribe a un socio y aparece en la lista de la clase', async () => {
    await inscribir({ socioId }).expect(201);

    const clase = await laClase();
    expect(clase.cupoTomado).toBe(1);
    expect(clase.inscritos[0]).toMatchObject({
      esSocio: true,
      estado: EstadoInscripcion.INSCRITA,
    });
    // El nombre sale de su ficha y no se copia: si lo cambia, la lista lo sigue.
    expect(clase.inscritos[0].nombre).toContain('Persona socia');
  });

  it('el alumno de afuera entra con nombre y teléfono', async () => {
    await inscribir({
      nombre: 'Benjamín Apoderado',
      telefono: '+56977778888',
    }).expect(201);

    const clase = await laClase();
    expect(clase.inscritos[0]).toMatchObject({
      esSocio: false,
      nombre: 'Benjamín Apoderado',
      telefono: '56977778888',
    });
  });

  it('**el alumno de afuera sin teléfono no entra: el club no podría avisarle**', async () => {
    await inscribir({ nombre: 'Sin teléfono' }).expect(400);
  });

  it('**socio y nombre a la vez se rechaza: esa fila se cuenta una vez o dos**', async () => {
    // La base no puede imponerlo —MariaDB no deja un CHECK sobre una columna con
    // foreign key—, así que lo impone el servicio y lo cuida este test.
    await inscribir({
      socioId,
      nombre: 'Las dos cosas',
      telefono: '+56911112222',
    }).expect(400);

    expect(await prisma.inscripcionClase.count({ where: { claseId } })).toBe(0);
  });

  it('una inscripción sin socio ni nombre tampoco', async () => {
    await inscribir({}).expect(400);
  });

  it('**el mismo socio dos veces en la misma clase se rechaza**', async () => {
    await inscribir({ socioId }).expect(201);

    await inscribir({ socioId }).expect(409);

    expect(await prisma.inscripcionClase.count({ where: { claseId } })).toBe(1);
  });

  it('dos alumnos de afuera con el mismo nombre sí conviven', async () => {
    // Son dos personas distintas y el club las distingue por el teléfono. El único
    // vale para el socio, que tiene ficha.
    await inscribir({ nombre: 'Juan Pérez', telefono: '+56911112222' }).expect(
      201,
    );
    await inscribir({ nombre: 'Juan Pérez', telefono: '+56933334444' }).expect(
      201,
    );

    expect((await laClase()).cupoTomado).toBe(2);
  });

  it('**pasado el cupo, el servidor rechaza aunque la pantalla ofrezca inscribir**', async () => {
    await inscribir({ nombre: 'Primera', telefono: '+56911112222' }).expect(
      201,
    );
    await inscribir({ nombre: 'Segunda', telefono: '+56922223333' }).expect(
      201,
    );

    const respuesta = await inscribir({
      nombre: 'Tercera',
      telefono: '+56933334444',
    });

    expect(respuesta.status).toBe(409);
    expect((respuesta.body as { message: string }).message).toContain('cupo');
  });

  it('**dos inscripciones simultáneas al último cupo: entra una sola**', async () => {
    // El caso que este archivo existe para cerrar. Sin la fila de la clase tomada
    // como cerrojo, las dos cuentan un inscrito, las dos ven el lugar libre y las
    // dos entran: el profesor se entera con un alumno de más en la cancha.
    await inscribir({
      nombre: 'La que ya estaba',
      telefono: '+56911112222',
    }).expect(201);

    const [una, otra] = await Promise.all([
      inscribir({ nombre: 'Simultánea A', telefono: '+56922223333' }),
      inscribir({ nombre: 'Simultánea B', telefono: '+56933334444' }),
    ]);

    const estados = [una.status, otra.status].sort();
    expect(estados).toEqual([201, 409]);
    expect(
      await prisma.inscripcionClase.count({
        where: { claseId, estado: EstadoInscripcion.INSCRITA },
      }),
    ).toBe(2);
  });

  it('**cancelar una inscripción libera el cupo**', async () => {
    await inscribir({ nombre: 'Primera', telefono: '+56911112222' }).expect(
      201,
    );
    const segunda = await inscribir({
      nombre: 'Segunda',
      telefono: '+56922223333',
    }).expect(201);

    const id = (segunda.body as { id: number }).id;
    await request(app.getHttpServer())
      .post(`/api/admin/clases/${claseId}/inscripciones/${id}/cancelacion`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    expect((await laClase()).cupoTomado).toBe(1);
    await inscribir({ nombre: 'Tercera', telefono: '+56933334444' }).expect(
      201,
    );
  });

  it('**el socio que canceló puede volver a inscribirse**', async () => {
    // El único va sobre una columna que la base anula al cancelar; sobre
    // (clase, socio) a secas, el socio que se arrepiente queda fuera para siempre.
    const primera = await inscribir({ socioId }).expect(201);
    const id = (primera.body as { id: number }).id;

    await request(app.getHttpServer())
      .post(`/api/admin/clases/${claseId}/inscripciones/${id}/cancelacion`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    await inscribir({ socioId }).expect(201);
  });

  it('la cancelada queda en la lista, marcada, y no cuenta cupo', async () => {
    const primera = await inscribir({ socioId }).expect(201);
    const id = (primera.body as { id: number }).id;

    await request(app.getHttpServer())
      .post(`/api/admin/clases/${claseId}/inscripciones/${id}/cancelacion`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    const clase = await laClase();
    expect(clase.cupoTomado).toBe(0);
    expect(clase.inscritos).toHaveLength(1);
    expect(clase.inscritos[0].estado).toBe(EstadoInscripcion.CANCELADA);
  });

  it('**un socio moroso se inscribe igual: la clase no es una reserva**', async () => {
    // Deliberado, ver `SPEC-clases.md`. El club cobra las clases en el mesón y quien
    // paga un paquete de clases puede tener la cuota atrasada; rechazarlo acá sería
    // inventar una regla que el club no pidió, en la pantalla del profesor.
    await prisma.socio.update({
      where: { id: socioId },
      data: { alDiaHasta: new Date('2020-01-01T00:00:00.000Z') },
    });

    await inscribir({ socioId }).expect(201);
  });

  it('no se inscribe a una clase cancelada', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/clases/${claseId}/cancelacion`)
      .set('Cookie', cookieAdmin)
      .send({ motivo: 'Se suspendió' })
      .expect(200);

    await inscribir({ socioId }).expect(409);
  });

  it('un socio que no existe se rechaza con su mensaje', async () => {
    await inscribir({ socioId: 999999 }).expect(404);
  });

  /** T48: pasar lista, que es lo último que le pasa a una clase. */
  describe('Asistencia', () => {
    const cerrar = (cuerpo: Record<string, unknown> = {}) =>
      request(app.getHttpServer())
        .post(`/api/admin/clases/${claseId}/realizacion`)
        .set('Cookie', cookieAdmin)
        .send(cuerpo);

    it('**marcar quién vino deja a los demás como ausentes**', async () => {
      const vino = await inscribir({ socioId }).expect(201);
      await inscribir({ nombre: 'No vino', telefono: '+56911112222' }).expect(
        201,
      );

      await cerrar({ asistieron: [(vino.body as { id: number }).id] }).expect(
        200,
      );

      const clase = await laClase();
      expect(clase.inscritos[0].estado).toBe(EstadoInscripcion.ASISTIO);
      expect(clase.inscritos[1].estado).toBe(EstadoInscripcion.FALTO);
    });

    it('la clase queda realizada', async () => {
      await cerrar({ asistieron: [] }).expect(200);

      const guardada = await prisma.clase.findUniqueOrThrow({
        where: { id: claseId },
      });
      expect(guardada.estado).toBe(EstadoClase.REALIZADA);
    });

    it('**se puede cerrar sin pasar lista: la asistencia es un dato, no un trámite**', async () => {
      await inscribir({ socioId }).expect(201);

      await cerrar().expect(200);

      const clase = await laClase();
      expect(clase.inscritos[0].estado).toBe(EstadoInscripcion.INSCRITA);
      expect(clase.estado).toBe(EstadoClase.REALIZADA);
    });

    it('pasar lista vacía es decir que no vino nadie', async () => {
      await inscribir({ socioId }).expect(201);

      await cerrar({ asistieron: [] }).expect(200);

      expect((await laClase()).inscritos[0].estado).toBe(
        EstadoInscripcion.FALTO,
      );
    });

    it('**faltar a una clase no sanciona a nadie**', async () => {
      // La sanción es una regla de `reservas` sobre canchas que quedaron vacías; una
      // clase se da igual con cinco que con seis.
      await inscribir({ socioId }).expect(201);
      await cerrar({ asistieron: [] }).expect(200);

      const socio = await prisma.socio.findUniqueOrThrow({
        where: { id: socioId },
      });
      expect(socio.sancionadoHasta).toBeNull();
    });

    it('al que se bajó no se le pasa lista', async () => {
      const primera = await inscribir({ socioId }).expect(201);
      const id = (primera.body as { id: number }).id;
      await request(app.getHttpServer())
        .post(`/api/admin/clases/${claseId}/inscripciones/${id}/cancelacion`)
        .set('Cookie', cookieAdmin)
        .expect(200);

      await cerrar({ asistieron: [] }).expect(200);

      expect((await laClase()).inscritos[0].estado).toBe(
        EstadoInscripcion.CANCELADA,
      );
    });

    it('una clase ya cerrada no se cierra de nuevo', async () => {
      await cerrar().expect(200);

      await cerrar().expect(409);
    });

    it('**un inscrito de otra clase no se cuela en la lista**', async () => {
      const otra = await crearClase(4, '20:00');
      const ajena = await inscribir({ socioId }, otra).expect(201);

      await cerrar({ asistieron: [(ajena.body as { id: number }).id] }).expect(
        200,
      );

      const suya = await prisma.inscripcionClase.findUniqueOrThrow({
        where: { id: (ajena.body as { id: number }).id },
      });
      expect(suya.estado).toBe(EstadoInscripcion.INSCRITA);
    });
  });

  it('solo el admin inscribe y ve la lista', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/clases/${claseId}/inscripciones`)
      .set('Cookie', cookieSocio)
      .send({ socioId })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/admin/clases/${claseId}`)
      .expect(401);
  });
});
