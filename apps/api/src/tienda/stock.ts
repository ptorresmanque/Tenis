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
 * Devuelve el stock que quedó.
 */
export async function moverStock(
  tx: Prisma.TransactionClient,
  movimiento: Movimiento,
): Promise<number> {
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

  const { stock } = await tx.variante.update({
    where: { id: varianteId },
    data: { stock: { increment: cantidad } },
    select: { stock: true },
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

  return stock;
}
