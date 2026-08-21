import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import {
  ConfiguracionClub,
  EstadoSocio,
  Superficie,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T30. Las reglas del club, editables desde el panel.
 *
 * Existen en la base desde T4 y hasta ahora solo las escribía el seed, así que el
 * panel nombraba "el general del club" sin dar dónde cambiarlo.
 *
 * Lo que estos tests protegen no es que el `PATCH` guarde —eso lo hace cualquier
 * ORM— sino que **la regla cambie de verdad y en el acto**: la grilla se redibuja y
 * el cupo del socio pasa a ser otro sin reiniciar nada.
 */
describe('Configuración del club', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let socio: string;
  let socioId: number;
  let canchaId: number;
  let original: ConfiguracionClub;

  const DOMINIO = '@config-t30.test';
  const CONTRASENA = 'raqueta lluviosa 44';
  const NOMBRE_CANCHA = 'Cancha T30';
  // Lunes de agosto, sin cambio de hora de por medio. El club en UTC-4.
  const LUNES = '2026-08-17';
  const A_LAS_10 = '2026-08-17T14:00:00.000Z';
  const A_LAS_11 = '2026-08-17T15:00:00.000Z';

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);

    // **Se guarda para devolverla al final.** La fila es única y global: si esta
    // suite la deja con otros valores, la siguiente que corra falla por un cupo que
    // nadie tocó en su código.
    original = await prisma.configuracionClub.findFirstOrThrow();

    await limpiar();
    admin = await sesionDe('admin');
    socio = await sesionDe('socio');

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email: `socio${DOMINIO}` },
      select: { socio: { select: { id: true } } },
    });
    socioId = usuario.socio!.id;
  });

  afterAll(async () => {
    await prisma.configuracionClub.update({
      where: { id: original.id },
      data: original,
    });
    await limpiar();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.configuracionClub.update({
      where: { id: original.id },
      data: original,
    });
    await prisma.reserva.deleteMany({
      where: { cancha: { nombre: { startsWith: NOMBRE_CANCHA } } },
    });
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });

    const cancha = await prisma.cancha.create({
      data: {
        nombre: NOMBRE_CANCHA,
        superficie: Superficie.ARCILLA,
        horarios: {
          create: { diaSemana: 1, horaApertura: '08:00', horaCierre: '12:00' },
        },
        franjas: {
          create: {
            horaDesde: '08:00',
            horaHasta: '12:00',
            montoClp: 10000,
            esPico: false,
            vigenteDesde: new Date('2026-01-01'),
          },
        },
      },
      select: { id: true },
    });
    canchaId = cancha.id;
  });

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  async function limpiar(): Promise<void> {
    await prisma.reserva.deleteMany({
      where: { cancha: { nombre: { startsWith: NOMBRE_CANCHA } } },
    });
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
  }

  async function sesionDe(quien: 'admin' | 'socio'): Promise<string> {
    const email = `${quien}${DOMINIO}`;

    await prisma.usuario.create({
      data: {
        email,
        nombre: quien,
        apellido: 'De Prueba',
        telefono: '+56911112222',
        esAdmin: quien === 'admin',
        passwordHash: await hashear(CONTRASENA),
        socio:
          quien === 'socio'
            ? {
                create: {
                  numeroSocio: `T30-${quien}`,
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

  const patch = (cambios: Record<string, unknown>, cookie = admin) =>
    request(servidor())
      .patch('/api/admin/configuracion')
      .set('Cookie', cookie)
      .send(cambios);

  const reservar = (inicio: string) =>
    request(servidor())
      .post('/api/reservas')
      .set('Cookie', socio)
      .send({
        canchaId,
        inicio,
        acompanantes: [{ nombre: 'Ana Invitada' }],
      });

  describe('quién puede entrar', () => {
    it('sin sesión, 401', async () => {
      await request(servidor()).get('/api/admin/configuracion').expect(401);
      await request(servidor())
        .patch('/api/admin/configuracion')
        .send({ invitadosPorMes: 9 })
        .expect(401);
    });

    it('un socio recibe 403 en la lectura y en la escritura', async () => {
      await request(servidor())
        .get('/api/admin/configuracion')
        .set('Cookie', socio)
        .expect(403);
      await patch({ invitadosPorMes: 9 }, socio).expect(403);
    });
  });

  describe('lectura y escritura', () => {
    it('devuelve las reglas vigentes', async () => {
      const respuesta = await request(servidor())
        .get('/api/admin/configuracion')
        .set('Cookie', admin)
        .expect(200);

      expect(respuesta.body).toMatchObject({
        duracionBloqueMin: original.duracionBloqueMin,
        cupoDiarioSocioHoras: original.cupoDiarioSocioHoras,
        invitadosPorMes: original.invitadosPorMes,
      });
    });

    it('guarda el cambio sin crear una segunda fila', async () => {
      await patch({ invitadosPorMes: 6 }).expect(200);

      // La fila es única y la base lo impone con un CHECK (id = 1). Una segunda
      // haría que "la configuración del club" dependa de cuál lea cada consulta, y
      // eso no se nota hasta que dos pantallas muestran precios distintos.
      expect(await prisma.configuracionClub.count()).toBe(1);
      expect(
        (await prisma.configuracionClub.findFirstOrThrow()).invitadosPorMes,
      ).toBe(6);
    });

    it('lo que no viene en el cuerpo no se toca', async () => {
      const respuesta = await patch({ invitadosPorMes: 6 }).expect(200);

      expect(respuesta.body).toMatchObject({
        invitadosPorMes: 6,
        cupoDiarioSocioHoras: original.cupoDiarioSocioHoras,
        horasReembolsoTotal: original.horasReembolsoTotal,
      });
    });
  });

  describe('validación', () => {
    it('rechaza una duración de bloque de cero', async () => {
      // Sin este 400, el 0 llega a `calcularBloques`, que lanza para no colgarse en
      // un bucle infinito: la grilla del club entero responde 500 hasta que alguien
      // entre a la base a arreglarlo a mano.
      await patch({ duracionBloqueMin: 0 }).expect(400);
    });

    it('rechaza una duración de bloque absurda', async () => {
      await patch({ duracionBloqueMin: 5 }).expect(400);
      await patch({ duracionBloqueMin: 1000 }).expect(400);
    });

    it('rechaza cupos y ventanas negativos', async () => {
      await patch({ cupoDiarioSocioHoras: -1 }).expect(400);
      await patch({ invitadosPorMes: -1 }).expect(400);
      await patch({ horasMinModificacion: -1 }).expect(400);
    });

    it('rechaza lo que no es entero', async () => {
      await patch({ cupoDiarioSocioHoras: 1.5 }).expect(400);
      await patch({ cupoDiarioSocioHoras: '2' }).expect(400);
    });

    it('un cuerpo sin ningún campo conocido no pasa por válido', async () => {
      // Sin esto, un nombre de campo mal escrito responde 200 y el admin cree que
      // guardó algo que no cambió nada.
      await patch({ cupoDiario: 3 }).expect(400);
    });
  });

  describe('la regla cambia en el acto', () => {
    it('cambiar la duración del bloque redibuja la grilla pública', async () => {
      const antes = await request(servidor())
        .get(`/api/disponibilidad?cancha=${canchaId}&fecha=${LUNES}`)
        .expect(200);
      // 08:00 a 12:00 en bloques de 60: cuatro horas.
      expect((antes.body as unknown[]).length).toBe(4);

      await patch({ duracionBloqueMin: 120 }).expect(200);

      const despues = await request(servidor())
        .get(`/api/disponibilidad?cancha=${canchaId}&fecha=${LUNES}`)
        .expect(200);

      // Sin migrar un solo dato: los bloques se calculan, no se guardan.
      expect((despues.body as unknown[]).length).toBe(2);
    });

    it('subir el cupo diario deja al socio reservar dos horas el mismo día', async () => {
      // **El criterio 13 de `SPEC-catalogo-canchas.md`**: la regla cambia sin tocar
      // código ni reiniciar. Si la configuración se leyera una vez al arrancar, este
      // test fallaría con el 409 del cupo.
      await patch({ cupoDiarioSocioHoras: 1 }).expect(200);
      await reservar(A_LAS_10).expect(201);
      await reservar(A_LAS_11).expect(409);

      await patch({ cupoDiarioSocioHoras: 2 }).expect(200);

      await reservar(A_LAS_11).expect(201);
      expect(await prisma.reserva.count({ where: { socioId, canchaId } })).toBe(
        2,
      );
    });
  });
});
