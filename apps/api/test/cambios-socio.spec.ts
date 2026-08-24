import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoSocio } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T37: el padrón deja rastro de quién cambió qué.
 *
 * La problemática 2.4 del perfil: la nómina vivía en una planilla donde el estado,
 * la vigencia de la cuota y las altas y bajas se corregían a mano **sin constancia
 * de quién hizo el cambio ni cuándo**.
 *
 * Dos mitades. La primera es que el club pueda editar la ficha desde el panel, que
 * hasta hoy no podía —había que escribir en la base—; la segunda, que cada cambio
 * que toca derechos quede escrito con nombre y hora.
 *
 * Lo que este archivo fija con más cuidado es **el límite**: se auditan los cuatro
 * campos que cambian lo que el socio puede hacer, y ninguno más. Un registro de todo
 * es un registro que nadie mira.
 */
describe('PATCH /api/admin/socios/:id y su historial', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let socioId: number;
  let adminId: number;
  let cookieAdmin: string;
  let cookieSocio: string;

  const DOMINIO = '@padron.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'Del padrón',
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

  const editar = (cambios: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/admin/socios/${socioId}`)
      .set('Cookie', cookieAdmin)
      .send(cambios);

  const historial = async () => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/admin/socios/${socioId}/cambios`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    return respuesta.body as {
      campo: string;
      valorAnterior: string;
      valorNuevo: string;
      hechoPorNombre: string;
      motivo: string | null;
    }[];
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
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    const usuarioSocio = await crearCuenta('socia');
    const socio = await prisma.socio.create({
      data: {
        usuarioId: usuarioSocio,
        numeroSocio: `PAD-${Date.now()}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2026-01-01'),
        alDiaHasta: new Date('2026-08-31'),
      },
      select: { id: true },
    });
    socioId = socio.id;

    adminId = await crearCuenta('jefe', true);
    cookieAdmin = await entrar('jefe');
    cookieSocio = await entrar('socia');

    await prisma.cambioSocio.deleteMany({ where: { socioId } });
  });

  it('**suspender a un socio deja escrito quién, cuándo y los dos valores**', async () => {
    await editar({
      estado: 'SUSPENDIDO',
      motivo: 'Cuota impaga desde junio',
    }).expect(200);

    const renglones = await historial();

    expect(renglones).toHaveLength(1);
    expect(renglones[0]).toMatchObject({
      campo: 'estado',
      valorAnterior: 'ACTIVO',
      valorNuevo: 'SUSPENDIDO',
      hechoPorNombre: 'Persona jefe Del padrón',
      motivo: 'Cuota impaga desde junio',
    });
  });

  it('el cambio se aplica de verdad, no solo se anota', async () => {
    await editar({ estado: 'SUSPENDIDO' }).expect(200);

    const socio = await prisma.socio.findUniqueOrThrow({
      where: { id: socioId },
    });
    expect(socio.estado).toBe(EstadoSocio.SUSPENDIDO);
  });

  it('cambiar dos campos a la vez deja un renglón por campo', async () => {
    // Un renglón por campo y no una foto de la ficha: lo que se pregunta seis meses
    // después es "quién le cambió el estado", y eso se responde leyendo una lista.
    await editar({ estado: 'SUSPENDIDO', alDiaHasta: '2026-12-31' }).expect(
      200,
    );

    const renglones = await historial();

    expect(renglones).toHaveLength(2);
    expect(renglones.map((r) => r.campo).sort()).toEqual([
      'alDiaHasta',
      'estado',
    ]);
  });

  it('**mandar el mismo valor no deja renglón**', async () => {
    // Guardar sin cambiar nada es lo que hace cualquiera que abre un formulario y
    // aprieta guardar. Un historial lleno de renglones que no cambian nada es un
    // historial que nadie lee.
    await editar({ estado: 'ACTIVO' }).expect(200);

    expect(await historial()).toHaveLength(0);
  });

  it('**el teléfono no se audita, y ese es el límite**', async () => {
    // Que alguien haya suspendido a un socio es una decisión que el club puede tener
    // que explicar; que le hayan corregido un dígito al teléfono, no.
    await editar({ telefono: '+56999999999', estado: 'SUSPENDIDO' }).expect(
      200,
    );

    const renglones = await historial();

    expect(renglones).toHaveLength(1);
    expect(renglones[0].campo).toBe('estado');
  });

  it('levantar una sanción a mano también queda escrito', async () => {
    await prisma.socio.update({
      where: { id: socioId },
      data: { sancionadoHasta: new Date('2026-09-15T00:00:00.000Z') },
    });

    await editar({
      sancionadoHasta: null,
      motivo: 'Reclamó y tenía razón',
    }).expect(200);

    const renglones = await historial();
    expect(renglones[0]).toMatchObject({
      campo: 'sancionadoHasta',
      valorAnterior: '2026-09-15',
      valorNuevo: '',
      motivo: 'Reclamó y tenía razón',
    });
  });

  it('el historial sobrevive al socio: no cae en cascada', async () => {
    // El historial de decisiones sobrevive a la ficha. Si se fuera con ella, la
    // pregunta "quién dio de baja a esta persona" no tendría respuesta justo cuando
    // alguien la hace.
    await editar({ estado: 'SUSPENDIDO' }).expect(200);

    await prisma.socio.delete({ where: { id: socioId } });

    const renglones = await prisma.cambioSocio.findMany({ where: { socioId } });
    expect(renglones).toHaveLength(1);
  });

  it('un número de socio repetido se rechaza y no deja renglón', async () => {
    const otro = await crearCuenta('otra');
    const suyo = await prisma.socio.create({
      data: {
        usuarioId: otro,
        numeroSocio: `PAD-OTRO-${Date.now()}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2026-01-01'),
        alDiaHasta: new Date('2026-08-31'),
      },
      select: { numeroSocio: true },
    });

    await editar({ numeroSocio: suyo.numeroSocio }).expect(409);

    expect(await historial()).toHaveLength(0);
  });

  it('un estado que no existe se rechaza', async () => {
    await editar({ estado: 'JUBILADO' }).expect(400);
  });

  it('solo el admin edita el padrón y lee el historial', async () => {
    await request(app.getHttpServer())
      .patch(`/api/admin/socios/${socioId}`)
      .set('Cookie', cookieSocio)
      .send({ estado: 'ACTIVO' })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/admin/socios/${socioId}/cambios`)
      .expect(401);

    expect(adminId).toBeGreaterThan(0);
  });
});
