import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EstadoSocio, Superficie } from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T14. El admin cierra una cancha por mantención, torneo o clase, y esa hora deja
 * de ofrecerse. Es lo que impide que alguien reserve una cancha que va a estar con
 * la máquina de riego encima.
 *
 * El rango entra en hora del club —fecha y hora como las piensa el admin— y la
 * conversión a instantes la hace el servidor, que es donde está probada.
 */
describe('Bloqueos por mantención', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let socio: string;
  let canchaId: number;

  const DOMINIO = '@bloqueos-t14.test';
  const CONTRASENA = 'raqueta lluviosa 44';
  const NOMBRE = 'Cancha T14';
  const LUNES = '2026-08-17';

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    admin = await sesionDe('admin');
    socio = await sesionDe('socio');
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE } },
    });

    const cancha = await prisma.cancha.create({
      data: {
        nombre: NOMBRE,
        superficie: Superficie.CEMENTO,
        horarios: {
          create: { diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' },
        },
      },
      select: { id: true },
    });

    canchaId = cancha.id;
  });

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  async function sesionDe(quien: 'admin' | 'socio'): Promise<string> {
    const email = `${quien}${DOMINIO}`;

    await prisma.usuario.create({
      data: {
        email,
        nombre: quien,
        apellido: 'De Prueba',
        esAdmin: quien === 'admin',
        passwordHash: await hashear(CONTRASENA),
        socio:
          quien === 'socio'
            ? {
                create: {
                  numeroSocio: `T14-${quien}`,
                  estado: EstadoSocio.ACTIVO,
                  fechaIngreso: new Date('2026-01-01T00:00:00.000Z'),
                  alDiaHasta: new Date('2099-12-31T00:00:00.000Z'),
                },
              }
            : undefined,
      },
    });

    const respuesta = await request(servidor())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);

    return (respuesta.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  }

  /** Un bloqueo en hora del club, que es como lo escribe el admin. */
  const bloquear = (datos: Record<string, unknown> = {}) =>
    request(servidor())
      .post('/api/admin/bloqueos')
      .set('Cookie', admin)
      .send({
        canchaId,
        fechaDesde: LUNES,
        horaDesde: '10:00',
        fechaHasta: LUNES,
        horaHasta: '12:00',
        motivo: 'MANTENCION',
        ...datos,
      });

  const grillaDelLunes = async () => {
    const respuesta = await request(servidor())
      .get(`/api/disponibilidad?cancha=${canchaId}&fecha=${LUNES}`)
      .expect(200);

    return respuesta.body as {
      inicio: string;
      bloqueado: boolean;
      motivoBloqueo: string | null;
    }[];
  };

  describe('quién puede', () => {
    it('sin sesión no se crea ni se borra', async () => {
      await request(servidor()).post('/api/admin/bloqueos').expect(401);
      await request(servidor()).delete('/api/admin/bloqueos/1').expect(401);
      await request(servidor())
        .get(`/api/admin/bloqueos?cancha=${canchaId}`)
        .expect(401);
    });

    it('un socio recibe 403', async () => {
      await request(servidor())
        .post('/api/admin/bloqueos')
        .set('Cookie', socio)
        .send({})
        .expect(403);
      await request(servidor())
        .delete('/api/admin/bloqueos/1')
        .set('Cookie', socio)
        .expect(403);
    });
  });

  it('el bloque bloqueado desaparece de la grilla pública', async () => {
    // Antes: las 10:00 y las 11:00 del club se ofrecen.
    const antes = await grillaDelLunes();
    expect(antes.some((b) => b.bloqueado)).toBe(false);

    await bloquear().expect(201);

    // 10:00 y 11:00 del club son 14:00Z y 15:00Z en agosto.
    const despues = await grillaDelLunes();
    expect(despues.filter((b) => b.bloqueado).map((b) => b.inicio)).toEqual([
      '2026-08-17T14:00:00.000Z',
      '2026-08-17T15:00:00.000Z',
    ]);
    expect(despues.find((b) => b.bloqueado)?.motivoBloqueo).toBe('MANTENCION');
  });

  it('borrarlo devuelve la hora a la grilla', async () => {
    const creado = await bloquear().expect(201);
    const id = (creado.body as { id: number }).id;

    await request(servidor())
      .delete(`/api/admin/bloqueos/${id}`)
      .set('Cookie', admin)
      .expect(204);

    expect((await grillaDelLunes()).some((b) => b.bloqueado)).toBe(false);
  });

  it('lista los bloqueos de una cancha para el panel', async () => {
    await bloquear().expect(201);

    const respuesta = await request(servidor())
      .get(`/api/admin/bloqueos?cancha=${canchaId}`)
      .set('Cookie', admin)
      .expect(200);

    expect(respuesta.body).toHaveLength(1);
    expect(respuesta.body).toMatchObject([
      {
        canchaId,
        inicio: '2026-08-17T14:00:00.000Z',
        fin: '2026-08-17T16:00:00.000Z',
        motivo: 'MANTENCION',
      },
    ]);
  });

  it('un bloqueo puede cruzar la medianoche y varios días', async () => {
    // Una cancha en mantención toda la semana es un bloqueo, no siete.
    await bloquear({
      fechaHasta: '2026-08-19',
      horaHasta: '12:00',
    }).expect(201);

    const bloques = await grillaDelLunes();

    // Desde las 10:00 del lunes, todo lo que queda del día cae adentro.
    expect(bloques.filter((b) => !b.bloqueado)).toHaveLength(2);
  });

  describe('rangos que no sirven', () => {
    it('rechaza un fin anterior al inicio', async () => {
      // La nota de T9: un rango al revés no bloquea nada y no avisa. La cancha
      // sigue apareciendo libre y nadie entiende por qué la mantención no tomó.
      await bloquear({ horaDesde: '12:00', horaHasta: '10:00' }).expect(400);
    });

    it('rechaza un rango de duración cero', async () => {
      await bloquear({ horaDesde: '10:00', horaHasta: '10:00' }).expect(400);
    });

    it('la base también lo rechaza, no solo el panel', async () => {
      // El CHECK, para quien escriba SQL directo o para el día que aparezca otra
      // vía de entrada que se olvide de validar.
      const error = await prisma.bloqueo
        .create({
          data: {
            canchaId,
            inicio: new Date('2026-08-17T16:00:00.000Z'),
            fin: new Date('2026-08-17T14:00:00.000Z'),
            motivo: 'MANTENCION',
          },
        })
        .then(() => null)
        .catch((e: unknown) => e);

      expect(error).not.toBeNull();
    });

    it('rechaza un motivo que no existe', async () => {
      await bloquear({ motivo: 'PORQUE_SI' }).expect(400);
    });

    it('rechaza una fecha que no existe', async () => {
      await bloquear({ fechaDesde: '2026-02-30' }).expect(400);
    });

    it('rechaza una hora ilegible', async () => {
      await bloquear({ horaDesde: '10:70' }).expect(400);
    });

    it('responde 404 por una cancha que no existe', async () => {
      await bloquear({ canchaId: 999999 }).expect(404);
    });

    it('responde 404 al borrar uno que no existe', async () => {
      await request(servidor())
        .delete('/api/admin/bloqueos/999999')
        .set('Cookie', admin)
        .expect(404);
    });
  });
});
