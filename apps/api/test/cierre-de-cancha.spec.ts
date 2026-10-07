import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hoyEnElClub } from '../src/comun/tiempo';
import { EnviadorCorreo } from '../src/identidad/correo';
import { PasarelaFake } from '../src/pagos/adaptadores/pasarela.fake';
import { PasarelaPago } from '../src/pagos/pasarela.port';
import {
  ConceptoPago,
  EstadoReserva,
  EstadoSocio,
  EstadoTransaccion,
  MotivoBloqueo,
  Superficie,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T36: el club cierra una cancha que ya tiene horas tomadas.
 *
 * Lo que este archivo ataja es la problemática 2.3 del perfil de proyecto: el
 * cierre por riego o reparación se avisaba por WhatsApp y **los socios con la hora
 * comprometida se enteraban al llegar al club**.
 *
 * Las dos mitades que no se pueden fallar: que la hora no siga viva debajo de un
 * bloqueo —es la reserva a la que alguien llega y encuentra la cancha cerrada— y
 * que a quien pagó se le devuelva **todo**, sin la ventana de 24 horas, porque
 * canceló el club y no la persona.
 */
describe('POST /api/admin/cierres', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pasarela: PasarelaFake;
  let canchaId: number;
  let socioId: number;
  let cookieAdmin: string;
  let cookieSocio: string;

  const enviados: { para: string; asunto: string; cuerpo: string }[] = [];
  const correo = {
    enviar: (mensaje: { para: string; asunto: string; cuerpo: string }) => {
      enviados.push(mensaje);
      return Promise.resolve();
    },
  };

  const NOMBRE_CANCHA = 'Cancha en obras';
  const DOMINIO = '@cierre.ejemplo.cl';
  const CONTRASENA = 'una-contrasena-larga-2026';

  /** Pasado mañana: lejos de las 24 horas de reembolso, y del plazo de 6 para mover. */
  const enTresDias = () =>
    new Date(hoyEnElClub().getTime() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

  const crearCuenta = async (sufijo: string, esAdmin = false) => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({
        email: `${sufijo}${DOMINIO}`,
        contrasena: CONTRASENA,
        nombre: `Persona ${sufijo}`,
        apellido: 'Del cierre',
      });

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
      .send({ email: `${sufijo}${DOMINIO}`, contrasena: CONTRASENA });

    return (respuesta.headers['set-cookie'] as unknown as string[])[0];
  };

  const bloques = async () => {
    const respuesta = await request(app.getHttpServer()).get(
      `/api/disponibilidad?cancha=${canchaId}&fecha=${enTresDias()}`,
    );

    return respuesta.body as { inicio: string; fin: string }[];
  };

  /** El cierre, tal como lo manda el panel: fecha y horas del club. */
  const cierre = (horaDesde: string, horaHasta: string) => ({
    canchaId,
    fechaDesde: enTresDias(),
    horaDesde,
    fechaHasta: enTresDias(),
    horaHasta,
    motivo: MotivoBloqueo.MANTENCION,
    descripcion: 'Riego y resiembra',
  });

  /** Una reserva de visitante, pagada de verdad contra el doble de la pasarela. */
  const reservarYPagar = async (inicio: string) => {
    const inicioRespuesta = await request(app.getHttpServer())
      .post('/api/reservas/no-socio')
      .send({
        canchaId,
        inicio,
        nombre: 'Visitante Pagador',
        email: `pagador${DOMINIO}`,
        telefono: '+56900000000',
      })
      .expect(201);

    const reservaId = (inicioRespuesta.body as { reservaId: number }).reservaId;
    const transaccion = await prisma.transaccion.findFirstOrThrow({
      where: { concepto: 'RESERVA', conceptoId: reservaId },
      select: { tokenPasarela: true },
    });

    // El retorno redirige a la confirmación del navegador; lo que importa acá es que
    // la transacción quede autorizada.
    await request(app.getHttpServer())
      .get(`/api/reservas/retorno?token_ws=${transaccion.tokenPasarela!}`)
      .expect(302);

    return reservaId;
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasarelaPago)
      .useClass(PasarelaFake)
      .overrideProvider(EnviadorCorreo)
      .useValue(correo)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
    pasarela = app.get(PasarelaPago);
  });

  afterAll(async () => {
    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  beforeEach(async () => {
    pasarela.reiniciar();

    await prisma.cancha.deleteMany({
      where: { nombre: { startsWith: NOMBRE_CANCHA } },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });

    const cancha = await prisma.cancha.create({
      data: {
        nombre: NOMBRE_CANCHA,
        superficie: Superficie.ARCILLA,
        techada: false,
        iluminacion: true,
        activa: true,
        horarios: {
          create: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
            diaSemana,
            horaApertura: '08:00',
            horaCierre: '22:00',
          })),
        },
        franjas: {
          create: {
            horaDesde: '08:00',
            horaHasta: '22:00',
            montoClp: 12000,
            vigenteDesde: new Date('2026-01-01'),
          },
        },
      },
      select: { id: true },
    });

    canchaId = cancha.id;

    const usuarioSocio = await crearCuenta('socia');
    const socio = await prisma.socio.create({
      data: {
        usuarioId: usuarioSocio,
        numeroSocio: `CIERRE-${Date.now()}`,
        estado: EstadoSocio.ACTIVO,
        fechaIngreso: new Date('2026-01-01'),
        alDiaHasta: new Date('2027-01-01'),
      },
      select: { id: true },
    });
    socioId = socio.id;

    await crearCuenta('jefe', true);
    cookieAdmin = await entrar('jefe');
    cookieSocio = await entrar('socia');

    // Al final y no al principio: crear las cuentas manda correos de verificación, y
    // contándolos, "no salió ningún aviso" sería siempre falso.
    enviados.length = 0;
  });

  it('la simulación dice a quién afecta y no escribe nada', async () => {
    // El paso que hace que cancelar automáticamente no sea un descuido: el admin ve
    // la lista antes de confirmar.
    const horas = await bloques();
    await reservarYPagar(horas[0].inicio);

    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/cierres/simulacion')
      .set('Cookie', cookieAdmin)
      .send(cierre('08:00', '12:00'))
      .expect(200);

    const cuerpo = respuesta.body as {
      afectadas: { folio: string; nombre: string; pagada: boolean }[];
    };

    expect(cuerpo.afectadas).toHaveLength(1);
    expect(cuerpo.afectadas[0].nombre).toBe('Visitante Pagador');
    expect(cuerpo.afectadas[0].pagada).toBe(true);

    // Y no escribió: ni bloqueo ni cancelación.
    expect(await prisma.bloqueo.count({ where: { canchaId } })).toBe(0);
    const reserva = await prisma.reserva.findFirstOrThrow({
      where: { canchaId },
    });
    expect(reserva.estado).toBe(EstadoReserva.CONFIRMADA);
  });

  it('**cierra la cancha, cancela las dos reservas, devuelve lo pagado y avisa**', async () => {
    const horas = await bloques();
    const reservaPagada = await reservarYPagar(horas[0].inicio);
    // La hora siguiente, la que empieza cuando termina la primera. Por hora y no por
    // posición: desde T78 la grilla empieza cada media hora, y `horas[1]` se pisa con
    // `horas[0]`.
    const siguiente = horas.find((b) => b.inicio === horas[0].fin)!;

    await request(app.getHttpServer())
      .post('/api/reservas')
      .set('Cookie', cookieSocio)
      .send({
        canchaId,
        inicio: siguiente.inicio,
        acompanantes: [{ nombre: 'Invitada del cierre' }],
      })
      .expect(201);

    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/cierres')
      .set('Cookie', cookieAdmin)
      .send(cierre('08:00', '12:00'))
      .expect(201);

    expect(
      (respuesta.body as { canceladas: unknown[] }).canceladas,
    ).toHaveLength(2);

    const reservas = await prisma.reserva.findMany({ where: { canchaId } });
    expect(reservas).toHaveLength(2);
    expect(reservas.every((r) => r.estado === EstadoReserva.CANCELADA)).toBe(
      true,
    );

    // El bloqueo quedó puesto y la hora ya no se ofrece.
    expect(await prisma.bloqueo.count({ where: { canchaId } })).toBe(1);
    expect((await bloques())[0]).toMatchObject({ bloqueado: true });

    // La plata volvió: la transacción quedó ANULADA y la pasarela recibió la orden.
    const pago = await prisma.transaccion.findFirstOrThrow({
      where: { concepto: 'RESERVA', conceptoId: reservaPagada },
    });
    expect(pago.estado).toBe(EstadoTransaccion.ANULADA);
    expect(pasarela.anulaciones).toHaveLength(1);

    // Y los dos avisos salieron, que es el punto entero de la tarea.
    expect(enviados).toHaveLength(2);
    expect(enviados.map((c) => c.para)).toContain(`pagador${DOMINIO}`);
    expect(enviados.map((c) => c.para)).toContain(`socia${DOMINIO}`);
    expect(enviados[0].cuerpo).toContain(NOMBRE_CANCHA);
  });

  it('la devolución es total aunque falten menos de 24 horas', async () => {
    // Canceló el club, no la persona: cobrarle una hora que le quitaron es
    // indefendible, y la ventana de reembolso no se evalúa acá.
    const horas = await bloques();
    const reservaId = await reservarYPagar(horas[0].inicio);

    // La reserva se mueve a dentro de dos horas escribiendo directo, que es la única
    // forma de tener una hora inminente sin esperar tres días.
    const enDosHoras = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await prisma.reserva.update({
      where: { id: reservaId },
      data: {
        inicio: enDosHoras,
        fin: new Date(enDosHoras.getTime() + 60 * 60 * 1000),
      },
    });

    const hoy = hoyEnElClub().toISOString().slice(0, 10);
    await request(app.getHttpServer())
      .post('/api/admin/cierres')
      .set('Cookie', cookieAdmin)
      .send({
        canchaId,
        fechaDesde: hoy,
        horaDesde: '00:00',
        fechaHasta: enTresDias(),
        horaHasta: '23:00',
        motivo: MotivoBloqueo.MANTENCION,
        descripcion: 'Se rompió la red',
      })
      .expect(201);

    const pago = await prisma.transaccion.findFirstOrThrow({
      where: { concepto: 'RESERVA', conceptoId: reservaId },
    });
    expect(pago.estado).toBe(EstadoTransaccion.ANULADA);
    expect(pasarela.anulaciones).toHaveLength(1);
  });

  describe('con la diferencia pagada: dos pagos (T86)', () => {
    /** El segundo pago, el que cobrará T89 al alargar la reserva. */
    const conLaDiferenciaPagada = async (reservaId: number) => {
      const orden = await pasarela.iniciar({
        referencia: `T86-cierre-${reservaId}`,
        montoClp: 4000,
        urlRetorno: 'https://club.local/retorno',
      });
      await pasarela.confirmar(orden.tokenPasarela);

      const { inicio } = await prisma.reserva.findUniqueOrThrow({
        where: { id: reservaId },
      });
      await prisma.transaccion.create({
        data: {
          referencia: `T86-cierre-${reservaId}-${Date.now()}`,
          concepto: ConceptoPago.RESERVA,
          conceptoId: reservaId,
          montoClp: 4000,
          pasarela: 'doble',
          estado: EstadoTransaccion.AUTORIZADA,
          tokenPasarela: orden.tokenPasarela,
          inicioBloqueOriginal: inicio,
        },
      });
    };

    it('**cerrar la cancha anula los dos pagos**', async () => {
      const horas = await bloques();
      const reservaId = await reservarYPagar(horas[0].inicio);
      await conLaDiferenciaPagada(reservaId);

      await request(app.getHttpServer())
        .post('/api/admin/cierres')
        .set('Cookie', cookieAdmin)
        .send(cierre('08:00', '12:00'))
        .expect(201);

      const pagos = await prisma.transaccion.findMany({
        where: { concepto: ConceptoPago.RESERVA, conceptoId: reservaId },
      });
      expect(pagos.map((p) => p.estado)).toEqual([
        EstadoTransaccion.ANULADA,
        EstadoTransaccion.ANULADA,
      ]);
      expect(pasarela.anulaciones).toHaveLength(2);
    });

    it('si falla la segunda devolución, no cierra: ni bloqueo ni reserva cancelada', async () => {
      const horas = await bloques();
      const reservaId = await reservarYPagar(horas[0].inicio);
      await conLaDiferenciaPagada(reservaId);
      pasarela.fallarEnLaAnulacionNumero = 2;

      const respuesta = await request(app.getHttpServer())
        .post('/api/admin/cierres')
        .set('Cookie', cookieAdmin)
        .send(cierre('08:00', '12:00'));

      expect(respuesta.status).not.toBe(201);
      expect(await prisma.bloqueo.count({ where: { canchaId } })).toBe(0);
      expect(
        await prisma.reserva.findUniqueOrThrow({ where: { id: reservaId } }),
      ).toMatchObject({ estado: EstadoReserva.CONFIRMADA });
    });
  });

  it('el socio recupera su cupo del día y puede volver a reservar', async () => {
    const horas = await bloques();

    await request(app.getHttpServer())
      .post('/api/reservas')
      .set('Cookie', cookieSocio)
      .send({
        canchaId,
        inicio: horas[0].inicio,
        acompanantes: [{ nombre: 'Invitada del cierre' }],
      })
      .expect(201);

    // Con la hora tomada, la segunda del día se rechaza: es el cupo diario.
    await request(app.getHttpServer())
      .post('/api/reservas')
      .set('Cookie', cookieSocio)
      .send({
        canchaId,
        inicio: horas[5].inicio,
        acompanantes: [{ nombre: 'Invitada del cierre' }],
      })
      .expect(409);

    await request(app.getHttpServer())
      .post('/api/admin/cierres')
      .set('Cookie', cookieAdmin)
      .send(cierre('08:00', '10:00'))
      .expect(201);

    // Cerrada esa hora, el cupo volvió: la misma reserva que antes se rechazaba ahora
    // entra. Sin esto, el socio pierde la hora y además el día.
    await request(app.getHttpServer())
      .post('/api/reservas')
      .set('Cookie', cookieSocio)
      .send({
        canchaId,
        inicio: horas[5].inicio,
        acompanantes: [{ nombre: 'Invitada del cierre' }],
      })
      .expect(201);

    expect(socioId).toBeGreaterThan(0);
  });

  it('cada cancelación queda marcada con el bloqueo que la causó', async () => {
    // Para que el club pueda responder por qué un socio perdió su hora, y listar todo
    // lo que un cierre se llevó.
    const horas = await bloques();
    await reservarYPagar(horas[0].inicio);

    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/cierres')
      .set('Cookie', cookieAdmin)
      .send(cierre('08:00', '10:00'))
      .expect(201);

    const bloqueoId = (respuesta.body as { bloqueoId: number }).bloqueoId;
    const reserva = await prisma.reserva.findFirstOrThrow({
      where: { canchaId },
    });

    expect(reserva.canceladaPorBloqueoId).toBe(bloqueoId);
  });

  it('una hora fuera del rango no se toca', async () => {
    // Sin esto, la prueba de arriba pasaría igual cancelando la agenda entera.
    const horas = await bloques();
    await reservarYPagar(horas[0].inicio);

    await request(app.getHttpServer())
      .post('/api/admin/cierres')
      .set('Cookie', cookieAdmin)
      .send(cierre('14:00', '16:00'))
      .expect(201);

    const reserva = await prisma.reserva.findFirstOrThrow({
      where: { canchaId },
    });
    expect(reserva.estado).toBe(EstadoReserva.CONFIRMADA);
    expect(enviados).toHaveLength(0);
  });

  it('sin reservas debajo, cerrar es solo crear el bloqueo', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/cierres')
      .set('Cookie', cookieAdmin)
      .send(cierre('08:00', '10:00'))
      .expect(201);

    expect(await prisma.bloqueo.count({ where: { canchaId } })).toBe(1);
    expect(enviados).toHaveLength(0);
  });

  it('borrar el bloqueo no revive las reservas', async () => {
    // Esas horas quedaron libres y pudieron tomarse: revivirlas sería crear dos
    // reservas del mismo bloque. El club vuelve a llamar; el sistema le muestra a quién.
    const horas = await bloques();
    await reservarYPagar(horas[0].inicio);

    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/cierres')
      .set('Cookie', cookieAdmin)
      .send(cierre('08:00', '10:00'))
      .expect(201);

    await request(app.getHttpServer())
      .delete(
        `/api/admin/bloqueos/${(respuesta.body as { bloqueoId: number }).bloqueoId}`,
      )
      .set('Cookie', cookieAdmin)
      .expect(204);

    const reserva = await prisma.reserva.findFirstOrThrow({
      where: { canchaId },
    });
    expect(reserva.estado).toBe(EstadoReserva.CANCELADA);
  });

  it('si algo falla dentro de la transacción, no queda el bloqueo puesto', async () => {
    // El estado que esta operación existe para evitar: la cancha se ve cerrada y la
    // hora sigue viva a nombre de alguien, que llega y encuentra la cancha con
    // candado. Se fuerza el fallo **después** de que el callback corrió, que es lo
    // que distingue una transacción de dos escrituras seguidas.
    // La reserva es de socio y **sin pago**: la anulación también abre una
    // transacción, y con un pago encima el espía de abajo se consumiría ahí. El test
    // pasaría igual sin la transacción del cierre, que es la definición de un test
    // que no prueba nada.
    const horas = await bloques();
    await request(app.getHttpServer())
      .post('/api/reservas')
      .set('Cookie', cookieSocio)
      .send({
        canchaId,
        inicio: horas[0].inicio,
        acompanantes: [{ nombre: 'Invitada del cierre' }],
      })
      .expect(201);

    // El tipo de `$transaction` tiene dos sobrecargas y ninguna calza con envolver el
    // callback, así que el puente va acotado a estas dos líneas y con la forma que de
    // verdad usa el servicio: un callback que recibe el cliente de la transacción.
    type ConCallback = (
      callback: (tx: PrismaService) => Promise<unknown>,
    ) => Promise<unknown>;

    const real = prisma.$transaction.bind(prisma) as ConCallback;
    const espia = jest
      .spyOn(prisma, '$transaction')
      .mockImplementationOnce(
        (callback: (tx: PrismaService) => Promise<unknown>) =>
          real(async (tx) => {
            await callback(tx);
            throw new Error('la base se cayó a mitad del cierre');
          }),
      );

    await request(app.getHttpServer())
      .post('/api/admin/cierres')
      .set('Cookie', cookieAdmin)
      .send(cierre('08:00', '10:00'))
      .expect(500);

    espia.mockRestore();

    expect(await prisma.bloqueo.count({ where: { canchaId } })).toBe(0);
    const reserva = await prisma.reserva.findFirstOrThrow({
      where: { canchaId },
    });
    expect(reserva.estado).toBe(EstadoReserva.CONFIRMADA);
  });

  it('**no cierra sobre una hora con un pago en curso: la persona quedaría sin cancha y sin su plata**', async () => {
    // El agujero: si se cancela una reserva que está pagándose en Webpay, el callback
    // vuelve, autoriza el cobro, y el `updateMany` que la confirmaría no encuentra
    // nada porque ya está CANCELADA. Queda una transacción autorizada sin cancha y
    // sin devolución. Es el mismo motivo por el que `cancelar` tampoco lo permite.
    const horas = await bloques();
    await request(app.getHttpServer())
      .post('/api/reservas/no-socio')
      .send({
        canchaId,
        inicio: horas[0].inicio,
        nombre: 'Visitante A Medias',
        email: `medias${DOMINIO}`,
        telefono: '+56900000000',
      })
      .expect(201);

    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/cierres')
      .set('Cookie', cookieAdmin)
      .send(cierre('08:00', '10:00'))
      .expect(409);

    expect((respuesta.body as { motivo: string }).motivo).toBe('PAGO_EN_CURSO');
    expect((respuesta.body as { message: string }).message).toContain(
      '15 minutos',
    );

    // Y no cerró nada: ni bloqueo ni cancelación.
    expect(await prisma.bloqueo.count({ where: { canchaId } })).toBe(0);
    const reserva = await prisma.reserva.findFirstOrThrow({
      where: { canchaId },
    });
    expect(reserva.estado).toBe(EstadoReserva.PENDIENTE_PAGO);
  });

  it('la simulación avisa del pago en curso antes de que el admin lo intente', async () => {
    const horas = await bloques();
    await request(app.getHttpServer())
      .post('/api/reservas/no-socio')
      .send({
        canchaId,
        inicio: horas[0].inicio,
        nombre: 'Visitante A Medias',
        email: `medias${DOMINIO}`,
        telefono: '+56900000000',
      })
      .expect(201);

    const respuesta = await request(app.getHttpServer())
      .post('/api/admin/cierres/simulacion')
      .set('Cookie', cookieAdmin)
      .send(cierre('08:00', '10:00'))
      .expect(200);

    const cuerpo = respuesta.body as {
      afectadas: { pagoEnCurso: boolean }[];
    };

    expect(cuerpo.afectadas[0].pagoEnCurso).toBe(true);
  });

  it('solo el admin cierra una cancha', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/cierres')
      .set('Cookie', cookieSocio)
      .send(cierre('08:00', '10:00'))
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/admin/cierres/simulacion')
      .send(cierre('08:00', '10:00'))
      .expect(401);
  });
});
