import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CambiosDeSocio,
  SELECCION_AUDITADA,
} from '../identidad/socios/cambios.service';
import type { UsuarioActual } from '../identidad/usuario-actual';
import type { Prisma } from '../generated/prisma/client';
import { EstadoCuota, TipoCuota } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { MedioDelMeson } from './cuotas.dto';
import { ultimoDiaDelPeriodo } from './periodos';

/**
 * La cuota que se paga en el mesón.
 *
 * Efectivo o transferencia, registrado por un admin. Queda escrito **quién**: es
 * dinero que pasó por las manos de una persona, y sin ese dato no hay forma de
 * reconstruir una caja que no cuadra.
 *
 * Ver `SPEC-cuotas.md` § Cómo se paga.
 */
@Injectable()
export class PagoManualDeCuota {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cambios: CambiosDeSocio,
  ) {}

  async registrar(cuotaId: number, medio: MedioDelMeson, yo: UsuarioActual) {
    const cuota = await this.prisma.cuota.findUnique({
      where: { id: cuotaId },
      select: {
        id: true,
        socioId: true,
        tipo: true,
        periodo: true,
        estado: true,
      },
    });

    if (!cuota) throw new NotFoundException('No hay una cuota con ese número.');

    if (cuota.estado !== EstadoCuota.PENDIENTE) {
      throw new ConflictException(
        cuota.estado === EstadoCuota.PAGADA
          ? 'Esa cuota ya estaba pagada.'
          : 'Esa cuota está anulada: no hay nada que cobrar.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // El estado va en el `where` y ese es el compare-and-set: dos admins cobrando la
      // misma cuota a la vez llegan los dos hasta acá, y la base decide cuál escribe.
      // Es el mismo patrón que `ReservaRepository.cancelar`.
      const { count } = await tx.cuota.updateMany({
        where: { id: cuotaId, estado: EstadoCuota.PENDIENTE },
        data: {
          estado: EstadoCuota.PAGADA,
          medio,
          pagadaEn: new Date(),
          registradaPor: yo.id,
        },
      });

      if (count === 0) {
        throw new ConflictException('Esa cuota ya estaba pagada.');
      }

      // **La incorporación no compra tiempo, compra la entrada.** Lo que cambia al
      // pagarla es que deja de estar pendiente; `alDiaHasta` no se toca.
      if (cuota.tipo === TipoCuota.MENSUAL) {
        await this.extenderVigencia(tx, cuota.socioId, cuota.periodo, yo);
      }

      return tx.cuota.findUniqueOrThrow({ where: { id: cuotaId } });
    });
  }

  /**
   * Lleva `alDiaHasta` al último día del período pagado.
   *
   * **Nunca lo retrocede.** Pagar agosto después de haber pagado septiembre no puede
   * dejar moroso al socio, y por eso es un `max` y no una asignación: es un `=` de
   * una línea el que rompe esto, y no se nota hasta que alguien no puede reservar.
   *
   * El cambio pasa por `CambiosDeSocio` porque `alDiaHasta` es un campo de derechos
   * (T37): quien movió la vigencia tiene que quedar escrito, por el mismo camino que
   * la edición del panel y la sanción.
   */
  private async extenderVigencia(
    tx: Prisma.TransactionClient,
    socioId: number,
    periodo: string,
    yo: UsuarioActual,
  ): Promise<void> {
    const antes = await tx.socio.findUniqueOrThrow({
      where: { id: socioId },
      select: SELECCION_AUDITADA,
    });

    const hasta = ultimoDiaDelPeriodo(periodo);

    if (antes.alDiaHasta >= hasta) return;

    const despues = await tx.socio.update({
      where: { id: socioId },
      data: { alDiaHasta: hasta },
      select: SELECCION_AUDITADA,
    });

    await this.cambios.registrar(
      tx,
      socioId,
      antes,
      despues,
      { id: yo.id, nombre: yo.nombre },
      `Pago de la cuota ${periodo}`,
    );
  }
}
