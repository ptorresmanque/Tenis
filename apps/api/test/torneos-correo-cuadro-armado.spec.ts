import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { sembrarCategoriasDeJuego } from '../src/arranque';
import { EstadoInscripcionTorneo } from '../src/generated/prisma/client';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T132: al armar una categoría, cada inscrito recibe su primer rival (o el bye) y el
 * enlace al cuadro (A5). Volver a armarla avisa que el cuadro cambió.
 */
describe('El correo del cuadro armado', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cuartaId: number;
  let cuadroId: number;

  const enviados: CorreoSaliente[] = [];
  const enviador = {
    enviar: (correo: CorreoSaliente) => {
      enviados.push(correo);
      return Promise.resolve();
    },
  };

  const MARCA = 'Copa del cuadro armado';
  const APELLIDO = 'DelCuadroArmado';
  const DOMINIO = '@cuadro-armado.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  /** Los de este archivo: otras suites corren a la vez con su propio enviador. */
  const avisos = () => enviados.filter((c) => c.para.endsWith(DOMINIO));

  const armar = () =>
    request(servidor())
      .post(`/api/admin/cuadros/${cuadroId}/armar`)
      .set('Cookie', cookieAdmin);

  let siguienteTelefono = 0;
  const unTelefono = () =>
    `5696${String(1_000_000 + (siguienteTelefono += 1)).slice(-7)}`;

  const limpiar = async () => {
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({ where: { apellido: APELLIDO } });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'CatArmado' } },
    });
  };

  /**
   * Un cuadro de 8 con `cuantos` inscritos: con menos de 8, los lugares que sobran son
   * byes. El primero puede ir sin correo, como las inscripciones de antes de T127.
   */
  const unCuadro = async (cuantos: number, primeroSinCorreo = false) => {
    const categoria = await prisma.categoriaTorneo.create({
      data: {
        nombre: `CatArmado ${Date.now()}${Math.random()}`,
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
            cupo: 8,
            categoriaId: categoria.id,
          },
        },
      },
      select: { id: true, cuadros: { select: { id: true } } },
    });
    cuadroId = torneo.cuadros[0].id;

    for (let i = 0; i < cuantos; i++) {
      const jugador = await prisma.jugador.create({
        data: {
          nombre: `Jugador${i}`,
          apellido: APELLIDO,
          telefono: unTelefono(),
        },
      });
      await prisma.inscripcionTorneo.create({
        data: {
          torneoId: torneo.id,
          torneoCategoriaId: cuadroId,
          jugadorId: jugador.id,
          email: primeroSinCorreo && i === 0 ? null : `jugador${i}${DOMINIO}`,
        },
      });
    }
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
  });

  afterAll(async () => {
    await limpiar();
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();
    enviados.length = 0;
  });

  it('**un cuadro de 8: cada inscrito recibe su primer rival y el enlace**', async () => {
    await unCuadro(8);

    await armar().expect(201);

    expect(avisos()).toHaveLength(8);
    expect(new Set(avisos().map((c) => c.para)).size).toBe(8);
    for (const correo of avisos()) {
      expect(correo.asunto).toMatch(/^Cuadro armado: /);
      expect(correo.cuerpo).toMatch(
        /Tu primer partido: .+, contra Jugador\d DelCuadroArmado\./,
      );
      expect(correo.cuerpo).toContain(`/torneos?cuadro=${cuadroId}`);
    }
  });

  it('**con byes, los que pasan directo lo leen**', async () => {
    // 6 inscritos en un cuadro de 8: dos byes.
    await unCuadro(6);

    await armar().expect(201);

    expect(avisos()).toHaveLength(6);
    expect(avisos().filter((c) => c.cuerpo.includes('(bye)'))).toHaveLength(2);
    expect(avisos().filter((c) => c.cuerpo.includes(', contra '))).toHaveLength(
      4,
    );
  });

  it('**sale una vez por armado**: el segundo intento choca y no manda nada', async () => {
    await unCuadro(4);
    await armar().expect(201);
    enviados.length = 0;

    await armar().expect(409);

    expect(avisos()).toHaveLength(0);
  });

  it('**rearmar avisa que el cuadro cambió**', async () => {
    await unCuadro(4);
    await armar().expect(201);
    await request(servidor())
      .post(`/api/admin/cuadros/${cuadroId}/deshacer`)
      .set('Cookie', cookieAdmin)
      .expect(200);
    enviados.length = 0;

    await armar().expect(201);

    expect(avisos()).toHaveLength(4);
    expect(
      avisos().every((c) => c.asunto.startsWith('El cuadro cambió: ')),
    ).toBe(true);
  });

  it('**deshacer no manda nada**: el aviso sale al volver a armar', async () => {
    await unCuadro(4);
    await armar().expect(201);
    enviados.length = 0;

    await request(servidor())
      .post(`/api/admin/cuadros/${cuadroId}/deshacer`)
      .set('Cookie', cookieAdmin)
      .expect(200);

    expect(avisos()).toHaveLength(0);
  });

  it('un inscrito sin correo no impide el aviso a los demás', async () => {
    await unCuadro(4, true);

    await armar().expect(201);

    expect(avisos()).toHaveLength(3);
  });

  it('la lista de espera no recibe nada: no está en el cuadro', async () => {
    await unCuadro(4);
    const enEspera = await prisma.jugador.create({
      data: { nombre: 'Esperando', apellido: APELLIDO, telefono: unTelefono() },
    });
    const torneo = await prisma.torneoCategoria.findUniqueOrThrow({
      where: { id: cuadroId },
    });
    await prisma.inscripcionTorneo.create({
      data: {
        torneoId: torneo.torneoId,
        torneoCategoriaId: cuadroId,
        jugadorId: enEspera.id,
        estado: EstadoInscripcionTorneo.LISTA_ESPERA,
        email: `esperando${DOMINIO}`,
      },
    });

    await armar().expect(201);

    expect(avisos().map((c) => c.para)).not.toContain(`esperando${DOMINIO}`);
  });
});
