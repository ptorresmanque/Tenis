import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { hoyEnElClub, instanteEnElClub } from '../comun/tiempo';
import {
  EstadoReporte,
  EstadoReserva,
  Prisma,
} from '../generated/prisma/client';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';

/** Cuánto después de terminar el bloque se puede reportar. */
const HORAS_PARA_REPORTAR = 24;

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Un socio avisa que una hora reservada quedó sin usar.
   *
   * **No sanciona nada.** Deja un reporte pendiente para que lo mire el admin: un
   * castigo automático convierte este botón en un arma, y dos socios molestos
   * dejarían a un tercero sin reservar quince días sin que nadie revise.
   */
  async reportar(
    reservaId: number,
    reportanteSocioId: number,
    ahora = new Date(),
  ): Promise<void> {
    const reserva = await this.prisma.reserva.findUnique({
      where: { id: reservaId },
      select: {
        id: true,
        estado: true,
        inicio: true,
        fin: true,
        socioId: true,
        acompanantes: { select: { socioId: true } },
      },
    });

    if (!reserva) {
      throw new NotFoundException('No hay una reserva con ese número.');
    }

    if (reserva.estado !== EstadoReserva.CONFIRMADA) {
      // Una cancelada o expirada liberó la cancha: nadie la dejó vacía.
      throw new ConflictException(
        'Esa hora no llegó a estar reservada, así que no hay nada que reportar.',
      );
    }

    if (
      reserva.socioId === reportanteSocioId ||
      reserva.acompanantes.some((a) => a.socioId === reportanteSocioId)
    ) {
      // Quien iba a jugar no es testigo: es parte. Sin esto, el botón sirve para
      // autodenunciarse y para embarrar a los propios acompañantes.
      throw new ForbiddenException(
        'No puedes reportar una hora en la que ibas a jugar.',
      );
    }

    if (reserva.inicio > ahora) {
      throw new ConflictException(
        'Esa hora todavía no empieza. Se puede reportar desde que arranca.',
      );
    }

    if (
      ahora.getTime() - reserva.fin.getTime() >
      HORAS_PARA_REPORTAR * 3600_000
    ) {
      // Pasado ese plazo nadie puede verificar nada, y un reporte que no se puede
      // comprobar solo sirve para molestar.
      throw new ConflictException(
        `Esa hora terminó hace más de ${HORAS_PARA_REPORTAR} horas y ya no se puede reportar.`,
      );
    }

    try {
      await this.prisma.reporteNoUso.create({
        data: { reservaId, reportanteSocioId },
      });
    } catch (error) {
      if (!esViolacionDeUnicidad(error)) throw error;

      // Lo impone el índice único, no una consulta previa: es lo que evita que
      // alguien apriete diez veces y la bandeja muestre diez reportes suyos.
      throw new ConflictException('Ya reportaste esta hora.');
    }
  }

  /**
   * Qué horas de ese día puede reportar este socio.
   *
   * La grilla pública **no dice qué reserva ocupa cada bloque** —sería publicar
   * quién juega y cuándo—, así que el botón necesita esta lista aparte. Va tras
   * `@SoloSocio()` y no incluye las horas del propio socio ni aquellas en las que
   * estaba declarado: de esas no es testigo, es parte.
   *
   * Solo lo transcurrido y dentro del plazo: ofrecer el botón sobre una hora que
   * el servidor va a rechazar es prometer algo que no se puede hacer.
   */
  async reportables(socioId: number, fecha: string, ahora = new Date()) {
    const reservas = await this.prisma.reserva.findMany({
      where: {
        estado: EstadoReserva.CONFIRMADA,
        inicio: {
          gte: instanteEnElClub(fecha, '00:00'),
          lte: ahora,
        },
        fin: {
          gte: new Date(ahora.getTime() - HORAS_PARA_REPORTAR * 3600_000),
        },
        socioId: { not: socioId },
        acompanantes: { none: { socioId } },
      },
      select: {
        id: true,
        canchaId: true,
        inicio: true,
        reportes: {
          where: { reportanteSocioId: socioId },
          select: { id: true },
        },
      },
    });

    return reservas.map((reserva) => ({
      reservaId: reserva.id,
      canchaId: reserva.canchaId,
      inicio: reserva.inicio,
      // Para que el botón diga "ya lo reportaste" en vez de ofrecer un 409.
      yaReportada: reserva.reportes.length > 0,
    }));
  }

  /**
   * Los reportes pendientes, para el panel del admin.
   *
   * **Nunca dice quién reportó.** El anonimato es una propiedad de esta respuesta:
   * se cuenta cuántos reportes tiene la reserva, y `reportanteSocioId` no sale por
   * ningún camino, tampoco anidado.
   */
  async pendientes() {
    const reportes = await this.prisma.reporteNoUso.findMany({
      where: { estado: EstadoReporte.PENDIENTE },
      orderBy: { creadoEn: 'desc' },
      select: {
        id: true,
        reservaId: true,
        creadoEn: true,
        reserva: {
          select: {
            inicio: true,
            fin: true,
            folio: true,
            cancha: { select: { nombre: true } },
            socio: {
              select: {
                id: true,
                numeroSocio: true,
                sancionadoHasta: true,
                usuario: { select: { nombre: true, apellido: true } },
              },
            },
          },
        },
      },
    });

    // Una reserva puede tener varios reportes: se muestran juntos, con el conteo,
    // porque el admin resuelve la hora y no cada aviso por separado.
    const porReserva = new Map<number, (typeof reportes)[number][]>();
    for (const reporte of reportes) {
      porReserva.set(reporte.reservaId, [
        ...(porReserva.get(reporte.reservaId) ?? []),
        reporte,
      ]);
    }

    return [...porReserva.values()].map(([primero, ...resto]) => ({
      reservaId: primero.reservaId,
      folio: primero.reserva.folio,
      cancha: primero.reserva.cancha.nombre,
      inicio: primero.reserva.inicio,
      fin: primero.reserva.fin,
      reportes: resto.length + 1,
      ultimoReporteEn: primero.creadoEn,
      socio: primero.reserva.socio && {
        id: primero.reserva.socio.id,
        numeroSocio: primero.reserva.socio.numeroSocio,
        nombre: `${primero.reserva.socio.usuario.nombre} ${primero.reserva.socio.usuario.apellido}`,
        sancionadoHasta: primero.reserva.socio.sancionadoHasta,
      },
    }));
  }

  /**
   * El admin sanciona al socio de esa reserva, o descarta lo reportado.
   *
   * Resuelve **todos los reportes pendientes de la reserva**, no uno: el admin
   * decide sobre la hora, y dejar hermanos pendientes haría que la misma hora
   * volviera a aparecer en la bandeja ya resuelta.
   */
  async resolver(
    reservaId: number,
    decision: 'SANCIONAR' | 'DESCARTAR',
    adminUsuarioId: number,
    ahora = new Date(),
  ): Promise<{ sancionadoHasta: Date | null }> {
    const reserva = await this.prisma.reserva.findUnique({
      where: { id: reservaId },
      select: {
        socioId: true,
        socio: { select: { sancionadoHasta: true } },
        reportes: {
          where: { estado: EstadoReporte.PENDIENTE },
          select: { id: true },
        },
      },
    });

    if (!reserva || reserva.reportes.length === 0) {
      throw new NotFoundException('No hay reportes pendientes para esa hora.');
    }

    if (decision === 'SANCIONAR' && reserva.socioId === null) {
      // La reserva de un visitante no tiene a quién sancionar: no hay ficha ni
      // cupo que suspender. Se descarta, que es lo que el club puede hacer.
      throw new ConflictException(
        'Esa hora la reservó un visitante sin cuenta: no hay socio a quien sancionar.',
      );
    }

    const config = await this.prisma.configuracionClub.findFirstOrThrow();
    const sancionadoHasta =
      decision === 'SANCIONAR'
        ? this.finDeLaSancion(
            reserva.socio?.sancionadoHasta ?? null,
            config.diasSancionNoUso,
            ahora,
          )
        : null;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (decision === 'SANCIONAR' && reserva.socioId !== null) {
        await tx.socio.update({
          where: { id: reserva.socioId },
          data: { sancionadoHasta },
        });
      }

      await tx.reporteNoUso.updateMany({
        where: { reservaId, estado: EstadoReporte.PENDIENTE },
        data: {
          estado:
            decision === 'SANCIONAR'
              ? EstadoReporte.SANCIONADO
              : EstadoReporte.DESCARTADO,
          resueltoEn: ahora,
          resueltoPorUsuarioId: adminUsuarioId,
        },
      });
    });

    return { sancionadoHasta };
  }

  /**
   * Desde hoy, o desde la sanción que ya tenía si termina más tarde.
   *
   * Sin esto, sancionar dos veces seguidas a alguien le **acorta** el castigo: la
   * segunda pisaría la primera con una fecha más cercana.
   */
  private finDeLaSancion(actual: Date | null, dias: number, ahora: Date): Date {
    const desde =
      actual !== null && actual > hoyEnElClub(ahora)
        ? actual
        : hoyEnElClub(ahora);

    return new Date(desde.getTime() + dias * 24 * 3600_000);
  }
}
