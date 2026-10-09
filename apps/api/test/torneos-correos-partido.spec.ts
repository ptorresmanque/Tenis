import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { sembrarCategoriasDeJuego } from '../src/arranque';
import { Superficie } from '../src/generated/prisma/client';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T133: los dos jugadores de un partido se enteran cuando el club lo programa, le cambia
 * el día, la hora o la cancha, o lo deja sin hora (decisión 7 de la sexta parte).
 */
describe('Los correos de la programación de un partido', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;

  const enviados: CorreoSaliente[] = [];
  const enviador = {
    enviar: (correo: CorreoSaliente) => {
      enviados.push(correo);
      return Promise.resolve();
    },
  };

  const MARCA = 'Copa del aviso de partido';
  const APELLIDO = 'DelAviso';
  const DOMINIO = '@correos-partido.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const CANCHA = 'Cancha del aviso';
  const PEDRO = `pedro${DOMINIO}`;
  const ANDRES = `andres${DOMINIO}`;

  /** Un sábado: el torneo se juega el fin de semana. */
  const SABADO = '2027-12-04';

  let canchaId: number;
  let torneoId: number;
  let partidoId: number;
  let cuartaId: number;

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const programar = (horaDesde = '10:00', horaHasta = '11:30') =>
    request(servidor())
      .post(`/api/admin/torneos/${torneoId}/partidos/${partidoId}/programacion`)
      .set('Cookie', cookieAdmin)
      .send({ canchaId, fecha: SABADO, horaDesde, horaHasta });

  /** Los que le llegaron a cada jugador de este archivo. */
  const para = (email: string) =>
    enviados.filter((correo) => correo.para === email);

  let siguienteTelefono = 0;
  const unTelefono = () =>
    `5697${String(1_000_000 + (siguienteTelefono += 1)).slice(-7)}`;

  const limpiar = async () => {
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatAvisoPartido' } },
    });
    await prisma.bloqueo.deleteMany({ where: { cancha: { nombre: CANCHA } } });
  };

  /** Una final entre Pedro y Andrés, cada uno con el correo de su inscripción. */
  const unaFinal = async (correos: (string | null)[] = [PEDRO, ANDRES]) => {
    const categoria = await prisma.categoriaTorneo.create({
      data: {
        nombre: `CatAvisoPartido ${Date.now()}${Math.random()}`,
        puntosCampeon: 250,
      },
    });

    const torneo = await prisma.torneo.create({
      data: {
        nombre: `${MARCA} ${Date.now()}`,
        fechaInicio: new Date('2027-12-04T00:00:00.000Z'),
        fechaFin: new Date('2027-12-05T00:00:00.000Z'),
        cierreInscripcion: new Date('2027-11-25T00:00:00.000Z'),
        cuadros: {
          create: {
            categoriaJuegoId: cuartaId,
            cupo: 2,
            categoriaId: categoria.id,
          },
        },
      },
      select: { id: true, cuadros: { select: { id: true } } },
    });

    for (const [i, nombre] of ['Pedro', 'Andrés'].entries()) {
      const jugador = await prisma.jugador.create({
        data: { nombre, apellido: APELLIDO, telefono: unTelefono() },
      });

      await prisma.inscripcionTorneo.create({
        data: {
          torneoId: torneo.id,
          torneoCategoriaId: torneo.cuadros[0].id,
          jugadorId: jugador.id,
          email: correos[i],
        },
      });
    }

    await request(servidor())
      .post(`/api/admin/cuadros/${torneo.cuadros[0].id}/armar`)
      .set('Cookie', cookieAdmin)
      .expect(201);

    torneoId = torneo.id;
    partidoId = (
      await prisma.partido.findFirstOrThrow({
        where: { torneoCategoriaId: torneo.cuadros[0].id },
      })
    ).id;
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnviadorCorreo)
      .useValue(enviador)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
    await sembrarCategoriasDeJuego(prisma);
    cuartaId = (
      await prisma.categoriaJuego.findUniqueOrThrow({ where: { nombre: '4ª' } })
    ).id;

    await limpiar();
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await request(servidor())
      .post('/api/auth/registro')
      .send({
        email: `jefa${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: 'Jefa',
        apellido: APELLIDO,
      })
      .expect(201);
    await prisma.usuario.update({
      where: { email: `jefa${DOMINIO}` },
      data: { esAdmin: true },
    });
    cookieAdmin = (
      (
        await request(servidor())
          .post('/api/auth/login')
          .send({ email: `jefa${DOMINIO}`, contrasena: CONTRASENA })
          .expect(204)
      ).headers['set-cookie'] as unknown as string[]
    )[0];

    // Una cancha propia, abierta todos los días, para no pisarle el horario a otra suite.
    await prisma.cancha.deleteMany({ where: { nombre: CANCHA } });
    canchaId = (
      await prisma.cancha.create({
        data: {
          nombre: CANCHA,
          superficie: Superficie.ARCILLA,
          horarios: {
            create: Array.from({ length: 7 }, (_, diaSemana) => ({
              diaSemana,
              horaApertura: '08:00',
              horaCierre: '22:00',
            })),
          },
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await limpiar();
    await prisma.cancha.deleteMany({ where: { nombre: CANCHA } });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();
    enviados.length = 0;
  });

  it('**programar le avisa a cada jugador, con el otro de rival**', async () => {
    await unaFinal();

    await programar().expect(200);

    expect(para(PEDRO)).toHaveLength(1);
    expect(para(ANDRES)).toHaveLength(1);
    expect(para(PEDRO)[0].asunto).toBe(
      'Tu partido: sábado, 4 de diciembre, a las 10:00',
    );
    expect(para(PEDRO)[0].cuerpo).toContain(`Rival: Andrés ${APELLIDO}`);
    expect(para(ANDRES)[0].cuerpo).toContain(`Rival: Pedro ${APELLIDO}`);
    expect(para(PEDRO)[0].cuerpo).toContain(`Cancha: ${CANCHA}`);
  });

  it('**cambiarle la hora avisa con lo de antes y lo de ahora**', async () => {
    await unaFinal();
    await programar().expect(200);
    enviados.length = 0;

    await programar('16:00', '17:30').expect(200);

    expect(para(PEDRO)).toHaveLength(1);
    expect(para(PEDRO)[0].asunto).toMatch(/^Tu partido cambió: /);
    expect(para(PEDRO)[0].cuerpo).toContain('de 10:00 a 11:30');
    expect(para(PEDRO)[0].cuerpo).toContain('de 16:00 a 17:30');
  });

  it('**programar lo que ya estaba igual no manda nada**', async () => {
    await unaFinal();
    await programar().expect(200);
    enviados.length = 0;

    await programar().expect(200);

    expect(enviados).toHaveLength(0);
  });

  it('**dejarlo sin hora les avisa a los dos**', async () => {
    await unaFinal();
    await programar().expect(200);
    enviados.length = 0;

    await request(servidor())
      .delete(
        `/api/admin/torneos/${torneoId}/partidos/${partidoId}/programacion`,
      )
      .set('Cookie', cookieAdmin)
      .expect(200);

    expect(para(PEDRO)).toHaveLength(1);
    expect(para(ANDRES)).toHaveLength(1);
    expect(para(PEDRO)[0].asunto).toBe('Tu partido quedó sin hora');
  });

  it('**un jugador sin correo no impide el aviso al otro**', async () => {
    await unaFinal([null, ANDRES]);

    await programar().expect(200);

    expect(enviados.filter((c) => c.para.endsWith(DOMINIO))).toEqual([
      expect.objectContaining({ para: ANDRES }),
    ]);
  });
});
