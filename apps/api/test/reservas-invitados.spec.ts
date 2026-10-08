import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  EstadoReserva,
  EstadoSocio,
  Superficie,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T106. GET /api/reservas/mis-invitados: los invitados que el socio declaró en sus
 * reservas, para sugerírselos la próxima vez.
 *
 * La normalización está probada en `invitados.spec.ts`. Acá va lo que solo se ve contra
 * la base: **de quién son los invitados**. Los nombres que declaró otro socio son datos de
 * terceros, y esta lista no puede ser la puerta para leerlos.
 */
describe('GET /api/reservas/mis-invitados', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let canchaId: number;

  const NOMBRE_CANCHA = 'Cancha T106';
  const DOMINIO = '@t106.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const crearCuenta = async (sufijo: string, conFichaDeSocio = true) => {
    await request(servidor())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'De prueba',
      });

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email: `${sufijo}${DOMINIO}` },
      select: { id: true },
    });

    const socio = conFichaDeSocio
      ? await prisma.socio.create({
          data: {
            usuarioId: usuario.id,
            numeroSocio: `T106-${sufijo}`,
            estado: EstadoSocio.ACTIVO,
            fechaIngreso: new Date('2026-01-01'),
            alDiaHasta: new Date('2027-01-01'),
          },
          select: { id: true },
        })
      : null;

    const login = await request(servidor())
      .post('/api/auth/login')
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA });

    return {
      socioId: socio?.id ?? null,
      cookie: (login.headers['set-cookie'] as unknown as string[])[0],
    };
  };

  /** Una reserva por día, para que dos no choquen en la misma cancha y hora. */
  let dia = 0;
  const reservaCon = (
    socioId: number,
    acompanantes: { nombre?: string; socioId?: number }[],
  ) => {
    dia++;
    return prisma.reserva.create({
      data: {
        folio: `I${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        canchaId,
        inicio: new Date(
          `2030-01-${String(dia).padStart(2, '0')}T12:00:00.000Z`,
        ),
        fin: new Date(`2030-01-${String(dia).padStart(2, '0')}T13:00:00.000Z`),
        estado: EstadoReserva.CONFIRMADA,
        socioId,
        nombre: 'Titular',
        email: `titular${DOMINIO}`,
        telefono: '+56911112222',
        acompanantes: { create: acompanantes },
      },
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

    await prisma.cancha.deleteMany({ where: { nombre: NOMBRE_CANCHA } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    const cancha = await prisma.cancha.create({
      data: { nombre: NOMBRE_CANCHA, superficie: Superficie.CEMENTO },
      select: { id: true },
    });
    canchaId = cancha.id;
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({ where: { nombre: NOMBRE_CANCHA } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  it('**devuelve sus invitados una vez cada uno, del último que usó al primero**', async () => {
    const yo = await crearCuenta('titular');
    const companero = await crearCuenta('companero');

    await reservaCon(yo.socioId!, [{ nombre: 'Juan Pérez' }]);
    await reservaCon(yo.socioId!, [
      { nombre: 'Ana Soto' },
      { socioId: companero.socioId! },
    ]);
    await reservaCon(yo.socioId!, [{ nombre: 'juan perez ' }]);

    const respuesta = await request(servidor())
      .get('/api/reservas/mis-invitados')
      .set('Cookie', yo.cookie)
      .expect(200);

    // El compañero socio no es un invitado: se elige de la lista de socios, no de esta.
    expect(respuesta.body).toEqual(['juan perez', 'Ana Soto']);
  });

  it('**un socio no ve los invitados de otro**', async () => {
    const yo = await crearCuenta('curioso');
    const otro = await crearCuenta('ajeno');
    await reservaCon(otro.socioId!, [{ nombre: 'Invitada De Otro' }]);

    const respuesta = await request(servidor())
      .get('/api/reservas/mis-invitados')
      .set('Cookie', yo.cookie)
      .expect(200);

    expect(respuesta.body).toEqual([]);
  });

  it('quien no tiene ficha de socio recibe 403', async () => {
    const visitante = await crearCuenta('visitante', false);

    await request(servidor())
      .get('/api/reservas/mis-invitados')
      .set('Cookie', visitante.cookie)
      .expect(403);
  });

  it('sin sesión, 401', async () => {
    await request(servidor()).get('/api/reservas/mis-invitados').expect(401);
  });
});
