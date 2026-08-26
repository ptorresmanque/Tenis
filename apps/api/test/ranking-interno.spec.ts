import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hoyEnElClub } from '../src/comun/tiempo';
import { EstadoPartidoInterno } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T56: la tabla interna del club.
 *
 * El Elo se prueba solo en `elo.spec.ts`, sin base de datos. Lo que se prueba acá es lo
 * otro: **que la tabla lea exactamente los partidos que corresponde** —los confirmados y
 * nada más—, que el orden que fija el motor sea el que llega desde la base, y que no se
 * publique en la calle.
 */
describe('GET /api/ranking/interno', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@interno.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const APELLIDO = 'DeLaTablaInterna';

  interface Quien {
    cookie: string;
    socioId: number;
  }

  let ana: Quien;
  let beto: Quien;

  interface Fila {
    puesto: number | null;
    socioId: number;
    nombre: string;
    elo: number;
    partidos: number;
    ganados: number;
    ultimoPartido: string;
    activo: boolean;
  }

  interface Tabla {
    partidos: number;
    ultimoPartido: string | null;
    inactivosDesde: string;
    posiciones: Fila[];
  }

  const alguien = async (
    sufijo: string,
    opciones: { sinFicha?: boolean } = {},
  ): Promise<Quien> => {
    const email = `${sufijo}${DOMINIO}`;

    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email,
        contrasena: CONTRASENA,
        nombre: sufijo,
        apellido: APELLIDO,
      })
      .expect(201);

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email },
      select: { id: true },
    });

    let socioId = 0;
    if (!opciones.sinFicha) {
      const socio = await prisma.socio.create({
        data: {
          usuarioId: usuario.id,
          numeroSocio: `TI-${usuario.id}`,
          fechaIngreso: hoyEnElClub(),
          alDiaHasta: hoyEnElClub(),
        },
        select: { id: true },
      });
      socioId = socio.id;
    }

    // El login responde 204: no devuelve cuerpo, deja la cookie.
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, contrasena: CONTRASENA })
      .expect(204);

    return {
      cookie: (respuesta.headers['set-cookie'] as unknown as string[])[0],
      socioId,
    };
  };

  /** Un partido ya cerrado, escrito directo: el camino del socio se prueba en T55. */
  const jugado = (
    ganador: Quien,
    perdedor: Quien,
    dia: string,
    estado: EstadoPartidoInterno = EstadoPartidoInterno.CONFIRMADO,
  ) =>
    prisma.partidoInterno.create({
      data: {
        socioAId: ganador.socioId,
        socioBId: perdedor.socioId,
        ganadorSocioId: ganador.socioId,
        jugadoEn: new Date(`${dia}T00:00:00.000Z`),
        estado,
      },
      select: { id: true },
    });

  const haceDias = (dias: number) =>
    new Date(hoyEnElClub().getTime() - dias * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

  const tabla = async (quien: Quien): Promise<Tabla> => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/ranking/interno')
      .set('Cookie', quien.cookie)
      .expect(200);

    return respuesta.body as Tabla;
  };

  const limpiar = async () => {
    await prisma.partidoInterno.deleteMany({
      where: { socioA: { usuario: { email: { endsWith: DOMINIO } } } },
    });
    await prisma.socio.deleteMany({
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
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  beforeEach(async () => {
    await limpiar();

    ana = await alguien('ana');
    beto = await alguien('beto');
  });

  it('**la tabla no se publica en la calle**', async () => {
    // Un torneo es un evento público y su cuadro está en el mural. El orden de juego
    // entre socios es cosa de adentro.
    await request(app.getHttpServer()).get('/api/ranking/interno').expect(401);
  });

  it('quien tiene cuenta pero no ficha de socio tampoco entra', async () => {
    const visitante = await alguien('visita', { sinFicha: true });

    await request(app.getHttpServer())
      .get('/api/ranking/interno')
      .set('Cookie', visitante.cookie)
      .expect(403);
  });

  it('**un partido confirmado mueve la tabla**', async () => {
    await jugado(ana, beto, haceDias(10));

    const { posiciones } = await tabla(ana);
    const suyas = posiciones.filter((f) => f.nombre.includes(APELLIDO));

    expect(suyas.map((f) => [f.nombre, f.elo])).toEqual([
      [`ana ${APELLIDO}`, 1216],
      [`beto ${APELLIDO}`, 1184],
    ]);
  });

  it('**un pendiente no mueve nada**', async () => {
    // La regla que sostiene todo el ranking interno, comprobada desde la punta.
    await jugado(ana, beto, haceDias(10), EstadoPartidoInterno.PENDIENTE);

    const { posiciones, partidos } = await tabla(ana);

    expect(partidos).toBe(0);
    expect(posiciones.filter((f) => f.nombre.includes(APELLIDO))).toEqual([]);
  });

  it('un rechazado tampoco', async () => {
    await jugado(ana, beto, haceDias(10), EstadoPartidoInterno.RECHAZADO);

    expect((await tabla(ana)).partidos).toBe(0);
  });

  it('**dice hasta cuándo está contando**', async () => {
    // El par del corte de 52 semanas en la otra tabla: quien no ve su partido tiene
    // que poder saber si el sistema lo tomó o no.
    await jugado(ana, beto, haceDias(3));

    const respuesta = await tabla(ana);

    expect(respuesta.ultimoPartido).toBe(haceDias(3));
    expect(respuesta.partidos).toBe(1);
  });

  it('**y desde cuándo alguien cuenta como inactivo**', async () => {
    // Contra seis meses **escritos**, no contra la misma cuenta del servicio copiada
    // acá: si el corte se anuncia desde un lado y se aplica desde otro, los dos se
    // mueven juntos y nadie se entera. Es lo que pasó con el `hasta` de la otra tabla.
    const corte = new Date(hoyEnElClub());
    corte.setUTCMonth(corte.getUTCMonth() - 6);

    expect((await tabla(ana)).inactivosDesde).toBe(
      corte.toISOString().slice(0, 10),
    );
  });

  it('**el corte que anuncia es el que aplica**', async () => {
    // El par del anterior, y el que de verdad ataja la deriva: se pregunta por el día
    // que la propia respuesta declara como corte, y se comprueba que un partido de un
    // día antes deja a los dos fuera de la tabla principal.
    const { inactivosDesde } = await tabla(ana);
    const vispera = new Date(`${inactivosDesde}T00:00:00.000Z`);
    vispera.setUTCDate(vispera.getUTCDate() - 1);

    await jugado(ana, beto, vispera.toISOString().slice(0, 10));

    const suyas = (await tabla(ana)).posiciones.filter((f) =>
      f.nombre.includes(APELLIDO),
    );

    expect(suyas).toHaveLength(2);
    expect(suyas.every((f) => !f.activo)).toBe(true);
  });

  it('**quien no juega hace ocho meses sale de la tabla principal**', async () => {
    await jugado(ana, beto, haceDias(240));

    const suyas = (await tabla(ana)).posiciones.filter((f) =>
      f.nombre.includes(APELLIDO),
    );

    expect(suyas.every((f) => !f.activo)).toBe(true);
    // Con su Elo intacto: salir de la tabla no es perder lo ganado.
    expect(suyas.find((f) => f.nombre.startsWith('ana'))?.elo).toBe(1216);
  });

  it('sin partidos la tabla viene vacía, no rota', async () => {
    const respuesta = await tabla(ana);

    expect(respuesta.partidos).toBe(0);
    expect(respuesta.ultimoPartido).toBeNull();
  });

  it('**no publica el correo ni el teléfono de nadie**', async () => {
    await jugado(ana, beto, haceDias(5));

    const crudo = JSON.stringify(await tabla(ana));

    expect(crudo).not.toContain(DOMINIO);
    expect(crudo).not.toContain('email');
  });

  it('dos consultas seguidas dan exactamente lo mismo', async () => {
    // Elo es secuencial y se calcula al vuelo: si el orden dependiera de cómo la base
    // devuelve las filas, esto fallaría de a ratos. Es la razón de que el motor
    // reordene por su cuenta.
    await jugado(ana, beto, haceDias(20));
    await jugado(beto, ana, haceDias(20));

    expect(await tabla(ana)).toEqual(await tabla(ana));
  });
});
