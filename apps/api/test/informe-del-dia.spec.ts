import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  EstadoReserva,
  Superficie,
  TipoClase,
} from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T273. El informe del día: las reservas y las clases de una fecha, en orden de reloj,
 * como CSV que baja la agenda (A8, D5). El mismo servicio arma el correo de T275.
 */
describe('El informe del día (CSV de la agenda)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@informe-t273.test';
  const CANCHA = 'Cancha T273';
  const PROFESOR = 'Profe T273';
  const CONTRASENA = 'raqueta informada 73';
  const DIA = '2042-03-11';
  const cookies: Record<string, string> = {};

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const crearCuenta = async (
    quien: string,
    datos: { esAdmin?: boolean; esGestor?: boolean } = {},
  ) => {
    await prisma.usuario.create({
      data: {
        email: `${quien}${DOMINIO}`,
        nombre: quien,
        apellido: 'T273',
        passwordHash: await hashear(CONTRASENA),
        ...datos,
      },
    });
    const respuesta = await request(servidor())
      .post('/api/auth/login')
      .send({ email: `${quien}${DOMINIO}`, contrasena: CONTRASENA })
      .expect(204);
    cookies[quien] = (
      respuesta.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];
  };

  const pedir = (quien: string, fecha = DIA) =>
    request(servidor())
      .get('/api/admin/agenda.csv')
      .query({ fecha })
      .set('Cookie', cookies[quien]);

  /** Las líneas del CSV, sin el BOM. */
  const lineas = (texto: string) => texto.replace(/^\uFEFF/, '').split('\r\n');

  const limpiar = async () => {
    await prisma.cancha.deleteMany({ where: { nombre: CANCHA } });
    // La clase del gimnasio no tiene cancha: no se va con ella, y sin borrarla antes el
    // profesor no se puede borrar.
    await prisma.clase.deleteMany({
      where: { profesor: { nombreVisible: PROFESOR } },
    });
    await prisma.profesor.deleteMany({ where: { nombreVisible: PROFESOR } });
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

    await limpiar();
    await crearCuenta('admin', { esAdmin: true });
    await crearCuenta('gestora', { esGestor: true });
    await crearCuenta('socia');

    const { id: canchaId } = await prisma.cancha.create({
      data: { nombre: CANCHA, superficie: Superficie.CEMENTO },
    });
    const admin = await prisma.usuario.findUniqueOrThrow({
      where: { email: `admin${DOMINIO}` },
    });

    await prisma.reserva.create({
      data: {
        folio: 'T273001',
        canchaId,
        inicio: instanteEnElClub(DIA, '19:00'),
        fin: instanteEnElClub(DIA, '20:30'),
        estado: EstadoReserva.CONFIRMADA,
        nombre: 'Camila Visitante',
        email: `camila${DOMINIO}`,
        telefono: '+56911112222',
        acompanantes: { create: [{ nombre: 'Beto Rival' }] },
        observaciones: {
          create: [
            {
              texto: 'Llegó tarde',
              autorId: admin.id,
              autorNombre: 'admin T273',
            },
          ],
        },
      },
    });

    const profesor = await prisma.profesor.create({
      data: {
        nombreVisible: PROFESOR,
        telefono: '+56933334444',
        especialidad: 'Preparación física',
      },
    });
    await prisma.clase.create({
      data: {
        tipo: TipoClase.PREPARACION_FISICA,
        profesorId: profesor.id,
        canchaId: null,
        inicio: instanteEnElClub(DIA, '08:00'),
        fin: instanteEnElClub(DIA, '09:00'),
        cupoMaximo: 6,
      },
    });
  });

  afterAll(async () => {
    // La app se cierra aunque limpiar falle: abierta, Jest se queda esperando para siempre.
    try {
      await limpiar();
    } finally {
      await app.close();
    }
  });

  it('**baja las clases y las reservas del día, en orden de reloj**', async () => {
    const respuesta = await pedir('admin').expect(200);

    expect(respuesta.headers['content-type']).toContain('text/csv');
    expect(respuesta.headers['content-disposition']).toBe(
      `attachment; filename="agenda-${DIA}.csv"`,
    );
    // Excel en español: BOM para los acentos y punto y coma de separador.
    expect(respuesta.text).toMatch(/^\uFEFF/);
    expect(lineas(respuesta.text)).toEqual([
      'Inicio;Fin;Lugar;Tipo;Quién;Teléfono;Socio o visitante;Folio;Estado;Acompañantes;Observaciones',
      `08:00;09:00;Gimnasio;Clase de preparación física;${PROFESOR};;;;Programada;;`,
      // El teléfono con su apóstrofo: así Excel lo abre como texto y no como número.
      "19:00;20:30;Cancha T273;Reserva;Camila Visitante;'+56911112222;Visitante;T273001;Confirmada;Beto Rival;Llegó tarde (admin T273)",
    ]);
  });

  it('el gestor también lo baja; el socio no', async () => {
    await pedir('gestora').expect(200);
    await pedir('socia').expect(403);
  });

  it('un día sin nada baja solo el encabezado', async () => {
    const respuesta = await pedir('admin', '2042-03-12').expect(200);

    expect(lineas(respuesta.text)).toHaveLength(1);
  });

  it('una fecha ilegible es 400, no un archivo vacío', async () => {
    await pedir('admin', '11-03-2042').expect(400);
  });
});
