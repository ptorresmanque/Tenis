import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  EstadoSocio,
  EstadoTorneo,
  Superficie,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T49: las tres entidades base de los torneos.
 *
 * **El jugador no es el socio**, y esa es la decisión que da forma al módulo. Un socio
 * que juega dos torneos es **un** jugador, y un externo que se hace socio conserva el
 * suyo: los puntos cuelgan del jugador, así que enlazarlo a su ficha nueva no puede
 * significar empezar de cero.
 */
describe('Torneos: jugadores, categorías y torneos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookieAdmin: string;
  let cookieSocio: string;
  let socioId: number;

  const DOMINIO = '@torneos.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';
  const MARCA = 'Copa de prueba';

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'Del torneo',
      })
      // Exigir el 201 y no ignorar la respuesta: si el registro falla, el error se ve
      // acá y no tres líneas después, en un `update` que no encuentra la fila.
      .expect(201);

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
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA })
      // El login responde 204: la sesión viaja en la cookie, no en el cuerpo.
      .expect(204);

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  interface JugadorPublicado {
    id: number;
    nombre: string;
    apellido: string;
    telefono: string | null;
    socioId: number | null;
    numeroSocio: string | null;
    activo: boolean;
  }

  const crearJugador = (cuerpo: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/admin/jugadores')
      .set('Cookie', cookieAdmin)
      .send(cuerpo);

  const jugadorDe = (respuesta: { body: unknown }) =>
    respuesta.body as JugadorPublicado;

  const categoria = async (nombre = 'Club 250', puntosCampeon = 250) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/categorias-torneo')
      .set('Cookie', cookieAdmin)
      .send({ nombre, puntosCampeon })
      .expect(201);

    return (respuesta.body as { id: number }).id;
  };

  const unTorneo = (extra: Record<string, unknown> = {}) => ({
    nombre: `${MARCA} de verano`,
    superficie: Superficie.ARCILLA,
    fechaInicio: '2026-12-01',
    fechaFin: '2026-12-07',
    cierreInscripcion: '2026-11-25',
    ...extra,
  });

  const crearTorneo = (extra: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/admin/torneos')
      .set('Cookie', cookieAdmin)
      .send(unTorneo(extra));

  const limpiar = async () => {
    await prisma.torneo.deleteMany({
      where: { nombre: { startsWith: MARCA } },
    });
    await prisma.jugador.deleteMany({
      where: { apellido: { in: ['Del torneo', 'Externo', 'Cambiado'] } },
    });
    await prisma.categoriaTorneo.deleteMany({
      where: { nombre: { startsWith: 'Club' } },
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

    await crearCuenta('jefe', true);
    cookieAdmin = await entrar('jefe');

    const usuarioSocio = await crearCuenta('socia');
    const socio = await prisma.socio.create({
      data: {
        usuarioId: usuarioSocio,
        numeroSocio: `TOR-${Date.now()}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2020-01-01T00:00:00.000Z'),
        alDiaHasta: new Date('2027-01-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    socioId = socio.id;
    cookieSocio = await entrar('socia');
  });

  it('el club anota a un jugador de afuera con su nombre y su teléfono', async () => {
    const respuesta = await crearJugador({
      nombre: 'Rodrigo',
      apellido: 'Externo',
      telefono: '+56911112222',
    });

    expect(respuesta.status).toBe(201);
    expect(jugadorDe(respuesta)).toMatchObject({
      nombre: 'Rodrigo',
      apellido: 'Externo',
      socioId: null,
    });
  });

  it('**el mismo socio en dos torneos usa un solo jugador**', async () => {
    // Es la razón de que `Jugador` exista: sin reutilizar, el ranking suma los puntos
    // de la misma persona en dos filas distintas.
    const primera = await crearJugador({ socioId }).expect(201);
    const segunda = await crearJugador({ socioId }).expect(201);

    expect(jugadorDe(segunda).id).toBe(jugadorDe(primera).id);
    expect(await prisma.jugador.count({ where: { socioId } })).toBe(1);
  });

  it('el jugador de un socio se nombra con su ficha, no a mano', async () => {
    const respuesta = await crearJugador({ socioId }).expect(201);

    expect(jugadorDe(respuesta)).toMatchObject({
      nombre: 'Persona socia',
      apellido: 'Del torneo',
      socioId,
    });
    // El número real y no solo "no nulo": comparar contra `null` deja pasar un
    // `undefined`, que es lo que devuelve un campo que la API nunca mandó.
    const socio = await prisma.socio.findUniqueOrThrow({
      where: { id: socioId },
    });
    expect(jugadorDe(respuesta).numeroSocio).toBe(socio.numeroSocio);
  });

  it('sin nombre y sin socio no hay jugador', async () => {
    await crearJugador({}).expect(400);
    await crearJugador({ nombre: 'Solo nombre' }).expect(400);
  });

  it('**enlazar un externo a su ficha de socio conserva su jugador**', async () => {
    // Los puntos cuelgan del jugador. Si enlazar creara una fila nueva, el que se
    // hace socio empezaría de cero y su historia quedaría a nombre de un fantasma.
    const externo = jugadorDe(
      await crearJugador({ nombre: 'Rodrigo', apellido: 'Externo' }).expect(
        201,
      ),
    );

    const respuesta = await request(app.getHttpServer())
      .patch(`/api/admin/jugadores/${externo.id}`)
      .set('Cookie', cookieAdmin)
      .send({ socioId })
      .expect(200);

    expect(jugadorDe(respuesta).id).toBe(externo.id);
    expect(await prisma.jugador.count({ where: { socioId } })).toBe(1);
  });

  it('un socio que ya tiene jugador no acepta un segundo enlace', async () => {
    await crearJugador({ socioId }).expect(201);
    const otro = jugadorDe(
      await crearJugador({ nombre: 'Otro', apellido: 'Externo' }).expect(201),
    );

    await request(app.getHttpServer())
      .patch(`/api/admin/jugadores/${otro.id}`)
      .set('Cookie', cookieAdmin)
      .send({ socioId })
      .expect(409);
  });

  it('editar un jugador cambia lo que se muestra, no quién es', async () => {
    const jugador = jugadorDe(
      await crearJugador({ nombre: 'Rodrigo', apellido: 'Externo' }).expect(
        201,
      ),
    );

    await request(app.getHttpServer())
      .patch(`/api/admin/jugadores/${jugador.id}`)
      .set('Cookie', cookieAdmin)
      .send({ apellido: 'Cambiado', telefono: '+56999998888' })
      .expect(200);

    const guardado = await prisma.jugador.findUniqueOrThrow({
      where: { id: jugador.id },
    });
    expect(guardado.apellido).toBe('Cambiado');
    expect(guardado.nombre).toBe('Rodrigo');
  });

  it('la categoría lleva los puntos del campeón, que es para lo que existe', async () => {
    const id = await categoria('Club 500', 500);

    const guardada = await prisma.categoriaTorneo.findUniqueOrThrow({
      where: { id },
    });
    expect(guardada.puntosCampeon).toBe(500);
    expect(guardada.activa).toBe(true);
  });

  it('dos categorías con el mismo nombre se rechazan', async () => {
    await categoria('Club 1000', 1000);

    await request(app.getHttpServer())
      .post('/api/admin/categorias-torneo')
      .set('Cookie', cookieAdmin)
      .send({ nombre: 'Club 1000', puntosCampeon: 900 })
      .expect(409);
  });

  it('una categoría sin puntos o con puntos negativos se rechaza', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/categorias-torneo')
      .set('Cookie', cookieAdmin)
      .send({ nombre: 'Club sin puntos' })
      .expect(400);

    const negativo = await request(app.getHttpServer())
      .post('/api/admin/categorias-torneo')
      .set('Cookie', cookieAdmin)
      .send({ nombre: 'Club negativo', puntosCampeon: -1 })
      .expect(400);

    // Con el sujeto en singular, como el verbo que pone `entero`.
    expect((negativo.body as { message: string }).message).toBe(
      'El puntaje del campeón tiene que ser un número entero desde 1.',
    );
  });

  it('el torneo nace en inscripción, que es lo único que se puede hacer con él', async () => {
    const respuesta = await crearTorneo();

    expect(respuesta.status).toBe(201);
    expect((respuesta.body as { estado: string }).estado).toBe(
      EstadoTorneo.INSCRIPCION,
    );
  });

  it('**un torneo que termina antes de empezar se rechaza**', async () => {
    const respuesta = await crearTorneo({
      fechaInicio: '2026-12-07',
      fechaFin: '2026-12-01',
    });

    expect(respuesta.status).toBe(400);
  });

  it('**la inscripción no puede cerrar después de que el torneo empieza**', async () => {
    // Sería aceptar gente para un cuadro que ya está jugándose.
    const respuesta = await crearTorneo({ cierreInscripcion: '2026-12-03' });

    expect(respuesta.status).toBe(400);
  });

  it('**el alta del torneo ya no lleva cupo**', async () => {
    // T62: el cupo es de cada cuadro, porque Honor cierra con 8 y la 4ª con 32. Un
    // `cupo` en el cuerpo del torneo se ignora en vez de guardarse en ningún lado.
    const respuesta = await crearTorneo({ cupo: 12 });

    expect(respuesta.status).toBe(201);
  });

  it('editar el torneo cambia sus fechas', async () => {
    const torneo = (await crearTorneo()).body as { id: number };

    await request(app.getHttpServer())
      .patch(`/api/admin/torneos/${torneo.id}`)
      .set('Cookie', cookieAdmin)
      .send({
        fechaInicio: '2027-01-10',
        fechaFin: '2027-01-17',
        cierreInscripcion: '2027-01-05',
      })
      .expect(200);

    const guardado = await prisma.torneo.findUniqueOrThrow({
      where: { id: torneo.id },
    });
    expect(guardado.fechaInicio.toISOString()).toContain('2027-01-10');
  });

  it('**la lista trae cuánto vale cada cuadro** (T70), sin ir a buscarlo', async () => {
    // Desde T70 el valor es del cuadro y no del torneo: en el mismo fin de semana,
    // ganar Honor puede valer el doble que ganar la 5ª, y el panel lo muestra por
    // cuadro. Un torneo sin cuadros todavía no vale nada, y eso también es correcto.
    const creado = await crearTorneo().expect(201);
    const torneoId = (creado.body as { id: number }).id;
    const categoriaId = await categoria(`Club ${Date.now() % 100000}`);
    const cuartaId = (
      await prisma.categoriaJuego.findFirstOrThrow({ where: { nombre: '4ª' } })
    ).id;

    await request(app.getHttpServer())
      .post(`/api/admin/torneos/${torneoId}/categorias`)
      .set('Cookie', cookieAdmin)
      .send({ categoriaJuegoId: cuartaId, categoriaId, cupo: 8 })
      .expect(201);

    const respuesta = await request(app.getHttpServer())
      .get('/api/admin/torneos')
      .set('Cookie', cookieAdmin)
      .expect(200);

    const torneos = respuesta.body as {
      nombre: string;
      cuadros: { valor: string; puntosCampeon: number }[];
    }[];
    const suyo = torneos.find((t) => t.nombre.startsWith(MARCA));

    expect(suyo?.cuadros[0].valor).toBeTruthy();
    expect(suyo?.cuadros[0].puntosCampeon).toBeGreaterThan(0);
  });

  it('**las fechas del torneo salen como fecha civil, no como instante**', async () => {
    // Son columnas `DATE`: un torneo empieza un día, no a una hora. Mandarlas con
    // hora invita a que la pantalla les pegue otra encima y muestre el día anterior.
    await crearTorneo();

    const respuesta = await request(app.getHttpServer())
      .get('/api/admin/torneos')
      .set('Cookie', cookieAdmin)
      .expect(200);

    const suyo = (
      respuesta.body as { nombre: string; fechaInicio: string }[]
    ).find((t) => t.nombre.startsWith(MARCA));
    expect(suyo?.fechaInicio).toBe('2026-12-01');
  });

  it('**cambiar solo el nombre no obliga a repetir las tres fechas**', async () => {
    // Antes, editar reusaba el lector del alta y le inventaba nombre y categoría al
    // cuerpo para pasar por validaciones que no eran las suyas.
    const torneo = (await crearTorneo()).body as { id: number };

    await request(app.getHttpServer())
      .patch(`/api/admin/torneos/${torneo.id}`)
      .set('Cookie', cookieAdmin)
      .send({ nombre: `${MARCA} renombrada` })
      .expect(200);
  });

  it('**cambiar una sola fecha exige las tres: si no, el torneo queda al revés**', async () => {
    // Comprobar una contra las guardadas deja llegar a "termina antes de empezar" en
    // dos pasos que por separado se ven bien.
    const torneo = (await crearTorneo()).body as { id: number };

    await request(app.getHttpServer())
      .patch(`/api/admin/torneos/${torneo.id}`)
      .set('Cookie', cookieAdmin)
      .send({ fechaFin: '2026-11-01' })
      .expect(400);
  });

  it('desactivar una categoría no obliga a repetir sus puntos', async () => {
    const id = await categoria('Club por desactivar', 300);

    await request(app.getHttpServer())
      .patch(`/api/admin/categorias-torneo/${id}`)
      .set('Cookie', cookieAdmin)
      .send({ activa: false })
      .expect(200);

    const guardada = await prisma.categoriaTorneo.findUniqueOrThrow({
      where: { id },
    });
    expect(guardada.activa).toBe(false);
    expect(guardada.puntosCampeon).toBe(300);
  });

  /**
   * **Cancelar un torneo.**
   *
   * `CANCELADO` existía en el enum y cuatro lugares del sistema reaccionaban a él —no
   * deja inscribirse, ni armar cuadro, ni cargar resultados, y lo esconde del
   * calendario público— pero **nada podía ponerlo**: era un estado inalcanzable. Lo
   * encontró el club buscando el botón en el panel.
   */
  describe('cancelar un torneo', () => {
    const cancelar = (id: number, cookie = cookieAdmin) =>
      request(app.getHttpServer())
        .post(`/api/admin/torneos/${id}/cancelacion`)
        .set('Cookie', cookie);

    const reactivar = (id: number) =>
      request(app.getHttpServer())
        .delete(`/api/admin/torneos/${id}/cancelacion`)
        .set('Cookie', cookieAdmin);

    const nuevo = async () =>
      ((await crearTorneo().expect(201)).body as { id: number }).id;

    it('lo deja cancelado y fuera del calendario público', async () => {
      const id = await nuevo();

      await cancelar(id).expect(201);

      const publicos = await request(app.getHttpServer())
        .get('/api/torneos/publicos?anio=2026')
        .expect(200);
      expect(
        (publicos.body as { id: number }[]).some((t) => t.id === id),
      ).toBe(false);
    });

    it('**y desde ahí nadie se inscribe**, que es de lo que servía el estado', async () => {
      const id = await nuevo();
      const categoriaJuego = await prisma.categoriaJuego.findFirstOrThrow();
      const categoria = await prisma.categoriaTorneo.create({
        data: { nombre: `Club cancelado ${Date.now()}`, puntosCampeon: 250 },
      });
      const cuadro = await prisma.torneoCategoria.create({
        data: {
          torneoId: id,
          categoriaJuegoId: categoriaJuego.id,
          categoriaId: categoria.id,
          cupo: 8,
        },
      });
      const jugador = await prisma.jugador.create({
        data: { nombre: 'Quedó', apellido: 'Del torneo' },
      });

      await cancelar(id).expect(201);

      const rechazada = await request(app.getHttpServer())
        .post(`/api/admin/cuadros/${cuadro.id}/inscripciones`)
        .set('Cookie', cookieAdmin)
        .send({ jugadorId: jugador.id })
        .expect(409);
      expect((rechazada.body as { message: string }).message).toContain(
        'cancelado',
      );
    });

    it('**deshacerlo lo devuelve a inscripción**: un clic no puede ser definitivo', async () => {
      const id = await nuevo();
      await cancelar(id).expect(201);

      const vuelto = await reactivar(id).expect(200);

      expect((vuelto.body as { estado: string }).estado).toBe('INSCRIPCION');
    });

    it('un torneo que ya se jugó no se cancela: sería rehacer la historia', async () => {
      const id = await nuevo();
      await prisma.torneo.update({
        where: { id },
        data: { estado: EstadoTorneo.FINALIZADO },
      });

      const rechazo = await cancelar(id).expect(409);

      expect((rechazo.body as { message: string }).message).toContain(
        'ya se jugó',
      );
    });

    it('reactivar uno que no está cancelado no hace nada raro', async () => {
      const id = await nuevo();

      await reactivar(id).expect(409);
    });

    it('un torneo que no existe responde 404', async () => {
      await cancelar(999999).expect(404);
    });

    it('**solo el admin cancela**', async () => {
      const id = await nuevo();

      await cancelar(id, cookieSocio).expect(403);
    });
  });

  it('solo el admin toca jugadores, categorías y torneos', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/jugadores')
      .set('Cookie', cookieSocio)
      .send({ nombre: 'Colado', apellido: 'Externo' })
      .expect(403);

    await request(app.getHttpServer()).get('/api/admin/torneos').expect(401);
  });
});