import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { instanteEnElClub } from '../src/comun/tiempo';
import {
  EstadoReporte,
  EstadoReserva,
  EstadoSolicitud,
  Superficie,
  TipoSolicitud,
} from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T287 (SPEC-panel.md A10). Lo que espera al admin: las horas reportadas sin revisar y las
 * consultas sin atender. Lo leen el badge de «Por revisar» y, desde T301, el menú.
 *
 * Los números se miden como diferencia: en la base de prueba hay datos de otras suites.
 */
describe('Lo que espera al admin (pendientes)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@pendientes-t287.test';
  const CANCHA = 'Cancha T287';
  const CONTRASENA = 'raqueta pendiente 87';
  const DIA = '2042-04-02';
  const cookies: Record<string, string> = {};

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const crearCuenta = async (quien: string, datos: object = {}) => {
    const usuario = await prisma.usuario.create({
      data: {
        email: `${quien}${DOMINIO}`,
        nombre: quien,
        apellido: 'T287',
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
    return usuario;
  };

  const pedir = (quien?: string) => {
    const peticion = request(servidor()).get('/api/admin/pendientes');
    return quien ? peticion.set('Cookie', cookies[quien]) : peticion;
  };

  const limpiar = async () => {
    await prisma.cancha.deleteMany({ where: { nombre: CANCHA } });
    await prisma.solicitudContacto.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await prisma.profesor.deleteMany({
      where: { usuario: { email: { endsWith: DOMINIO } } },
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

    await limpiar();
    await crearCuenta('admin', { esAdmin: true });
    await crearCuenta('gestora', { esGestor: true });
    const profe = await crearCuenta('profe');
    await prisma.profesor.create({
      data: {
        usuarioId: profe.id,
        nombreVisible: 'Profe T287',
        telefono: '+56900000000',
        especialidad: 'Tenis',
      },
    });
  });

  afterAll(async () => {
    try {
      await limpiar();
    } finally {
      await app.close();
    }
  });

  it('**cuenta las horas por revisar una vez cada una, y las consultas nuevas**', async () => {
    const antes = (await pedir('admin').expect(200)).body as {
      horasPorRevisar: number;
      consultasSinAtender: number;
    };

    // Dos socios que reportan; una hora con dos reportes pendientes y otra ya resuelta.
    const socios = await Promise.all(
      ['ana', 'beto'].map(async (quien, i) =>
        prisma.socio.create({
          data: {
            numeroSocio: `T287-${i}`,
            fechaIngreso: new Date('2040-01-01'),
            alDiaHasta: new Date('2042-12-31'),
            usuario: {
              create: {
                email: `${quien}${DOMINIO}`,
                nombre: quien,
                apellido: 'T287',
              },
            },
          },
        }),
      ),
    );
    const { id: canchaId } = await prisma.cancha.create({
      data: { nombre: CANCHA, superficie: Superficie.CEMENTO },
    });
    const reserva = (folio: string, hora: string) =>
      prisma.reserva.create({
        data: {
          folio,
          canchaId,
          inicio: instanteEnElClub(DIA, hora),
          fin: instanteEnElClub(DIA, `${Number(hora.slice(0, 2)) + 1}:00`),
          estado: EstadoReserva.CONFIRMADA,
          nombre: 'Camila Visitante',
          email: `camila${DOMINIO}`,
          telefono: '+56911112222',
        },
      });
    const conDos = await reserva('T287001', '10:00');
    const resuelta = await reserva('T287002', '12:00');
    await prisma.reporteNoUso.createMany({
      data: [
        { reservaId: conDos.id, reportanteSocioId: socios[0].id },
        { reservaId: conDos.id, reportanteSocioId: socios[1].id },
        {
          reservaId: resuelta.id,
          reportanteSocioId: socios[0].id,
          estado: EstadoReporte.SANCIONADO,
        },
      ],
    });
    await prisma.solicitudContacto.createMany({
      data: ['nueva-1', 'nueva-2', 'atendida'].map((quien) => ({
        tipo: TipoSolicitud.SOCIO,
        nombre: quien,
        email: `${quien}${DOMINIO}`,
        telefono: '+56911112222',
        estado:
          quien === 'atendida'
            ? EstadoSolicitud.ATENDIDA
            : EstadoSolicitud.NUEVA,
      })),
    });

    const despues = (await pedir('admin').expect(200)).body as typeof antes;

    expect(despues.horasPorRevisar - antes.horasPorRevisar).toBe(1);
    expect(despues.consultasSinAtender - antes.consultasSinAtender).toBe(2);
  });

  it('solo el admin: el gestor y el profesor reciben 403, y sin sesión 401', async () => {
    await pedir('gestora').expect(403);
    await pedir('profe').expect(403);
    await pedir().expect(401);
  });
});
