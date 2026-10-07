import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { IntentosFallidos } from '../src/identidad/intentos';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T38: quién quiere asociarse, y el resto de los que escriben al club.
 *
 * La problemática 2.5 del perfil: el club **no tiene dónde mandar a un interesado**.
 * No hay sitio, no hay formulario, y quien quiere asociarse tiene que conseguir el
 * teléfono de alguien.
 *
 * Es una bandeja y no un `mailto:` por una razón medible: el club necesita saber
 * cuántos interesados llegan y cuántos terminan siendo socios. Un correo no se
 * cuenta, y el que nadie contestó no se distingue del que no llegó. Por eso el test
 * que más importa acá es el del **circuito completo**: interesado → invitación.
 */
describe('POST /api/contacto y la bandeja del club', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let envios: IntentosFallidos;
  let cookieAdmin: string;
  let cookieSocio: string;

  const DOMINIO = '@contacto.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  const unaSolicitud = (extra: Record<string, unknown> = {}) => ({
    tipo: 'SOCIO',
    nombre: 'Ana Interesada',
    email: `ana${DOMINIO}`,
    telefono: '+56911112222',
    mensaje: '¿Cuánto sale la mensualidad?',
    ...extra,
  });

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'Del contacto',
      });

    await prisma.usuario.update({
      where: { email: `${sufijo}${DOMINIO}` },
      data: { esAdmin },
    });
  };

  const entrar = async (sufijo: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA });

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  const bandeja = async (consulta = '') => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/solicitudes${consulta}`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as {
      id: number;
      tipo: string;
      nombre: string;
      estado: string;
      invitacionId: number | null;
    }[];
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
    envios = app.get(IntentosFallidos);
  });

  afterAll(async () => {
    await prisma.solicitudContacto.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.invitacionSocio.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    // El freno vive en memoria y la comparte toda la suite: sin esto, el primer test
    // que manda cinco solicitudes deja bloqueados a los siguientes. Las cuatro formas
    // en que Express puede reportar el localhost, porque depende de la pila de red.
    for (const ip of ['::ffff:127.0.0.1', '127.0.0.1', '::1', 'sin-ip']) {
      envios.perdonar(`contacto|${ip}`);
    }

    await prisma.solicitudContacto.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.invitacionSocio.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    await crearCuenta('jefe', true);
    await crearCuenta('socia');
    cookieAdmin = await entrar('jefe');
    cookieSocio = await entrar('socia');
  });

  it('**cualquiera manda una solicitud, sin cuenta**', async () => {
    // Pedir registro para preguntar cómo asociarse es la barrera que esto viene a
    // sacar: quien pregunta todavía no es nadie del club.
    await request(app.getHttpServer())
      .post('/api/contacto')
      .send(unaSolicitud())
      .expect(201);

    const [solicitud] = await bandeja();

    expect(solicitud).toMatchObject({
      tipo: 'SOCIO',
      nombre: 'Ana Interesada',
      estado: 'NUEVA',
    });
  });

  it('los cuatro tipos entran, y un tipo inventado no', async () => {
    for (const tipo of ['SOCIO', 'CLASES', 'EMPRESA', 'OTRO']) {
      await request(app.getHttpServer())
        .post('/api/contacto')
        .send(unaSolicitud({ tipo, email: `${tipo.toLowerCase()}${DOMINIO}` }))
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/api/contacto')
      .send(unaSolicitud({ tipo: 'PATROCINIO' }))
      .expect(400);

    expect(await bandeja()).toHaveLength(4);
  });

  it('sin nombre o sin forma de contestar, se rechaza', async () => {
    // Una solicitud sin correo ni teléfono es una que el club no puede contestar, y
    // ocupa la bandeja como si se pudiera.
    await request(app.getHttpServer())
      .post('/api/contacto')
      .send(unaSolicitud({ nombre: '   ' }))
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/contacto')
      .send(unaSolicitud({ email: '', telefono: '' }))
      .expect(400);
  });

  it('un correo mal escrito se rechaza', async () => {
    await request(app.getHttpServer())
      .post('/api/contacto')
      .send(unaSolicitud({ email: 'no-es-un-correo' }))
      .expect(400);
  });

  it('**al sexto envío seguido responde 429**', async () => {
    // Un formulario público sin freno es un buzón de publicidad en una semana.
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/contacto')
        .send(unaSolicitud({ email: `insistente${i}${DOMINIO}` }))
        .expect(201);
    }

    const sexta = await request(app.getHttpServer())
      .post('/api/contacto')
      .send(unaSolicitud({ email: `insistente5${DOMINIO}` }))
      .expect(429);

    expect((sexta.body as { message: string }).message).toMatch(/minutos/);
  });

  it('atender una solicitud deja quién y cuándo', async () => {
    await request(app.getHttpServer())
      .post('/api/contacto')
      .send(unaSolicitud())
      .expect(201);
    const [solicitud] = await bandeja();

    await request(app.getHttpServer())
      .patch(`/api/admin/solicitudes/${solicitud.id}`)
      .set('Cookie', cookieAdmin)
      .send({ estado: 'ATENDIDA', nota: 'La llamé, viene el sábado' })
      .expect(200);

    const guardada = await prisma.solicitudContacto.findUniqueOrThrow({
      where: { id: solicitud.id },
    });

    expect(guardada.estado).toBe('ATENDIDA');
    expect(guardada.nota).toBe('La llamé, viene el sábado');
    expect(guardada.atendidaEn).not.toBeNull();
    expect(guardada.atendidaPor).not.toBeNull();
  });

  it('**atender una de tipo SOCIO crea la invitación, y quedan enlazadas**', async () => {
    // El circuito que justifica la tabla: interesado → invitación → cuenta → socio. Sin
    // el enlace, el club no puede contar cuántos interesados terminaron adentro, que
    // es la única forma de saber si el sitio sirvió para algo.
    await request(app.getHttpServer())
      .post('/api/contacto')
      .send(unaSolicitud())
      .expect(201);
    const [solicitud] = await bandeja();

    const respuesta = await request(app.getHttpServer())
      .post(`/api/admin/solicitudes/${solicitud.id}/invitacion`)
      .set('Cookie', cookieAdmin)
      .send({ numeroSocio: 'CON-001' })
      .expect(201);

    const invitacion = respuesta.body as { id: number; email: string };
    expect(invitacion.email).toBe(`ana${DOMINIO}`);

    const guardada = await prisma.solicitudContacto.findUniqueOrThrow({
      where: { id: solicitud.id },
    });

    expect(guardada.invitacionId).toBe(invitacion.id);
    expect(guardada.estado).toBe('ATENDIDA');
  });

  it('**si ya la habían invitado antes, la solicitud se enlaza igual**', async () => {
    // Pasa de verdad y de dos formas: el club la invitó desde la pantalla de socios y
    // después ve su consulta en la bandeja, o un intento anterior creó la invitación y
    // se cayó antes de enlazarla. Sin esto la solicitud queda atascada para siempre
    // —invitar responde 409 por el correo único— y esa conversión no se cuenta nunca.
    await request(app.getHttpServer())
      .post('/api/contacto')
      .send(unaSolicitud())
      .expect(201);
    const [solicitud] = await bandeja();

    const yaInvitada = await request(app.getHttpServer())
      .post('/api/admin/socios/invitaciones')
      .set('Cookie', cookieAdmin)
      .send({ email: `ana${DOMINIO}` })
      .expect(201);

    const respuesta = await request(app.getHttpServer())
      .post(`/api/admin/solicitudes/${solicitud.id}/invitacion`)
      .set('Cookie', cookieAdmin)
      .send({})
      .expect(201);

    // La misma invitación, no una segunda.
    expect((respuesta.body as { id: number }).id).toBe(
      (yaInvitada.body as { id: number }).id,
    );

    const guardada = await prisma.solicitudContacto.findUniqueOrThrow({
      where: { id: solicitud.id },
    });
    expect(guardada.invitacionId).toBe((yaInvitada.body as { id: number }).id);
  });

  it('solo las de tipo SOCIO se convierten en invitación', async () => {
    // Invitar como socio a quien preguntó por clases para su hijo es meter en el
    // padrón a alguien que no lo pidió.
    await request(app.getHttpServer())
      .post('/api/contacto')
      .send(unaSolicitud({ tipo: 'CLASES' }))
      .expect(201);
    const [solicitud] = await bandeja();

    await request(app.getHttpServer())
      .post(`/api/admin/solicitudes/${solicitud.id}/invitacion`)
      .set('Cookie', cookieAdmin)
      .send({})
      .expect(409);
  });

  it('la bandeja se filtra por estado y por tipo', async () => {
    await request(app.getHttpServer())
      .post('/api/contacto')
      .send(unaSolicitud())
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/contacto')
      .send(unaSolicitud({ tipo: 'EMPRESA', email: `empresa${DOMINIO}` }))
      .expect(201);

    expect(await bandeja('?tipo=EMPRESA')).toHaveLength(1);
    expect(await bandeja('?estado=NUEVA')).toHaveLength(2);
    expect(await bandeja('?estado=ATENDIDA')).toHaveLength(0);
  });

  it('**lo que llega no se expone en público**', async () => {
    // Son datos de contacto de terceros que escribieron al club, no un directorio.
    await request(app.getHttpServer())
      .post('/api/contacto')
      .send(unaSolicitud())
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/admin/solicitudes')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/admin/solicitudes')
      .set('Cookie', cookieSocio)
      .expect(403);
  });
});
