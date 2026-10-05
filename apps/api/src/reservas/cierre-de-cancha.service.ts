import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { DatosBloqueo } from '../catalogo-canchas/admin.dto';
import { ZONA_DEL_CLUB } from '../comun/tiempo';
import { EnviadorCorreo } from '../identidad/correo';
import { MINUTOS_PARA_EXPIRAR } from '../pagos/expiracion';
import { AnulacionService } from '../pagos/anulacion.service';
import type { Prisma } from '../generated/prisma/client';
import { EstadoReserva, EstadoTransaccion } from '../generated/prisma/client';
import { reintentarSiHayDeadlock } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import { EventosDeReserva } from './eventos';
import { ACTIVAS } from './reservas.service';

/**
 * El cierre se cuenta en hora del club, que es la que la persona tiene anotada.
 * Mandarle el instante UTC en el correo la haría llegar tres horas antes.
 */
const HORA = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const DIA = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Una hora que el cierre se lleva por delante. */
export interface ReservaAfectada {
  id: number;
  folio: string;
  inicio: Date;
  fin: Date;
  nombre: string;
  email: string;
  esSocio: boolean;
  pagada: boolean;
  /** Está pagándose en la pasarela ahora mismo. Ver `exigirQueNadieEsteMitadPagando`. */
  pagoEnCurso: boolean;
}

export interface ResultadoCierre {
  bloqueoId: number;
  canceladas: ReservaAfectada[];
}

/**
 * Cerrar una cancha que ya tiene horas tomadas.
 *
 * El club cierra por riego, por una reparación o por un torneo, y a veces sobre
 * horas que ya tiene alguien. Hasta hoy esos socios **se enteraban al llegar al
 * club** —problemática 2.3 del perfil— porque el aviso viajaba por WhatsApp y
 * alcanzaba a quien estuviera mirando la conversación.
 *
 * **Vive en `reservas` y no en `catalogo-canchas`** porque aquel módulo no conoce el
 * concepto de reserva y no puede empezar a conocerlo sin cerrar un ciclo en el mapa.
 * Este es el único que ve el catálogo, las reservas y los pagos a la vez.
 * `catalogo-canchas` conserva su endpoint de bloqueo para el caso normal, que es
 * cerrar una hora libre.
 */
@Injectable()
export class CierreDeCanchaService {
  private readonly log = new Logger('Reservas');

  constructor(
    private readonly prisma: PrismaService,
    private readonly anulacion: AnulacionService,
    private readonly eventos: EventosDeReserva,
    private readonly correo: EnviadorCorreo,
  ) {}

  /**
   * A quién afectaría el cierre, sin escribir nada.
   *
   * Es el paso que hace que cancelar automáticamente no sea un descuido: el admin ve
   * la lista antes de confirmar. Una mantención cargada con la fecha equivocada borra
   * horas de gente que no hizo nada, y no hay deshacer.
   */
  async afectadas(datos: DatosBloqueo): Promise<ReservaAfectada[]> {
    await this.laCancha(datos.canchaId);

    // Se solapan si una empieza antes de que la otra termine, por los dos lados. Con
    // `>=` en cualquiera de los dos, la reserva que termina justo cuando el bloqueo
    // empieza entraría, y esa hora se juega entera antes de que cierren.
    const reservas = await this.prisma.reserva.findMany({
      where: {
        canchaId: datos.canchaId,
        estado: { in: ACTIVAS },
        inicio: { lt: datos.fin },
        fin: { gt: datos.inicio },
      },
      orderBy: { inicio: 'asc' },
      select: {
        id: true,
        folio: true,
        inicio: true,
        fin: true,
        nombre: true,
        email: true,
        socioId: true,
      },
    });

    const ids = reservas.map((r) => r.id);
    const [pagadas, pagandose] = await Promise.all([
      this.conTransaccionEn(ids, EstadoTransaccion.AUTORIZADA),
      this.conTransaccionEn(ids, EstadoTransaccion.PENDIENTE),
    ]);

    return reservas.map((reserva) => ({
      id: reserva.id,
      folio: reserva.folio,
      inicio: reserva.inicio,
      fin: reserva.fin,
      nombre: reserva.nombre,
      email: reserva.email,
      esSocio: reserva.socioId !== null,
      pagada: pagadas.has(reserva.id),
      pagoEnCurso: pagandose.has(reserva.id),
    }));
  }

  /**
   * Cierra la cancha: crea el bloqueo, cancela lo que queda debajo, devuelve y avisa.
   *
   * El orden de los tres pasos no es de conveniencia:
   *
   * 0. **Nadie a mitad de pagar.** Ver `exigirQueNadieEsteMitadPagando`.
   * 1. **Primero la plata.** Es el mismo criterio de T19 y T24: si la pasarela falla,
   *    no se cerró nada y el club lo reintenta. Al revés, la persona se queda sin
   *    cancha y sin su dinero hasta que alguien lo note.
   * 2. **Bloqueo y cancelaciones, en una transacción.** Un bloqueo puesto con las
   *    reservas todavía vivas es exactamente el estado que esta operación existe para
   *    evitar: la cancha se ve cerrada y la hora sigue a nombre de alguien.
   * 3. **Los correos, después de que la transacción confirma.** Un aviso de una
   *    cancelación que terminó revirtiéndose no se puede retirar del buzón de nadie.
   *
   * @param tambienEnLaTransaccion Trabajo que tiene que pasar o fallar **junto con el
   * bloqueo**. Lo usa `clases` para crear la `Clase` ahí mismo: una clase con la
   * cancha abierta es la clase a la que alguien reserva encima, y un bloqueo sin
   * clase nadie sabe por qué está.
   */
  async cerrar(
    datos: DatosBloqueo,
    tambienEnLaTransaccion?: (
      tx: Prisma.TransactionClient,
      bloqueoId: number,
    ) => Promise<void>,
  ): Promise<ResultadoCierre> {
    const afectadas = await this.afectadas(datos);

    this.exigirQueNadieEsteMitadPagando(afectadas);

    for (const reserva of afectadas.filter((r) => r.pagada)) {
      // **Devolución total, sin evaluar la ventana de 24 horas**: canceló el club y
      // no la persona, y cobrarle una hora que le quitaron es indefendible.
      await this.anularLoPagadoPor(reserva.id);
    }

    // Se repite entera si la base la aborta por deadlock: cancelar saca filas del
    // índice por rango de `reserva` (T76). Adentro no hay nada externo —las
    // devoluciones ya se hicieron arriba—, así que repetirla no devuelve dos veces.
    const { bloqueoId, ids } = await reintentarSiHayDeadlock(() =>
      this.prisma.$transaction(async (tx) => {
        const bloqueo = await tx.bloqueo.create({ data: datos });

        await tambienEnLaTransaccion?.(tx, bloqueo.id);

        // Se vuelve a consultar dentro de la transacción y no se reusa la lista de
        // arriba: entre el cálculo y el cierre cabe una reserva nueva, y dejarla viva
        // debajo del bloqueo es el bug que esta operación viene a cerrar.
        const debajo = await tx.reserva.findMany({
          where: {
            canchaId: datos.canchaId,
            estado: { in: ACTIVAS },
            inicio: { lt: datos.fin },
            fin: { gt: datos.inicio },
          },
          select: { id: true },
        });

        await tx.reserva.updateMany({
          where: { id: { in: debajo.map((r) => r.id) } },
          data: {
            estado: EstadoReserva.CANCELADA,
            canceladaEn: new Date(),
            canceladaPorBloqueoId: bloqueo.id,
          },
        });

        return { bloqueoId: bloqueo.id, ids: debajo.map((r) => r.id) };
      }),
    );

    const canceladas = await this.fichasDe(ids, afectadas);

    // La que entró entre el cálculo y el cierre queda cancelada igual, pero su pago
    // no se anuló arriba porque no existía todavía. Se registra para que el club lo
    // resuelva por caja en vez de que se pierda en silencio.
    const tardias = canceladas.filter(
      (r) => !afectadas.some((previa) => previa.id === r.id),
    );
    for (const reserva of tardias) {
      this.log.warn(
        `La reserva ${reserva.folio} entró mientras se cerraba la cancha y quedó ` +
          'cancelada sin devolución automática. Revisar a mano.',
      );
    }

    // La cancha se consulta una vez y no una por reserva: es la misma en todas, y
    // dentro del bucle serían tantas consultas como horas se lleve el cierre.
    const cancha = await this.prisma.cancha.findUnique({
      where: { id: datos.canchaId },
      select: { nombre: true },
    });

    for (const reserva of canceladas) {
      this.eventos.cambio(reserva.inicio);
      await this.avisar(reserva, datos, cancha);
    }

    return { bloqueoId, canceladas };
  }

  /**
   * Con alguien a mitad de pagar, el cierre no va.
   *
   * Es el agujero más caro de esta operación y por eso se corta antes de escribir
   * nada: si se cancela una reserva que se está pagando en Webpay, el callback
   * vuelve, **autoriza el cobro**, y el `updateMany` que la confirmaría no encuentra
   * nada porque ya está `CANCELADA`. Queda un cobro autorizado sin cancha y sin
   * devolución, y nadie se entera hasta que la persona reclama.
   *
   * La misma regla que `ModificacionService.cancelar`, por el mismo motivo. La espera
   * es corta y acotada: la transacción expira sola a los quince minutos y con ella la
   * reserva. El mensaje lo dice, porque un 409 sin plazo se lee como "nunca".
   */
  private exigirQueNadieEsteMitadPagando(afectadas: ReservaAfectada[]): void {
    const enCurso = afectadas.filter((r) => r.pagoEnCurso);

    if (enCurso.length === 0) return;

    throw new ConflictException({
      motivo: 'PAGO_EN_CURSO',
      message:
        `Hay ${enCurso.length === 1 ? 'una hora' : `${enCurso.length} horas`} ` +
        'con un pago en curso en ese rango ' +
        `(${enCurso.map((r) => r.folio).join(', ')}). ` +
        `Si el pago no se completa, se libera sola en ${MINUTOS_PARA_EXPIRAR} minutos ` +
        'y ahí puedes cerrar. Cancelarla ahora dejaría a esa persona sin cancha y sin ' +
        'su dinero.',
    });
  }

  /** El aviso, que es el punto entero de la operación. */
  private async avisar(
    reserva: ReservaAfectada,
    cierre: DatosBloqueo,
    cancha: { nombre: string } | null,
  ): Promise<void> {
    const cuando = `${DIA.format(reserva.inicio)}, de ${HORA.format(reserva.inicio)} a ${HORA.format(reserva.fin)}`;

    const devolucion = reserva.pagada
      ? 'Te devolvimos lo que pagaste, completo.'
      : 'Recuperaste tu cupo del día: puedes tomar otra hora cuando quieras.';

    try {
      await this.correo.enviar({
        para: reserva.email,
        asunto: `Tu hora en ${cancha?.nombre ?? 'el club'} quedó cancelada`,
        cuerpo:
          `Hola ${reserva.nombre}:\n\n` +
          `Tuvimos que cerrar ${cancha?.nombre ?? 'la cancha'} el ${cuando}` +
          `${cierre.descripcion ? ` (${cierre.descripcion})` : ''}, ` +
          `así que tu reserva ${reserva.folio} quedó cancelada.\n\n` +
          `${devolucion}\n\n` +
          'Lamentamos el cambio. Si necesitas ayuda para reagendar, escríbenos.\n',
      });
    } catch (falla) {
      // Un correo que no sale no puede deshacer una cancelación que ya ocurrió. Queda
      // en el log con el folio, que es lo que el club necesita para llamar por teléfono.
      this.log.error(
        `No se pudo avisar la cancelación de ${reserva.folio}: ${String(falla)}`,
      );
    }
  }

  /** La compra y, si la alargó, la diferencia de T89: cada pago, entero (T86). */
  private async anularLoPagadoPor(reservaId: number): Promise<void> {
    const pagos = await this.prisma.transaccion.findMany({
      where: {
        concepto: 'RESERVA',
        conceptoId: reservaId,
        estado: EstadoTransaccion.AUTORIZADA,
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    for (const pago of pagos) await this.anulacion.anular(pago.id);
  }

  /** Qué reservas de las canceladas ya conocíamos, con su ficha para el aviso. */
  private async fichasDe(
    ids: number[],
    conocidas: ReservaAfectada[],
  ): Promise<ReservaAfectada[]> {
    const nuevas = ids.filter((id) => !conocidas.some((r) => r.id === id));

    if (nuevas.length === 0) {
      return conocidas.filter((r) => ids.includes(r.id));
    }

    const reservas = await this.prisma.reserva.findMany({
      where: { id: { in: nuevas } },
      select: {
        id: true,
        folio: true,
        inicio: true,
        fin: true,
        nombre: true,
        email: true,
        socioId: true,
      },
    });

    return [
      ...conocidas.filter((r) => ids.includes(r.id)),
      ...reservas.map((reserva) => ({
        id: reserva.id,
        folio: reserva.folio,
        inicio: reserva.inicio,
        fin: reserva.fin,
        nombre: reserva.nombre,
        email: reserva.email,
        esSocio: reserva.socioId !== null,
        pagada: false,
        pagoEnCurso: false,
      })),
    ];
  }

  /** Cuáles de esas reservas tienen una transacción en ese estado. */
  private async conTransaccionEn(
    reservaIds: number[],
    estado: EstadoTransaccion,
  ): Promise<Set<number>> {
    if (reservaIds.length === 0) return new Set();

    const pagos = await this.prisma.transaccion.findMany({
      where: { concepto: 'RESERVA', conceptoId: { in: reservaIds }, estado },
      select: { conceptoId: true },
    });

    return new Set(pagos.map((p) => p.conceptoId));
  }

  private async laCancha(id: number): Promise<void> {
    const cancha = await this.prisma.cancha.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!cancha)
      throw new NotFoundException('No hay una cancha con ese número.');
  }
}
