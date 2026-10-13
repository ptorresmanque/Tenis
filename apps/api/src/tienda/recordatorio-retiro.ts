import { Injectable, Logger } from '@nestjs/common';

import { web } from '../comun/urls';
import { EntregaPedido, EstadoPedido } from '../generated/prisma/client';
import { EnviadorCorreo, enviarOAnotar } from '../identidad/correo';
import { PrismaService } from '../prisma/prisma.service';
import { recordatorioDeRetiro } from './correos';

/** Cuántos días listo sin retirar hasta el recordatorio (`SPEC-tienda.md` 16b). */
const DIAS_PARA_RECORDAR = 7;

/**
 * El recordatorio de retiro (T171): a los 7 días de quedar listo, **uno** al comprador.
 *
 * Corre en la tanda por hora de los recordatorios de cuota (`src/recordatorios.ts`), con lo
 * que quede del mismo tope. Como allá, **cada envío se registra antes de mandarlo**, con
 * `recordatorioRetiroEn` en un compare-and-set: dos corridas a la vez no repiten ninguno, y
 * si el proceso muere a mitad, el registrado tampoco.
 */
@Injectable()
export class RecordatoriosDeRetiro {
  private readonly log = new Logger('Recordatorios');

  constructor(
    private readonly prisma: PrismaService,
    private readonly correo: EnviadorCorreo,
  ) {}

  /** @returns Cuántos tomó esta tanda y cuántos quedan para la siguiente. */
  async correrTanda(
    ahora: Date,
    tope: number,
  ): Promise<{ enviados: number; pendientes: number }> {
    const candidatos = await this.prisma.pedido.findMany({
      where: {
        estado: EstadoPedido.LISTO_PARA_RETIRO,
        entrega: EntregaPedido.RETIRO,
        recordatorioRetiroEn: null,
        listoEn: {
          lte: new Date(
            ahora.getTime() - DIAS_PARA_RECORDAR * 24 * 60 * 60_000,
          ),
        },
        // Una venta del mesón puede no tener correo: no hay a quién recordarle.
        email: { not: '' },
      },
      orderBy: { listoEn: 'asc' },
      select: { id: true, token: true, nombre: true, email: true },
    });

    const tanda = candidatos.slice(0, Math.max(0, tope));
    if (tanda.length === 0)
      return { enviados: 0, pendientes: candidatos.length };

    const club = await this.prisma.configuracionClub.findFirstOrThrow();
    let enviados = 0;

    for (const pedido of tanda) {
      // **Antes de mandar.** Si otra corrida ya lo marcó, el `where` no lo encuentra y se salta.
      const { count } = await this.prisma.pedido.updateMany({
        where: { id: pedido.id, recordatorioRetiroEn: null },
        data: { recordatorioRetiroEn: ahora },
      });
      if (count === 0) continue;

      await enviarOAnotar(
        this.correo,
        {
          para: pedido.email,
          ...recordatorioDeRetiro(pedido, club.tiendaHorario, club, web()),
        },
        this.log,
        `No salió el recordatorio de retiro del pedido ${pedido.id}`,
      );
      enviados++;
    }

    return { enviados, pendientes: candidatos.length - tanda.length };
  }
}
