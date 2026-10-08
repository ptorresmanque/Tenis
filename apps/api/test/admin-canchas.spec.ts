import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { DisponibilidadService } from '../src/catalogo-canchas/disponibilidad.service';
import { EstadoSocio } from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';
import { sembrarCatalogo } from '../prisma/seed-catalogo';

/**
 * T13. El panel con que el club administra sus canchas. Primer consumidor real de
 * `@SoloAdmin()`: hasta acá los guards solo tenían el controlador de prueba de T8.
 *
 * Lo que impide que un socio toque las tarifas es el guard del servidor, no que la
 * interfaz le esconda el botón.
 */
describe('Administración de canchas', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let socio: string;

  const DOMINIO = '@admin-t13.test';
  const CONTRASENA = 'raqueta lluviosa 44';
  const NOMBRE = 'Cancha T13';

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);

    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    admin = await sesionDe('admin');
    socio = await sesionDe('socio');

    // Las tarifas generales del club, para que "esta hora quedó sin cubrir"
    // signifique lo mismo corra este archivo solo o con toda la suite.
    await sembrarCatalogo(prisma);
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
                  numeroSocio: `T13-${quien}`,
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

  const crear = (cookie: string, datos: Record<string, unknown> = {}) =>
    request(servidor())
      .post('/api/admin/canchas')
      .set('Cookie', cookie)
      .send({ nombre: NOMBRE, superficie: 'ARCILLA', ...datos });

  const nuevaCancha = async (datos: Record<string, unknown> = {}) => {
    const respuesta = await crear(admin, datos).expect(201);
    return respuesta.body as { id: number; nombre: string; activa: boolean };
  };

  describe('quién puede entrar', () => {
    // El criterio de verificación de T13. Cada ruta por separado: alcanza con que
    // una se olvide el decorador para que el panel quede abierto.
    const rutas: [string, string][] = [
      ['get', '/api/admin/canchas'],
      ['post', '/api/admin/canchas'],
      ['patch', '/api/admin/canchas/1'],
      ['delete', '/api/admin/canchas/1'],
      ['put', '/api/admin/canchas/1/horarios'],
      ['post', '/api/admin/franjas'],
      ['delete', '/api/admin/franjas/1'],
      ['get', '/api/admin/advertencias?fecha=2026-08-17'],
    ];

    it.each(rutas)('%s %s responde 401 sin sesión', async (metodo, ruta) => {
      await request(servidor())[metodo as 'get'](ruta).expect(401);
    });

    it.each(rutas)('%s %s responde 403 a un socio', async (metodo, ruta) => {
      await request(servidor())
        [metodo as 'get'](ruta)
        .set('Cookie', socio)
        .expect(403);
    });
  });

  describe('alta', () => {
    it('crea una cancha y la deja visible en la grilla pública', async () => {
      const cancha = await nuevaCancha({ techada: true, orden: 9 });

      // El criterio manual, como test: la cancha nueva aparece en el listado
      // público sin ningún paso extra.
      const publicas = await request(servidor())
        .get('/api/canchas')
        .expect(200);

      expect((publicas.body as { id: number }[]).map((c) => c.id)).toContain(
        cancha.id,
      );
    });

    it('la cancha nueva queda al final de la lista, no al principio', async () => {
      const cancha = await nuevaCancha();

      const todas = await request(servidor())
        .get('/api/admin/canchas')
        .set('Cookie', admin)
        .expect(200);

      // Con `orden` en 0 por defecto se colaba antes que todas las que el club ya
      // había ordenado, y el admin tenía que reordenarlas para deshacer algo que
      // nunca pidió.
      const ids = (todas.body as { id: number }[]).map((c) => c.id);
      expect(ids[ids.length - 1]).toBe(cancha.id);
    });

    it('rechaza un nombre repetido con un mensaje y no con un 500', async () => {
      await nuevaCancha();

      // Sin traducir el error de unicidad, esto sale como error del servidor y
      // el admin no sabe que el problema es el nombre.
      await crear(admin).expect(409);
    });

    it('rechaza una superficie que no existe', async () => {
      await crear(admin, { superficie: 'CESPED_MARCIANO' }).expect(400);
    });

    it('al rechazar una superficie las lista con cemento primero, la de las ocho canchas del club (T94)', async () => {
      const respuesta = await crear(admin, {
        superficie: 'CESPED_MARCIANO',
      }).expect(400);

      expect((respuesta.body as { message: string }).message).toBe(
        'La superficie tiene que ser una de: CEMENTO, ARCILLA, PASTO_SINTETICO.',
      );
    });

    it('rechaza un nombre vacío', async () => {
      await crear(admin, { nombre: '   ' }).expect(400);
    });

    it('rechaza un nombre demasiado largo diciendo hasta dónde', async () => {
      const respuesta = await crear(admin, { nombre: 'a'.repeat(192) }).expect(
        400,
      );

      expect((respuesta.body as { message: string }).message).toBe(
        'Acorta el nombre: tiene más de 191 caracteres.',
      );
    });
  });

  describe('edición', () => {
    it('cambia lo que se le manda y deja el resto como estaba', async () => {
      const cancha = await nuevaCancha({ techada: false, iluminacion: true });

      const respuesta = await request(servidor())
        .patch(`/api/admin/canchas/${cancha.id}`)
        .set('Cookie', admin)
        .send({ techada: true })
        .expect(200);

      expect(respuesta.body).toMatchObject({
        techada: true,
        // No se tocó y no se pierde: un PATCH que borra lo que no menciona
        // apaga la iluminación de una cancha por editarle el techo.
        iluminacion: true,
        nombre: NOMBRE,
      });
    });

    it('renombrar a un nombre que ya usa otra cancha responde 409 con un mensaje, no un 500 (T96)', async () => {
      await nuevaCancha();
      const otra = await nuevaCancha({ nombre: `${NOMBRE} B` });

      const respuesta = await request(servidor())
        .patch(`/api/admin/canchas/${otra.id}`)
        .set('Cookie', admin)
        .send({ nombre: NOMBRE })
        .expect(409);

      expect((respuesta.body as { message: string }).message).toBe(
        'Ya hay una cancha con ese nombre.',
      );
    });

    it('responde 404 por una cancha que no existe', async () => {
      await request(servidor())
        .patch('/api/admin/canchas/999999')
        .set('Cookie', admin)
        .send({ techada: true })
        .expect(404);
    });
  });

  describe('desactivación', () => {
    it('la saca de la grilla pública sin borrar la cancha', async () => {
      const cancha = await nuevaCancha();

      await request(servidor())
        .patch(`/api/admin/canchas/${cancha.id}`)
        .set('Cookie', admin)
        .send({ activa: false })
        .expect(200);

      const publicas = await request(servidor())
        .get('/api/canchas')
        .expect(200);
      expect(
        (publicas.body as { id: number }[]).map((c) => c.id),
      ).not.toContain(cancha.id);

      // Sigue existiendo: desactivar no borra el historial.
      expect(
        await prisma.cancha.findUnique({ where: { id: cancha.id } }),
      ).not.toBeNull();
    });

    it('el admin la sigue viendo, para poder reactivarla', async () => {
      const cancha = await nuevaCancha();

      await request(servidor())
        .patch(`/api/admin/canchas/${cancha.id}`)
        .set('Cookie', admin)
        .send({ activa: false })
        .expect(200);

      const todas = await request(servidor())
        .get('/api/admin/canchas')
        .set('Cookie', admin)
        .expect(200);

      // Si el panel solo listara las activas, desactivar una sería un viaje de
      // ida y habría que ir a la base para volver atrás.
      expect((todas.body as { id: number }[]).map((c) => c.id)).toContain(
        cancha.id,
      );
    });
  });

  describe('eliminación (T29)', () => {
    /**
     * Una reserva de las que ya no le sirven a nadie: cancelada y del año pasado.
     * Es a propósito el caso más flojo posible — si ni siquiera esta protege a la
     * cancha del borrado, el historial del club no está protegido por nada.
     */
    const conUnaReservaCancelada = async (canchaId: number) => {
      await prisma.reserva.create({
        data: {
          folio: `T29${canchaId}`,
          canchaId,
          inicio: new Date('2025-03-04T14:00:00.000Z'),
          fin: new Date('2025-03-04T15:00:00.000Z'),
          estado: 'CANCELADA',
          canceladaEn: new Date('2025-03-03T10:00:00.000Z'),
          nombre: 'Visitante de prueba',
          email: 'visita@t29.test',
          telefono: '+56900000000',
        },
      });
    };

    it('borra de verdad una cancha que nunca tuvo reservas', async () => {
      const cancha = await nuevaCancha();

      await request(servidor())
        .delete(`/api/admin/canchas/${cancha.id}`)
        .set('Cookie', admin)
        .expect(204);

      expect(
        await prisma.cancha.findUnique({ where: { id: cancha.id } }),
      ).toBeNull();
    });

    it('se lleva con ella su horario, sus tarifas y sus bloqueos', async () => {
      const cancha = await nuevaCancha();

      await request(servidor())
        .put(`/api/admin/canchas/${cancha.id}/horarios`)
        .set('Cookie', admin)
        .send([{ diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' }])
        .expect(200);
      await request(servidor())
        .post('/api/admin/franjas')
        .set('Cookie', admin)
        .send({
          canchaId: cancha.id,
          diaSemana: null,
          horaDesde: '08:00',
          horaHasta: '22:00',
          esPico: false,
          montoClp: 15000,
          vigenteDesde: '2026-01-01',
        })
        .expect(201);
      await request(servidor())
        .post('/api/admin/bloqueos')
        .set('Cookie', admin)
        .send({
          canchaId: cancha.id,
          fechaDesde: '2026-09-01',
          horaDesde: '10:00',
          fechaHasta: '2026-09-01',
          horaHasta: '11:00',
          motivo: 'MANTENCION',
        })
        .expect(201);

      await request(servidor())
        .delete(`/api/admin/canchas/${cancha.id}`)
        .set('Cookie', admin)
        .expect(204);

      // No significan nada sin su cancha, y si quedaran, el próximo `id`
      // reutilizado heredaría el horario de una cancha que ya no existe.
      expect(
        await prisma.horarioApertura.count({ where: { canchaId: cancha.id } }),
      ).toBe(0);
      expect(
        await prisma.franjaHoraria.count({ where: { canchaId: cancha.id } }),
      ).toBe(0);
      expect(
        await prisma.bloqueo.count({ where: { canchaId: cancha.id } }),
      ).toBe(0);
    });

    it('se niega a borrar una cancha con historial, y dice qué hacer', async () => {
      // **El test obligatorio de T29.** `Reserva.canchaId` borra en cascada: sin
      // este 409, eliminar una cancha se lleva las reservas del club y deja las
      // transacciones de `pagos` apuntando a reservas que ya no existen.
      const cancha = await nuevaCancha();
      await conUnaReservaCancelada(cancha.id);

      const respuesta = await request(servidor())
        .delete(`/api/admin/canchas/${cancha.id}`)
        .set('Cookie', admin)
        .expect(409);

      expect((respuesta.body as { message: string }).message).toContain(
        'Desactívala',
      );
      expect(
        await prisma.cancha.findUnique({ where: { id: cancha.id } }),
      ).not.toBeNull();
    });

    it('borrar una cancha que no existe responde 404', async () => {
      await request(servidor())
        .delete('/api/admin/canchas/999999')
        .set('Cookie', admin)
        .expect(404);
    });
  });

  describe('horario de apertura', () => {
    it('reemplaza el horario de la cancha y cambia la grilla', async () => {
      const cancha = await nuevaCancha();

      await request(servidor())
        .put(`/api/admin/canchas/${cancha.id}/horarios`)
        .set('Cookie', admin)
        .send([{ diaSemana: 1, horaApertura: '10:00', horaCierre: '14:00' }])
        .expect(200);

      const lunes = await request(servidor())
        .get(`/api/disponibilidad?cancha=${cancha.id}&fecha=2026-08-17`)
        .expect(200);

      // De 10:00 a 14:00, una hora empezando cada media hora: 7 inicios.
      expect(lunes.body).toHaveLength(7);
    });

    it('reemplaza de verdad: el horario viejo no queda dando vueltas', async () => {
      const cancha = await nuevaCancha();
      const poner = (horaCierre: string) =>
        request(servidor())
          .put(`/api/admin/canchas/${cancha.id}/horarios`)
          .set('Cookie', admin)
          .send([{ diaSemana: 1, horaApertura: '10:00', horaCierre }])
          .expect(200);

      await poner('14:00');
      await poner('12:00');

      // Dos filas para el mismo día dejarían el horario a merced de cuál gane,
      // que es justo el problema que T12 tuvo que ordenar.
      expect(
        await prisma.horarioApertura.count({ where: { canchaId: cancha.id } }),
      ).toBe(1);
    });

    it('rechaza un horario con horas ilegibles', async () => {
      const cancha = await nuevaCancha();

      await request(servidor())
        .put(`/api/admin/canchas/${cancha.id}/horarios`)
        .set('Cookie', admin)
        .send([{ diaSemana: 1, horaApertura: '8:00', horaCierre: '22:00' }])
        .expect(400);
    });

    it('rechaza un cierre anterior a la apertura', async () => {
      const cancha = await nuevaCancha();

      await request(servidor())
        .put(`/api/admin/canchas/${cancha.id}/horarios`)
        .set('Cookie', admin)
        .send([{ diaSemana: 1, horaApertura: '22:00', horaCierre: '10:00' }])
        .expect(400);
    });

    it('rechaza dos horarios para el mismo día', async () => {
      const cancha = await nuevaCancha();

      await request(servidor())
        .put(`/api/admin/canchas/${cancha.id}/horarios`)
        .set('Cookie', admin)
        .send([
          { diaSemana: 1, horaApertura: '08:00', horaCierre: '12:00' },
          { diaSemana: 1, horaApertura: '14:00', horaCierre: '20:00' },
        ])
        .expect(400);
    });
  });

  describe('franjas', () => {
    it('crea una tarifa y la grilla la cobra', async () => {
      const cancha = await nuevaCancha();

      await request(servidor())
        .put(`/api/admin/canchas/${cancha.id}/horarios`)
        .set('Cookie', admin)
        .send([{ diaSemana: 1, horaApertura: '10:00', horaCierre: '12:00' }])
        .expect(200);

      await request(servidor())
        .post('/api/admin/franjas')
        .set('Cookie', admin)
        .send({
          canchaId: cancha.id,
          horaDesde: '10:00',
          horaHasta: '12:00',
          esPico: true,
          montoClp: 33000,
          vigenteDesde: '2026-01-01',
        })
        .expect(201);

      const lunes = await request(servidor())
        .get(`/api/disponibilidad?cancha=${cancha.id}&fecha=2026-08-17`)
        .expect(200);

      const bloques = lunes.body as { montoClp: number; esPico: boolean }[];
      expect(bloques[0]).toMatchObject({ montoClp: 33000, esPico: true });
    });

    it('guarda el precio de 1 hora y media, y sin él queda nulo (T79)', async () => {
      const cancha = await nuevaCancha();
      const franja = (parche: Record<string, unknown>) =>
        request(servidor())
          .post('/api/admin/franjas')
          .set('Cookie', admin)
          .send({
            canchaId: cancha.id,
            horaDesde: '10:00',
            horaHasta: '12:00',
            montoClp: 12000,
            vigenteDesde: '2026-01-01',
            ...parche,
          })
          .expect(201);

      const con = await franja({ montoClp90: 16000 });
      const sin = await franja({ horaDesde: '12:00', horaHasta: '14:00' });

      expect((con.body as { montoClp90: number | null }).montoClp90).toBe(
        16000,
      );
      expect((sin.body as { montoClp90: number | null }).montoClp90).toBeNull();
    });

    it('**completar el precio de 1 hora y media cierra la franja anterior y crea otra** (T79)', async () => {
      // Es un cambio de precio como cualquier otro: el monto de una reserva ya pagada
      // se justifica con la tarifa que regía, así que la vieja no se edita ni se borra.
      const cancha = await nuevaCancha();
      const tramo = {
        canchaId: cancha.id,
        horaDesde: '10:00',
        horaHasta: '12:00',
        montoClp: 12000,
      };

      await request(servidor())
        .post('/api/admin/franjas')
        .set('Cookie', admin)
        .send({ ...tramo, vigenteDesde: '2026-01-01' })
        .expect(201);
      await request(servidor())
        .post('/api/admin/franjas')
        .set('Cookie', admin)
        .send({ ...tramo, montoClp90: 16000, vigenteDesde: '2026-09-01' })
        .expect(201);

      const franjas = await prisma.franjaHoraria.findMany({
        where: { canchaId: cancha.id },
        orderBy: { vigenteDesde: 'asc' },
      });

      expect(
        franjas.map((f) => [
          f.montoClp90,
          f.vigenteHasta?.toISOString() ?? null,
        ]),
      ).toEqual([
        [null, '2026-08-31T00:00:00.000Z'],
        [16000, null],
      ]);
    });

    it('rechaza un precio de 1 hora y media negativo (T79)', async () => {
      const cancha = await nuevaCancha();

      await request(servidor())
        .post('/api/admin/franjas')
        .set('Cookie', admin)
        .send({
          canchaId: cancha.id,
          horaDesde: '10:00',
          horaHasta: '12:00',
          montoClp: 12000,
          montoClp90: -1,
          vigenteDesde: '2026-01-01',
        })
        .expect(400);
    });

    it('el catálogo cobra la hora y media donde tiene precio y la deja sin vender donde no (T79)', async () => {
      const cancha = await nuevaCancha();

      await request(servidor())
        .put(`/api/admin/canchas/${cancha.id}/horarios`)
        .set('Cookie', admin)
        .send([{ diaSemana: 1, horaApertura: '10:00', horaCierre: '14:00' }])
        .expect(200);
      for (const [horaDesde, horaHasta, montoClp90] of [
        ['10:00', '12:00', 16000],
        ['12:00', '14:00', null],
      ] as const) {
        await request(servidor())
          .post('/api/admin/franjas')
          .set('Cookie', admin)
          .send({
            canchaId: cancha.id,
            horaDesde,
            horaHasta,
            montoClp: 12000,
            montoClp90,
            vigenteDesde: '2026-01-01',
          })
          .expect(201);
      }

      const bloques = await app
        .get(DisponibilidadService)
        .de(cancha.id, '2026-08-17', 90);

      // De 10:00 a 14:00, hora y media cada media hora: 10:00 a 12:30. Las que
      // empiezan antes de las 12:00 tienen precio; las de después, no se venden.
      expect(bloques.map((b) => b.montoClp)).toEqual([
        16000,
        16000,
        16000,
        16000,
        null,
        null,
      ]);
    });

    it('rechaza un monto negativo', async () => {
      const cancha = await nuevaCancha();

      await request(servidor())
        .post('/api/admin/franjas')
        .set('Cookie', admin)
        .send({
          canchaId: cancha.id,
          horaDesde: '10:00',
          horaHasta: '12:00',
          montoClp: -1,
          vigenteDesde: '2026-01-01',
        })
        .expect(400);
    });

    it('borra una tarifa', async () => {
      const cancha = await nuevaCancha();
      const creada = await request(servidor())
        .post('/api/admin/franjas')
        .set('Cookie', admin)
        .send({
          canchaId: cancha.id,
          horaDesde: '10:00',
          horaHasta: '12:00',
          montoClp: 9000,
          vigenteDesde: '2026-01-01',
        })
        .expect(201);

      const id = (creada.body as { id: number }).id;

      await request(servidor())
        .delete(`/api/admin/franjas/${id}`)
        .set('Cookie', admin)
        .expect(204);

      expect(
        await prisma.franjaHoraria.findUnique({ where: { id } }),
      ).toBeNull();
    });
  });

  describe('advertencia de bloques sin tarifa', () => {
    it('avisa qué horas quedaron sin franja que las cubra', async () => {
      const cancha = await nuevaCancha();

      // De madrugada, que es donde las tarifas generales del club no llegan: las
      // del seed empiezan a las 08:00. Abrir de 06:00 a 09:00 con tarifa propia
      // solo hasta las 07:00 deja una hora sin cobrar.
      await request(servidor())
        .put(`/api/admin/canchas/${cancha.id}/horarios`)
        .set('Cookie', admin)
        .send([{ diaSemana: 1, horaApertura: '06:00', horaCierre: '09:00' }])
        .expect(200);

      await request(servidor())
        .post('/api/admin/franjas')
        .set('Cookie', admin)
        .send({
          canchaId: cancha.id,
          horaDesde: '06:00',
          horaHasta: '07:00',
          montoClp: 9000,
          vigenteDesde: '2026-01-01',
        })
        .expect(201);

      const respuesta = await request(servidor())
        .get('/api/admin/advertencias?fecha=2026-08-17')
        .set('Cookie', admin)
        .expect(200);

      const mia = (
        respuesta.body as { canchaId: number; sinTarifa: string[] }[]
      ).find((a) => a.canchaId === cancha.id);

      // Las 07:00 y las 07:30: las 06:00 y las 06:30 las cubre la tarifa propia y las
      // 08:00 la general del club, que empieza justo ahí. La de 07:30 también se avisa
      // (T78): una reserva que empieza ahí no tiene franja que la cobre.
      expect(mia?.sinTarifa).toEqual([
        '2026-08-17T11:00:00.000Z',
        '2026-08-17T11:30:00.000Z',
      ]);
    });

    it('no advierte de una cancha con todas sus horas cubiertas', async () => {
      const cancha = await nuevaCancha();

      await request(servidor())
        .put(`/api/admin/canchas/${cancha.id}/horarios`)
        .set('Cookie', admin)
        .send([{ diaSemana: 1, horaApertura: '10:00', horaCierre: '12:00' }])
        .expect(200);

      await request(servidor())
        .post('/api/admin/franjas')
        .set('Cookie', admin)
        .send({
          canchaId: cancha.id,
          horaDesde: '10:00',
          horaHasta: '12:00',
          montoClp: 9000,
          vigenteDesde: '2026-01-01',
        })
        .expect(201);

      const respuesta = await request(servidor())
        .get('/api/admin/advertencias?fecha=2026-08-17')
        .set('Cookie', admin)
        .expect(200);

      expect(
        (respuesta.body as { canchaId: number }[]).map((a) => a.canchaId),
      ).not.toContain(cancha.id);
    });
  });
});
