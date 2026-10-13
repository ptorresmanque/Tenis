import { BadRequestException } from '@nestjs/common';

import { MotivoMovimientoStock, Prisma } from '../generated/prisma/client';

/** Un cambio de stock: cuánto, por qué y quién. */
export interface Movimiento {
  varianteId: number;
  /** Positivo entra, negativo sale. Nunca cero. */
  cantidad: number;
  motivo: MotivoMovimientoStock;
  /** El admin que lo hace; nulo en una compra en línea. */
  usuarioId?: number | null;
  /** Obligatoria en un ajuste. */
  nota?: string | null;
}

/** Lo que dejó un movimiento. */
export interface StockMovido {
  stock: number;
  /**
   * La variante quedó en el umbral de stock bajo o menos y el club no lo sabía (T173).
   * Quien llama manda el aviso con `CorreosDeLaTienda.stockBajo` **después de confirmar**:
   * acá se está dentro de la transacción, y si se cae, el aviso no puede haber salido.
   */
  avisarStockBajo: boolean;
}

/**
 * **El único camino para cambiar `Variante.stock`** (T158).
 *
 * Cambia el número y deja el movimiento que lo explica, **con el cliente de la
 * transacción de quien llama**: o quedan las dos cosas, o ninguna. Así "el stock no me
 * cuadra" siempre tiene respuesta, la lista de movimientos de esa variante. Lo vigila
 * `stock-unico.spec.ts`, que falla si otro archivo escribe la columna.
 *
 * **Puede dejar el stock negativo**, a propósito: una venta por encargo lo deja en −1
 * —"le debemos uno a alguien"— y una venta del mesón con el sistema en cero también,
 * porque manda la caja que está en el mostrador (`SPEC-tienda.md` § Stock). Decidir si
 * algo se puede vender es de quien llama, no de acá.
 *
 * Devuelve el stock que quedó y si hay que avisar que está bajo.
 */
export async function moverStock(
  tx: Prisma.TransactionClient,
  movimiento: Movimiento,
): Promise<StockMovido> {
  const { varianteId, cantidad, motivo } = movimiento;
  const nota = movimiento.nota?.trim() || null;

  // Un error de quien llama, no del admin: un movimiento de cero no explica nada.
  if (!Number.isInteger(cantidad) || cantidad === 0) {
    throw new Error(
      `Un movimiento de stock mueve un entero distinto de cero, no ${cantidad}.`,
    );
  }
  // La regla del ajuste vive acá y no en el formulario: es lo que hace que un −3 se pueda
  // explicar seis meses después.
  if (motivo === MotivoMovimientoStock.AJUSTE && !nota) {
    throw new BadRequestException(
      'Un ajuste de stock lleva una nota que diga por qué.',
    );
  }

  // El UPDATE toma la fila: dos ventas a la vez de la misma variante se ordenan, y la
  // segunda ya ve el aviso que marcó la primera.
  const { stock, avisoStockBajoEn } = await tx.variante.update({
    where: { id: varianteId },
    data: { stock: { increment: cantidad } },
    select: { stock: true, avisoStockBajoEn: true },
  });

  await tx.movimientoStock.create({
    data: {
      varianteId,
      cantidad,
      motivo,
      usuarioId: movimiento.usuarioId ?? null,
      nota,
    },
  });

  const { umbralStockBajo } = await tx.configuracionClub.findFirstOrThrow({
    select: { umbralStockBajo: true },
  });
  const bajo = stock <= umbralStockBajo;
  // Solo lo que sale avisa: una entrada que la deja en el umbral la cargó el club, que ya
  // sabe cuánto trajo.
  const avisarStockBajo = bajo && cantidad < 0 && avisoStockBajoEn === null;
  // Sobre el umbral se rearma: la próxima bajada vuelve a avisar.
  const rearmar = !bajo && avisoStockBajoEn !== null;

  if (avisarStockBajo || rearmar) {
    await tx.variante.update({
      where: { id: varianteId },
      data: { avisoStockBajoEn: avisarStockBajo ? new Date() : null },
    });
  }

  return { stock, avisarStockBajo };
}
