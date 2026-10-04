import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { DuracionMin } from '../catalogo-canchas/bloques';
import { DisponibilidadService } from '../catalogo-canchas/disponibilidad.service';
import { hoyEnElClub, minutosDeRelojEntre } from '../comun/tiempo';
import {
  EstadoReserva,
  EstadoTransaccion,
  Reserva,
} from '../generated/prisma/client';
import { UsuarioActual } from '../identidad/usuario-actual';
import { AnulacionService } from '../pagos/anulacion.service';
import {
  esViolacionDeUnicidad,
  reintentarSiHayDeadlock,
} from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import { EventosDeReserva } from './eventos';
import { BloqueTomado, ReservaRepository } from './reserva.repository';
import {
  ACTIVAS,
  ClienteDePrisma,
  rechazarSiYaPaso,
  ReservasService,
} from './reservas.service';
import { correspondeReembolso, sePuedeModificar } from './ventanas';

/** Una reserva propia, con lo que la pantalla necesita para decidir qué ofrecer. */
export interface ReservaMia {
  id: number;
  folio: string;
  cancha: string;
  inicio: Date;
  fin: Date;
  estado: EstadoReserva;
  esPico: boolean;
  /** Hubo un pago autorizado detrás. El socio reserva sin pagar. */
  pagada: boolean;
  sePuedeModificar: boolean;
  /** Si cancelar ahora devuelve el dinero. Falso también cuando no hay nada que devolver. */
  devolucionAlCancelar: boolean;
}

export interface ReservaCancelada {
  folio: string;
  /** Si se devolvió el dinero. Falso también cuando no había nada que devolver. */
  huboDevolucion: boolean;
  /** Por qué no hubo devolución, para explicárselo a quien canceló. */
  motivo: string | null;
}

@Injectable()
export class ModificacionService {
  private readonly log = new Logger('Reservas');

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: DisponibilidadService,
    private readonly reservas: ReservaRepository,
    private readonly anulacion: AnulacionService,
    private readonly eventos: EventosDeReserva,
    private readonly reservasDeSocio: ReservasService,
  ) {}

  /**
   * Las reservas próximas del socio, con las dos ventanas ya resueltas.
   *
   * Los flags vienen calculados y no se dejan para el navegador: si `devolucionAlCancelar`
   * lo decidiera la pantalla, cambiar la ventana en `ConfiguracionClub` dejaría a la web
   * prometiendo una devolución que el servidor ya no hace.
   */
  async mias(yo: UsuarioActual, ahora = new Date()): Promise<ReservaMia[]> {
    // Un usuario sin ficha de socio tiene `socioId` nulo, igual que las reservas de
    // los visitantes: sin este corte, filtrar por `socioId` le entregaría las de todos.
    if (yo.socioId === null) return [];

    const reservas = await this.prisma.reserva.findMany({
      where: {
        socioId: yo.socioId,
        estado: { in: ACTIVAS },
        // Por `fin` y no por `inicio`: la hora que se está jugando en este momento
        // sigue siendo suya, y filtrando por el inicio desaparecería de la pantalla
        // justo cuando la persona la está mostrando en el mesón. Las que ya
        // terminaron siguen en la base para el historial; acá solo estorban.
        fin: { gt: ahora },
      },
      orderBy: { inicio: 'asc' },
      select: {
        id: true,
        folio: true,
        inicio: true,
        fin: true,
        estado: true,
        esPico: true,
        cancha: { select: { nombre: true } },
      },
    });

    if (reservas.length === 0) return [];

    const ventanas = await this.prisma.configuracionClub.findFirstOrThrow();
    // Una sola consulta para toda la lista: una por reserva sería un N+1 que crece con
    // cada hora que el socio tenga tomada.
    const pagos = await this.prisma.transaccion.findMany({
      where: {
        concepto: 'RESERVA',
        conceptoId: { in: reservas.map((reserva) => reserva.id) },
        estado: EstadoTransaccion.AUTORIZADA,
      },
      select: { conceptoId: true, inicioBloqueOriginal: true },
    });

    return reservas.map((reserva) => {
      const pago = pagos.find((p) => p.conceptoId === reserva.id);

      return {
        id: reserva.id,
        folio: reserva.folio,
        cancha: reserva.cancha.nombre,
        inicio: reserva.inicio,
        fin: reserva.fin,
        estado: reserva.estado,
        esPico: reserva.esPico,
        pagada: pago !== undefined,
        sePuedeModificar: sePuedeModificar(reserva.inicio, ahora, ventanas),
        devolucionAlCancelar:
          pago !== undefined &&
          // El bloque comprado, no el reagendado: la misma medida que usa `cancelar`.
          correspondeReembolso(
            pago.inicioBloqueOriginal ?? reserva.inicio,
            ahora,
            ventanas,
          ),
      };
    });
  }

  /**
   * Mueve la reserva a otro bloque.
   *
   * El bloque nuevo compite contra el índice único como cualquier reserva: si alguien
   * lo tomó en el intermedio, esto falla y la reserva se queda donde estaba.
   */
  async modificar(
    reservaId: number,
    destino: { canchaId: number; inicio: Date },
    yo: UsuarioActual,
    ahora = new Date(),
  ): Promise<Reserva> {
    const reserva = await this.suya(reservaId, yo);
    const ventanas = await this.prisma.configuracionClub.findFirstOrThrow();

    if (!sePuedeModificar(reserva.inicio, ahora, ventanas)) {
      throw new ConflictException({
        motivo: 'FUERA_DE_PLAZO',
        message:
          `Las reservas se pueden mover hasta ${ventanas.horasMinModificacion} horas ` +
          'antes. Para esta ya pasó ese plazo.',
      });
    }

    // Mover conserva la duración (T82): el destino se busca en la grilla de lo que dura
    // la reserva. Elegir otra duración al mover llega con T87.
    const bloque = await this.bloqueDisponible(
      destino.canchaId,
      destino.inicio,
      duracionDe(reserva),
      ahora,
    );

    await this.exigirQueLaTarifaCuadre(reserva.id, bloque.montoClp);

    try {
      const movida = await this.moverContraSusCupos(reserva, destino, bloque);

      // Después de que la transacción cerró, no adentro: si el movimiento termina en
      // rollback, el panel ya habría corrido a pedir un día que no cambió.
      //
      // Los dos días cambian: la hora se fue de uno y llegó al otro.
      this.eventos.cambio(reserva.inicio);
      this.eventos.cambio(movida.inicio);

      return movida;
    } catch (error) {
      if (esBloqueOcupado(error)) {
        throw new ConflictException({
          motivo: 'BLOQUE_TOMADO',
          message: 'Esa hora la acaban de tomar. Elige otra.',
        });
      }

      throw error;
    }
  }

  /**
   * Cancela y devuelve la plata si corresponde.
   *
   * **La ventana de reembolso se mide contra `inicioBloqueOriginal`**, el bloque que
   * se compró, no contra el reagendado. Sin eso, mover la reserva a la semana
   * siguiente y cancelar acto seguido cobraría una devolución que no correspondía.
   */
  async cancelar(
    reservaId: number,
    yo: UsuarioActual,
    ahora = new Date(),
  ): Promise<ReservaCancelada> {
    const reserva = await this.suya(reservaId, yo);
    const ventanas = await this.prisma.configuracionClub.findFirstOrThrow();

    await this.exigirQueNoHayaPagoEnCurso(reserva.id);

    const pago = await this.prisma.transaccion.findFirst({
      where: {
        concepto: 'RESERVA',
        conceptoId: reserva.id,
        estado: EstadoTransaccion.AUTORIZADA,
      },
      select: { id: true, inicioBloqueOriginal: true },
    });

    // El bloque que se compró y no el reagendado: sin esa distinción, mover la
    // reserva a la semana siguiente y cancelar acto seguido cobraría una devolución
    // que no correspondía (`SPEC-pagos.md` § Reembolso).
    const devolver =
      pago !== null &&
      correspondeReembolso(
        pago.inicioBloqueOriginal ?? reserva.inicio,
        ahora,
        ventanas,
      );

    // **Primero la plata, después el estado**, el mismo orden que T19 fijó para
    // anular. Al revés, una pasarela caída dejaría la reserva CANCELADA sin
    // devolución, y el reintento respondería "ya estaba cancelada": la persona se
    // queda sin cancha y sin su dinero.
    if (devolver) await this.anulacion.anular(pago.id);

    if (!(await this.reservas.cancelar(reserva.id))) {
      throw new ConflictException({
        motivo: 'YA_NO_ESTA_ACTIVA',
        message: 'Esa reserva ya estaba cancelada.',
      });
    }

    if (devolver) {
      this.log.log(`Reserva ${reserva.folio} cancelada con devolución.`);
      return { folio: reserva.folio, huboDevolucion: true, motivo: null };
    }

    return {
      folio: reserva.folio,
      huboDevolucion: false,
      // El socio no paga por reservar: cancelar le devuelve el cupo, no plata.
      motivo: pago
        ? `Las devoluciones son con ${ventanas.horasReembolsoTotal} horas o más de anticipación.`
        : 'sin_pago',
    };
  }

  /**
   * Escribe el movimiento, evaluando los cupos del socio bajo el mismo cerrojo.
   *
   * **Mover necesita el lock igual que reservar**: dos peticiones del socio hacia el
   * mismo día se excluyen cada una a sí misma, cuentan cero y pasan las dos. El índice
   * único no lo atrapa, porque son bloques distintos.
   *
   * La reserva del visitante no tiene cupos ni ficha que bloquear: se escribe directo.
   */
  private async moverContraSusCupos(
    reserva: Reserva,
    destino: { canchaId: number },
    bloque: { inicio: Date; fin: Date; esPico: boolean },
  ): Promise<Reserva> {
    const escribir = (db: ClienteDePrisma) =>
      db.reserva.update({
        where: { id: reserva.id },
        data: {
          canchaId: destino.canchaId,
          inicio: bloque.inicio,
          fin: bloque.fin,
          // El pico se recongela con el bloque nuevo: es la categoría de la hora que
          // se va a jugar, y de ella depende el cupo semanal del socio.
          esPico: bloque.esPico,
        },
      });

    if (reserva.socioId === null) {
      return reintentarSiHayDeadlock(() => escribir(this.prisma));
    }

    return this.reservasDeSocio.conElSocioBloqueado(
      reserva.socioId,
      async (tx) => {
        await this.exigirQueLosCuposAlcancen(reserva, bloque, tx);

        return escribir(tx);
      },
    );
  }

  /**
   * Mover es reservar otra vez: los cupos del socio se vuelven a mirar.
   *
   * Sin esto, mover es la puerta de atrás de todas las reglas. Se toma una hora valle
   * —que pasa el cupo pico— y se la lleva a un bloque pico; se toma una hora de un mes
   * y se la lleva a otro con el invitado puesto; y quien quedó moroso después de
   * reservar sigue acomodando su hora como si estuviera al día.
   *
   * Las reservas de visitante no tienen cupos que mirar: pagaron su hora.
   */
  private async exigirQueLosCuposAlcancen(
    reserva: Reserva,
    bloque: { inicio: Date; fin: Date; esPico: boolean },
    tx: ClienteDePrisma,
  ): Promise<void> {
    if (reserva.socioId === null) return;

    const socio = await this.prisma.socio.findUniqueOrThrow({
      where: { id: reserva.socioId },
      select: {
        id: true,
        estado: true,
        alDiaHasta: true,
        sancionadoHasta: true,
      },
    });
    const acompanantes = await this.prisma.acompananteReserva.findMany({
      where: { reservaId: reserva.id },
      select: { socioId: true, nombre: true },
    });

    const rechazo = await this.reservasDeSocio.evaluarParaSocio({
      socio,
      bloque,
      acompanantes,
      // Dentro del cerrojo: con el cliente de fuera contaría lo de antes de que la
      // otra petición del socio escribiera, que es justo lo que hay que evitar.
      db: tx,
      // La reserva que se mueve no se cuenta a sí misma: si lo hiciera, el cupo diario
      // de una hora impediría cambiar de horario dentro del mismo día.
      excluyendo: reserva.id,
    });

    // **Declarar con quién juega es una regla de reservar, no de mover.** Los
    // acompañantes de esta reserva son los que ya están y no cambian al cambiar la
    // hora; exigirlos acá dejaría inmóvil para siempre a cualquier reserva anotada por
    // el club a mano, que es justo la que más suele necesitar un cambio de horario.
    if (rechazo?.tipo === 'SIN_ACOMPANANTE') return;

    if (rechazo) {
      throw new ConflictException({
        motivo: rechazo.tipo,
        message: rechazo.mensaje,
      });
    }
  }

  /**
   * Una hora ya pagada solo se mueve a otra que valga lo mismo.
   *
   * Sin esta regla, mover de una franja valle a una pico entrega una hora de $20.000
   * al precio de una de $12.000, y si después se cancela dentro de plazo se devuelven
   * los $12.000 por algo que se vendía más caro.
   *
   * **Se rechaza en vez de cobrar la diferencia**: cobrar de nuevo es otro paso por la
   * pasarela, con su retorno, su idempotencia y su reembolso parcial —que el club no
   * tiene, porque `SPEC-pagos.md` solo admite devolución total—. Cancelar y reservar
   * de nuevo hace lo mismo con las piezas que ya existen.
   */
  private async exigirQueLaTarifaCuadre(
    reservaId: number,
    montoDelBloque: number | null,
  ): Promise<void> {
    const pago = await this.prisma.transaccion.findFirst({
      where: {
        concepto: 'RESERVA',
        conceptoId: reservaId,
        estado: EstadoTransaccion.AUTORIZADA,
      },
      select: { montoClp: true },
    });

    // El socio no compra su hora, la descuenta de su cupo: no hay nada que cuadrar.
    if (!pago || pago.montoClp === montoDelBloque) return;

    if (montoDelBloque === null) {
      // La hora y media en una franja que no la vende (T79): para quien paga, esa hora
      // no existe, igual que al reservar.
      throw new ConflictException({
        motivo: 'SIN_TARIFA',
        message: 'Esa duración no se vende en ese horario.',
      });
    }

    throw new ConflictException({
      motivo: 'CAMBIA_LA_TARIFA',
      message:
        `Esa hora vale ${enPesos(montoDelBloque)} y esta reserva se pagó ` +
        `${enPesos(pago.montoClp)}. Para cambiar de tarifa hay que cancelar y ` +
        'reservar de nuevo.',
    });
  }

  /**
   * Nada de cancelar mientras alguien está pagando esa hora.
   *
   * La reserva quedaría CANCELADA con su transacción viva, y el pago que llega después
   * se autoriza igual: el `updateMany` de la confirmación no encuentra ninguna fila
   * `PENDIENTE_PAGO` que actualizar, pero el cobro ya ocurrió y la pantalla le dice
   * "Reserva confirmada". Queda cobrado, sin cancha y creyendo que la tiene.
   *
   * No hace falta resolverlo a mano: si el pago no se completa, el barrido de T19
   * expira la transacción y con ella la reserva, y la hora vuelve a la grilla sola.
   */
  private async exigirQueNoHayaPagoEnCurso(reservaId: number): Promise<void> {
    const enCurso = await this.prisma.transaccion.count({
      where: {
        concepto: 'RESERVA',
        conceptoId: reservaId,
        estado: EstadoTransaccion.PENDIENTE,
      },
    });

    if (enCurso > 0) {
      throw new ConflictException({
        motivo: 'PAGO_EN_CURSO',
        message:
          'Esa hora tiene un pago en curso. Si no se completa, se libera sola en ' +
          'unos minutos.',
      });
    }
  }

  /**
   * La reserva, si es de quien la pide.
   *
   * El admin puede con cualquiera; el socio, solo con las suyas. Un id ajeno responde
   * lo mismo que uno inexistente: decir "existe pero no es tuya" ya cuenta quién más
   * reservó esa hora.
   */
  private async suya(reservaId: number, yo: UsuarioActual): Promise<Reserva> {
    const reserva = await this.prisma.reserva.findUnique({
      where: { id: reservaId },
    });

    if (!reserva) {
      throw new NotFoundException('No encontramos esa reserva.');
    }

    // `yo.socioId === null` va primero y aparte: una reserva de visitante también
    // tiene `socioId` nulo, así que comparar los dos directamente le daría a
    // cualquier cuenta sin ficha de socio el poder de cancelar las horas pagadas.
    if (
      !yo.esAdmin &&
      (yo.socioId === null || reserva.socioId !== yo.socioId)
    ) {
      throw new NotFoundException('No encontramos esa reserva.');
    }

    if (
      reserva.estado !== EstadoReserva.CONFIRMADA &&
      reserva.estado !== EstadoReserva.PENDIENTE_PAGO
    ) {
      throw new ForbiddenException({
        motivo: 'YA_NO_ESTA_ACTIVA',
        message: 'Esa reserva ya no está activa.',
      });
    }

    return reserva;
  }

  private async bloqueDisponible(
    canchaId: number,
    inicio: Date,
    duracionMin: DuracionMin,
    ahora: Date,
  ) {
    const fecha = hoyEnElClub(inicio).toISOString().slice(0, 10);
    const bloques = await this.catalogo.de(canchaId, fecha, duracionMin);
    const bloque = bloques.find((b) => b.inicio.getTime() === inicio.getTime());

    if (!bloque) {
      throw new NotFoundException(
        'Esa hora no está en el horario de la cancha.',
      );
    }

    // El catálogo calcula los bloques del día que se le pida, incluidos los de ayer:
    // sin este guardia, mover al pasado es una cancelación encubierta que devuelve el
    // cupo del día —`contarDelDia` cuenta por la fecha del bloque— y además esconde la
    // reserva, porque `mias()` solo lista las futuras.
    rechazarSiYaPaso(bloque, ahora);

    if (bloque.bloqueado) {
      throw new ConflictException({
        motivo: 'BLOQUE_NO_DISPONIBLE',
        message: 'Esa hora no está disponible.',
      });
    }

    return bloque;
  }
}

/**
 * Lo que dura una reserva en el reloj del club: 60 o 90 minutos (T82).
 *
 * En el reloj y no restando instantes: la noche en que se atrasa la hora, una reserva de
 * 23:00 a 24:00 dura dos horas de verdad y sigue siendo de una hora. Cualquier otro valor
 * es un dato que no debería existir, y se dice fuerte en vez de adivinar uno.
 */
function duracionDe(reserva: { inicio: Date; fin: Date }): DuracionMin {
  const minutos = minutosDeRelojEntre(reserva.inicio, reserva.fin);

  if (minutos === 60 || minutos === 90) return minutos;

  throw new Error(
    `La reserva dura ${minutos} minutos de reloj; solo existen de 60 y de 90.`,
  );
}

/**
 * El `update` chocó contra el índice del bloque activo.
 *
 * `ReservaRepository` traduce el error al crear, pero acá se actualiza una fila que ya
 * existe y el choque llega crudo: sin esto, mover la reserva a una hora que otro
 * acaba de tomar sale como un 500.
 */
function esBloqueOcupado(error: unknown): boolean {
  // `esViolacionDeUnicidad` es el helper que T2 dejó para esto; reescribir el
  // chequeo de P2002 acá sería una segunda versión de la misma regla.
  return error instanceof BloqueTomado || esViolacionDeUnicidad(error);
}

/** "$20.000", como lo escribe el club. */
function enPesos(monto: number): string {
  return `$${monto.toLocaleString('es-CL')}`;
}
