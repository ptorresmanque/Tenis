import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { DatosBloqueo } from '../catalogo-canchas/admin.dto';
import { ZONA_DEL_CLUB } from '../comun/tiempo';
import { EnviadorCorreo } from '../identidad/correo';
import { AnulacionService } from '../pagos/anulacion.service';
import { EstadoReserva, EstadoTransaccion } from '../generated/prisma/client';
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

    const pagos = await this.pagosDe(reservas.map((r) => r.id));

    return reservas.map((reserva) => ({
      id: reserva.id,
      folio: reserva.folio,
      inicio: reserva.inicio,
      fin: reserva.fin,
      nombre: reserva.nombre,
      email: reserva.email,
      esSocio: reserva.socioId !== null,
      pagada: pagos.has(reserva.id),
    }));
  }

  /**
   * Cierra la cancha: crea el bloqueo, cancela lo que queda debajo, devuelve y avisa.
   *
   * El orden de los tres pasos no es de conveniencia:
   *
   * 1. **Primero la plata.** Es el mismo criterio de T19 y T24: si la pasarela falla,
   *    no se cerró nada y el club lo reintenta. Al revés, la persona se queda sin
   *    cancha y sin su dinero hasta que alguien lo note.
   * 2. **Bloqueo y cancelaciones, en una transacción.** Un bloqueo puesto con las
   *    reservas todavía vivas es exactamente el estado que esta operación existe para
   *    evitar: la cancha se ve cerrada y la hora sigue a nombre de alguien.
   * 3. **Los correos, después de que la transacción confirma.** Un aviso de una
   *    cancelación que terminó revirtiéndose no se puede retirar del buzón de nadie.
   */
  async cerrar(datos: DatosBloqueo): Promise<ResultadoCierre> {
    const afectadas = await this.afectadas(datos);

    for (const reserva of afectadas.filter((r) => r.pagada)) {
      // **Devolución total, sin evaluar la ventana de 24 horas**: canceló el club y
      // no la persona, y cobrarle una hora que le quitaron es indefendible.
      await this.anularElPagoDe(reserva.id);
    }

    const { bloqueoId, canceladas } = await this.prisma
      .$transaction(async (tx) => {
        const bloqueo = await tx.bloqueo.create({ data: datos });

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
      })
      .then(async ({ bloqueoId, ids }) => ({
        bloqueoId,
        canceladas: await this.fichasDe(ids, afectadas),
      }));

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

    for (const reserva of canceladas) {
      this.eventos.cambio(reserva.inicio);
      await this.avisar(reserva, datos);
    }

    return { bloqueoId, canceladas };
  }

  /** El aviso, que es el punto entero de la operación. */
  private async avisar(
    reserva: ReservaAfectada,
    cierre: DatosBloqueo,
  ): Promise<void> {
    const cancha = await this.prisma.cancha.findUnique({
      where: { id: cierre.canchaId },
      select: { nombre: true },
    });

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

  private async anularElPagoDe(reservaId: number): Promise<void> {
    const pago = await this.prisma.transaccion.findFirst({
      where: {
        concepto: 'RESERVA',
        conceptoId: reservaId,
        estado: EstadoTransaccion.AUTORIZADA,
      },
      select: { id: true },
    });

    if (pago) await this.anulacion.anular(pago.id);
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
      })),
    ];
  }

  private async pagosDe(reservaIds: number[]): Promise<Set<number>> {
    if (reservaIds.length === 0) return new Set();

    const pagos = await this.prisma.transaccion.findMany({
      where: {
        concepto: 'RESERVA',
        conceptoId: { in: reservaIds },
        estado: EstadoTransaccion.AUTORIZADA,
      },
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
