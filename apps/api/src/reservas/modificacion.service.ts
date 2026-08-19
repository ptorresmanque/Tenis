import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { DisponibilidadService } from '../catalogo-canchas/disponibilidad.service';
import { hoyEnElClub } from '../comun/tiempo';
import {
  EstadoReserva,
  EstadoTransaccion,
  Reserva,
} from '../generated/prisma/client';
import { UsuarioActual } from '../identidad/usuario-actual';
import { AnulacionService } from '../pagos/anulacion.service';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import { EventosDeReserva } from './eventos';
import { BloqueTomado, ReservaRepository } from './reserva.repository';
import { ACTIVAS } from './reservas.service';
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

    const bloque = await this.bloqueDisponible(
      destino.canchaId,
      destino.inicio,
      ahora,
    );

    try {
      const movida = await this.prisma.reserva.update({
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

      // Los dos días cambian: la hora se fue de uno y llegó al otro, y los dos
      // paneles tienen que enterarse.
      this.eventos.cambio(reserva.inicio);
      this.eventos.cambio(movida.inicio);

      return movida;
    } catch (error) {
      if (esBloqueOcupado(error)) {
        throw new ConflictException({
          motivo: 'BLOQUE_TOMADO',
          message: 'Esa hora la acaban de tomar. Elegí otra.',
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

  private async bloqueDisponible(canchaId: number, inicio: Date, ahora: Date) {
    const fecha = hoyEnElClub(inicio).toISOString().slice(0, 10);
    const bloques = await this.catalogo.de(canchaId, fecha);
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
    if (bloque.inicio.getTime() <= ahora.getTime()) {
      throw new ConflictException({
        motivo: 'BLOQUE_EN_EL_PASADO',
        message: 'Esa hora ya pasó. Elegí una que todavía no haya empezado.',
      });
    }

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
