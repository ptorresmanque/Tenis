import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hoyEnElClub } from '../src/comun/tiempo';
import { EnviadorCorreo } from '../src/identidad/correo';
import {
  EstadoSocio,
  NivelClase,
  Superficie,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T48: lo que ve de las clases quien todavía no es del club.
 *
 * **Es el circuito del apoderado que busca clases para su hijo**, el único de los
 * cinco públicos del perfil que no tenía ninguna vía de contacto: ve los horarios,
 * pregunta por el formulario, y alguien lo llama.
 *
 * Lo que este archivo cuida por encima de todo: que **no se filtre quién va a clases**.
 * La lista de inscritos es dato de las personas que van, y publicarla no le sirve a
 * nadie más.
 */
describe('GET /api/clases/publicas', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let canchaId: number;
  let profesorId: number;
  let cookieAdmin: string;

  const correo = { enviar: () => Promise.resolve() };

  const NOMBRE_CANCHA = 'Cancha de las clases públicas';
  const DOMINIO = '@publicas.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const ALUMNO = 'Benjamín Que No Se Publica';

  const enDias = (dias: number) =>
    new Date(hoyEnElClub().getTime() + dias * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'Pública',
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

  interface Publicas {
    profesores: {
      nombreVisible: string;
      especialidad: string;
      tarifaHoraClp?: number;
      telefono?: string;
    }[];
    clases: {
      id: number;
      cancha: string;
      profesor: string;
      inicio: string;
      fin: string;
      nivel: string;
      cuposLibres: number;
    }[];
  }

  const publicas = async (desde?: string) => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/clases/publicas${desde ? `?desde=${desde}` : ''}`)
      .expect(200);

    return respuesta.body as Publicas;
  };

  /** Una clase agendada por el camino normal: crea su bloqueo y todo. */
  const agendar = async (dias: number, hora = '18:00', cupoMaximo = 6) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/clases')
      .set('Cookie', cookieAdmin)
      .send({
        canchaId,
        profesorId,
        fecha: enDias(dias),
        horaDesde: hora,
        horaHasta: hora === '18:00' ? '19:00' : '21:00',
        cupoMaximo,
        nivel: NivelClase.NINOS,
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
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await prisma.profesor.deleteMany({
      where: { nombreVisible: { startsWith: 'Profe pública' } },
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
      where: { nombreVisible: { startsWith: 'Profe pública' } },
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
        nombreVisible: 'Profe pública Ana',
        telefono: '+56944444444',
        especialidad: 'Niños',
        tarifaHoraClp: 18000,
      },
      select: { id: true },
    });
    profesorId = profesor.id;

    await crearCuenta('jefe', true);
    cookieAdmin = await entrar('jefe');
  });

  it('**sin cuenta se ven los horarios de la semana**', async () => {
    // Sin cookie: es el apoderado que llegó al sitio y todavía no habló con nadie.
    await agendar(2);

    const cuerpo = await publicas();
    const suya = cuerpo.clases.filter((c) => c.cancha === NOMBRE_CANCHA);

    expect(suya).toHaveLength(1);
    expect(suya[0].profesor).toBe('Profe pública Ana');
    expect(suya[0].nivel).toBe(NivelClase.NINOS);
  });

  it('**la respuesta no trae ningún nombre de alumno**', async () => {
    // Quién va a clases es dato de las personas que van. Se comprueba sobre el JSON
    // entero y no campo por campo: un campo nuevo que lo filtre entra sin que nadie
    // se acuerde de actualizar este test.
    const claseId = await agendar(2);
    const usuarioId = await crearCuenta('socia');
    const socio = await prisma.socio.create({
      data: {
        usuarioId,
        numeroSocio: `PUB-${Date.now()}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2020-01-01T00:00:00.000Z'),
        alDiaHasta: new Date('2027-01-01T00:00:00.000Z'),
      },
      select: { id: true },
    });

    await request(app.getHttpServer())
      .post(`/api/admin/clases/${claseId}/inscripciones`)
      .set('Cookie', cookieAdmin)
      .send({ socioId: socio.id })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/admin/clases/${claseId}/inscripciones`)
      .set('Cookie', cookieAdmin)
      .send({ nombre: ALUMNO, telefono: '+56977778888' })
      .expect(201);

    const crudo = JSON.stringify(await publicas());

    expect(crudo).not.toContain(ALUMNO);
    expect(crudo).not.toContain('Persona socia');
    expect(crudo).not.toContain('inscritos');
  });

  it('dice cuántos cupos quedan, que es lo que el apoderado pregunta', async () => {
    const claseId = await agendar(2, '18:00', 4);
    await request(app.getHttpServer())
      .post(`/api/admin/clases/${claseId}/inscripciones`)
      .set('Cookie', cookieAdmin)
      .send({ nombre: ALUMNO, telefono: '+56977778888' })
      .expect(201);

    const clase = (await publicas()).clases.find((c) => c.id === claseId);

    expect(clase?.cuposLibres).toBe(3);
  });

  it('**del profesor se publica lo que el club anuncia, no lo que le paga**', async () => {
    const cuerpo = await publicas();
    const suyo = cuerpo.profesores.find(
      (p) => p.nombreVisible === 'Profe pública Ana',
    );

    expect(suyo?.especialidad).toBe('Niños');
    expect(suyo?.tarifaHoraClp).toBeUndefined();
    // Tampoco el teléfono: para eso está el formulario de contacto del club.
    expect(suyo?.telefono).toBeUndefined();
  });

  it('el profesor desactivado no se anuncia', async () => {
    await prisma.profesor.update({
      where: { id: profesorId },
      data: { activo: false },
    });

    const cuerpo = await publicas();

    expect(
      cuerpo.profesores.some((p) => p.nombreVisible === 'Profe pública Ana'),
    ).toBe(false);
  });

  it('la clase cancelada no se anuncia', async () => {
    const claseId = await agendar(2);
    await request(app.getHttpServer())
      .post(`/api/admin/clases/${claseId}/cancelacion`)
      .set('Cookie', cookieAdmin)
      .send({ motivo: 'Se suspendió' })
      .expect(200);

    expect((await publicas()).clases.some((c) => c.id === claseId)).toBe(false);
  });

  it('**la semana es una semana: lo de dentro de un mes no aparece**', async () => {
    const cerca = await agendar(2);
    const lejos = await agendar(30);

    const ids = (await publicas()).clases.map((c) => c.id);

    expect(ids).toContain(cerca);
    expect(ids).not.toContain(lejos);
  });

  it('se puede mirar otra semana, para el que planifica', async () => {
    const lejos = await agendar(30);

    const ids = (await publicas(enDias(29))).clases.map((c) => c.id);

    expect(ids).toContain(lejos);
  });

  it('las clases vienen en orden de reloj, no como salgan de la base', async () => {
    await agendar(3, '20:00');
    await agendar(2, '18:00');

    const suyas = (await publicas()).clases.filter(
      (c) => c.cancha === NOMBRE_CANCHA,
    );

    expect(suyas[0].inicio < suyas[1].inicio).toBe(true);
  });
});
