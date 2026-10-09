import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hoyEnElClub, instanteEnElClub } from '../src/comun/tiempo';
import { EnviadorCorreo } from '../src/identidad/correo';
import {
  EstadoClase,
  EstadoReserva,
  EstadoSocio,
  MotivoBloqueo,
  NivelClase,
  Superficie,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T46: agendar una clase cierra la cancha.
 *
 * **Es la razón de ser del módulo.** Hoy el club agenda cerrando la cancha a mano con
 * un bloqueo de motivo `CLASE`: funciona para que nadie reserve encima, pero el
 * sistema no sabe que ahí hay una clase, de quién ni con cuántos alumnos.
 *
 * Las dos mitades que no se pueden fallar: que la clase y su bloqueo sean **dos filas
 * o ninguna** —una clase con la cancha abierta es la clase a la que alguien reserva
 * encima— y que lo que estaba reservado debajo pase por la cascada de T36, con su
 * devolución y su aviso.
 */
describe('POST /api/admin/clases', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let canchaId: number;
  let profesorId: number;
  let cookieAdmin: string;
  let cookieSocio: string;

  const enviados: { para: string; asunto: string; cuerpo: string }[] = [];
  const correo = {
    enviar: (mensaje: { para: string; asunto: string; cuerpo: string }) => {
      enviados.push(mensaje);
      return Promise.resolve();
    },
  };

  const NOMBRE_CANCHA = 'Cancha de las clases';
  const DOMINIO = '@clases.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  /** Pasado mañana: lejos de la ventana de las 24 horas de reembolso. */
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
        apellido: 'De las clases',
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

  const bloques = async () => {
    const respuesta = await request(app.getHttpServer()).get(
      `/api/disponibilidad?cancha=${canchaId}&fecha=${enTresDias()}`,
    );

    return respuesta.body as {
      inicio: string;
      fin: string;
      bloqueado: boolean;
    }[];
  };

  /**
   * El instante en que empieza esa hora del club, como lo escribe la API.
   *
   * Se calcula con la misma función del servidor y no con un desfase escrito a mano:
   * Chile cambia de UTC-4 a UTC-3 en septiembre, y un test que asuma uno de los dos
   * pasa medio año.
   */
  const instante = (hora: string) =>
    instanteEnElClub(enTresDias(), hora).toISOString();

  const bloqueDe = (
    horas: { inicio: string; bloqueado: boolean }[],
    hora: string,
  ) => horas.find((b) => b.inicio === instante(hora));

  /** La clase, tal como la manda el panel: fecha y horas del club. */
  const clase = (
    horaDesde = '18:00',
    horaHasta = '19:00',
    extra: Record<string, unknown> = {},
  ) => ({
    canchaId,
    profesorId,
    fecha: enTresDias(),
    horaDesde,
    horaHasta,
    cupoMaximo: 6,
    nivel: NivelClase.INICIACION,
    ...extra,
  });

  interface ClaseAgendada {
    id: number;
    bloqueoId: number;
    canceladas: { folio: string; nombre: string }[];
  }

  const agendar = (cuerpo: Record<string, unknown> = clase()) =>
    request(app.getHttpServer())
      .post('/api/admin/clases')
      .set('Cookie', cookieAdmin)
      .send(cuerpo);

  const agendada = async (cuerpo = clase()) =>
    (await agendar(cuerpo).expect(201)).body as ClaseAgendada;

  /**
   * Una reserva de socio.
   *
   * De socio y no de visitante a propósito: la del visitante nace con un pago
   * abierto en la pasarela, y el cierre **se niega** a llevarse por delante una hora
   * que se está pagando —esa es la regla de T36—. Para probar la cascada hace falta
   * una hora tomada y quieta, que es la del socio.
   */
  const reservar = async (inicio: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/reservas')
      .set('Cookie', cookieSocio)
      .send({
        canchaId,
        inicio,
        acompanantes: [{ nombre: 'Invitada de la clase' }],
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
      where: { nombreVisible: { startsWith: 'Profe' } },
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
      where: { nombreVisible: { startsWith: 'Profe' } },
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
        nombreVisible: 'Profe Ana',
        telefono: '+56944444444',
        especialidad: 'Iniciación',
      },
      select: { id: true },
    });
    profesorId = profesor.id;

    const usuarioSocio = await crearCuenta('socia');
    await prisma.socio.create({
      data: {
        usuarioId: usuarioSocio,
        numeroSocio: `CLASE-${Date.now()}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2026-01-01'),
        alDiaHasta: new Date('2027-01-01'),
      },
    });

    await crearCuenta('jefe', true);
    cookieAdmin = await entrar('jefe');
    cookieSocio = await entrar('socia');

    enviados.length = 0;
  });

  it('**agendar crea la clase y el bloqueo que cierra la cancha**', async () => {
    const { id, bloqueoId } = await agendada();

    const guardada = await prisma.clase.findUniqueOrThrow({ where: { id } });
    expect(guardada.bloqueoId).toBe(bloqueoId);
    expect(guardada.estado).toBe(EstadoClase.PROGRAMADA);
    expect(guardada.cupoMaximo).toBe(6);

    const bloqueo = await prisma.bloqueo.findUniqueOrThrow({
      where: { id: bloqueoId },
    });
    expect(bloqueo.motivo).toBe(MotivoBloqueo.CLASE);
    expect(bloqueo.inicio).toEqual(guardada.inicio);
    expect(bloqueo.fin).toEqual(guardada.fin);
  });

  it('**unas notas de 500 caracteres, el tope, se guardan enteras, sin un 500**', async () => {
    // La validación acepta hasta 500; la columna tiene que aguantar lo mismo.
    const notas = 'ñ'.repeat(500);

    const { id } = await agendada(clase('18:00', '19:00', { notas }));

    const guardada = await prisma.clase.findUniqueOrThrow({ where: { id } });
    expect(guardada.notas).toBe(notas);
  });

  it('**la cancha desaparece de la disponibilidad en la consulta siguiente**', async () => {
    expect(bloqueDe(await bloques(), '18:00')?.bloqueado).toBe(false);

    await agendada();

    expect(bloqueDe(await bloques(), '18:00')?.bloqueado).toBe(true);
  });

  it('**si algo falla, no queda ni la clase ni el bloqueo**', async () => {
    // La razón de ser del módulo: una clase con la cancha abierta es la clase a la
    // que alguien reserva encima, y un bloqueo huérfano nadie sabe por qué está ahí.
    type ConCallback = (
      callback: (tx: PrismaService) => Promise<unknown>,
    ) => Promise<unknown>;

    const real = prisma.$transaction.bind(prisma) as ConCallback;
    const espia = jest
      .spyOn(prisma, '$transaction')
      .mockImplementationOnce(
        (callback: (tx: PrismaService) => Promise<unknown>) =>
          real(async (tx) => {
            await callback(tx);
            throw new Error('la base se cayó a mitad de agendar');
          }),
      );

    await agendar().expect(500);
    espia.mockRestore();

    expect(await prisma.clase.count({ where: { canchaId } })).toBe(0);
    expect(await prisma.bloqueo.count({ where: { canchaId } })).toBe(0);
  });

  it('la simulación dice qué horas se lleva por delante, sin escribir nada', async () => {
    await reservar(instante('18:00'));

    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/clases/simulacion')
      .set('Cookie', cookieAdmin)
      .send(clase())
      .expect(200);

    const cuerpo = respuesta.body as { afectadas: { esSocio: boolean }[] };
    expect(cuerpo.afectadas).toHaveLength(1);
    expect(cuerpo.afectadas[0].esSocio).toBe(true);

    expect(await prisma.clase.count({ where: { canchaId } })).toBe(0);
    expect(await prisma.bloqueo.count({ where: { canchaId } })).toBe(0);
  });

  it('**agendar sobre una hora reservada la cancela y le avisa a quien la tenía**', async () => {
    const reservaId = await reservar(instante('18:00'));
    // Su confirmación (T108) va a la misma casilla: lo que se busca es el aviso.
    enviados.length = 0;

    const { canceladas } = await agendada();

    expect(canceladas).toHaveLength(1);
    const reserva = await prisma.reserva.findUniqueOrThrow({
      where: { id: reservaId },
    });
    expect(reserva.estado).toBe(EstadoReserva.CANCELADA);

    const aviso = enviados.find((m) => m.para === `socia${DOMINIO}`);
    expect(aviso).toBeDefined();
    expect(aviso?.asunto).toContain('cancelada');
  });

  it('fuera del horario de la cancha no se agenda', async () => {
    // El club abre a las 08:00: una clase a las 07:00 no existe en la grilla.
    await agendar(clase('07:00', '08:00')).expect(404);
  });

  it('**sobre otro bloqueo no se agenda: la cancha ya estaba cerrada**', async () => {
    await agendada();

    // La segunda clase, en la misma hora, choca con el bloqueo de la primera.
    const respuesta = await agendar();

    expect(respuesta.status).toBe(409);
    expect(await prisma.clase.count({ where: { canchaId } })).toBe(1);
  });

  it('**un profesor desactivado no puede tomar clases nuevas**', async () => {
    await prisma.profesor.update({
      where: { id: profesorId },
      data: { activo: false },
    });

    await agendar().expect(409);
  });

  it('el rango tiene que calzar con la grilla, no con cualquier minuto', async () => {
    await agendar(clase('18:20', '19:20')).expect(404);
  });

  it('**cancelar la clase devuelve la hora a la disponibilidad**', async () => {
    const { id, bloqueoId } = await agendada();

    await request(app.getHttpServer())
      .post(`/api/admin/clases/${id}/cancelacion`)
      .set('Cookie', cookieAdmin)
      .send({ motivo: 'Se enfermó la profesora' })
      .expect(200);

    const cancelada = await prisma.clase.findUniqueOrThrow({ where: { id } });
    expect(cancelada.estado).toBe(EstadoClase.CANCELADA);
    expect(cancelada.motivoCancelacion).toContain('enfermó');
    // El bloqueo se va: si no, la cancha sigue cerrada por una clase que no existe.
    expect(await prisma.bloqueo.count({ where: { id: bloqueoId } })).toBe(0);
    expect(cancelada.bloqueoId).toBeNull();

    expect(bloqueDe(await bloques(), '18:00')?.bloqueado).toBe(false);
  });

  it('**un motivo de 200 caracteres se recorta al largo de la columna, sin un 500**', async () => {
    // El panel lo pide con `window.prompt`, que no tiene tope.
    const { id } = await agendada();

    await request(app.getHttpServer())
      .post(`/api/admin/clases/${id}/cancelacion`)
      .set('Cookie', cookieAdmin)
      .send({ motivo: 'ñ'.repeat(200) })
      .expect(200);

    const cancelada = await prisma.clase.findUniqueOrThrow({ where: { id } });
    expect(cancelada.motivoCancelacion).toBe('ñ'.repeat(191));
  });

  it('**las reservas que la clase canceló no vuelven al cancelarse la clase**', async () => {
    // Deshacerlas sería devolverle a alguien una hora que ya reorganizó, y en el
    // camino tendría que volver a cobrarle. El club llama si quiere devolvérsela.
    const reservaId = await reservar(instante('18:00'));
    const { id } = await agendada();

    await request(app.getHttpServer())
      .post(`/api/admin/clases/${id}/cancelacion`)
      .set('Cookie', cookieAdmin)
      .send({ motivo: 'Se suspendió' })
      .expect(200);

    const reserva = await prisma.reserva.findUniqueOrThrow({
      where: { id: reservaId },
    });
    expect(reserva.estado).toBe(EstadoReserva.CANCELADA);
  });

  it('cancelar dos veces la misma clase no borra el bloqueo de otra', async () => {
    // El bloqueo a borrar se lee dentro de la transacción: leerlo antes deja una
    // ventana en la que la clase se movió y se borra un bloqueo que ya no es suyo.
    const { id } = await agendada();

    const cancelacion = () =>
      request(app.getHttpServer())
        .post(`/api/admin/clases/${id}/cancelacion`)
        .set('Cookie', cookieAdmin)
        .send({ motivo: 'Se suspendió' });

    await cancelacion().expect(200);
    await cancelacion().expect(409);
  });

  it('**mover la clase conserva su id y cambia el bloqueo de lugar**', async () => {
    const { id, bloqueoId } = await agendada();

    const respuesta = await request(app.getHttpServer())
      .patch(`/api/admin/clases/${id}`)
      .set('Cookie', cookieAdmin)
      .send({ fecha: enTresDias(), horaDesde: '20:00', horaHasta: '21:00' })
      .expect(200);

    expect((respuesta.body as { id: number }).id).toBe(id);

    const movida = await prisma.clase.findUniqueOrThrow({ where: { id } });
    expect(movida.bloqueoId).not.toBe(bloqueoId);
    // El bloqueo viejo se va con la hora vieja, o la cancha queda cerrada dos veces.
    expect(await prisma.bloqueo.count({ where: { id: bloqueoId } })).toBe(0);

    const horas = await bloques();
    expect(bloqueDe(horas, '18:00')?.bloqueado).toBe(false);
    expect(bloqueDe(horas, '20:00')?.bloqueado).toBe(true);
  });

  it('la agenda del día trae las clases con su profesor y su cancha', async () => {
    await agendada();

    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/clases?fecha=${enTresDias()}`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    const clases = respuesta.body as {
      profesor: string;
      cancha: string;
      nivel: string;
    }[];
    expect(clases).toHaveLength(1);
    expect(clases[0].profesor).toBe('Profe Ana');
    expect(clases[0].cancha).toBe(NOMBRE_CANCHA);
  });

  it('la clase cancelada no sigue apareciendo en la agenda del día', async () => {
    const { id } = await agendada();

    await request(app.getHttpServer())
      .post(`/api/admin/clases/${id}/cancelacion`)
      .set('Cookie', cookieAdmin)
      .send({ motivo: 'Se suspendió' })
      .expect(200);

    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/clases?fecha=${enTresDias()}`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    expect(respuesta.body).toHaveLength(0);
  });

  it('solo el admin agenda clases', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/clases')
      .set('Cookie', cookieSocio)
      .send(clase())
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/admin/clases?fecha=${enTresDias()}`)
      .expect(401);
  });
});
