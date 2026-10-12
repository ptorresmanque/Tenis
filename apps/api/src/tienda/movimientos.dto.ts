import { BadRequestException } from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';
import { MotivoMovimientoStock } from '../generated/prisma/client';

/** Lo que el panel registra a mano: una entrada de mercadería o un ajuste (T160). */
export interface MovimientoDelPanel {
  motivo:
    typeof MotivoMovimientoStock.ENTRADA | typeof MotivoMovimientoStock.AJUSTE;
  cantidad: number;
  nota: string | null;
}

/** El ancho de `nota` en `movimiento_stock`. */
const LARGO_DE_LA_NOTA = 300;

/** Lo que entra o sale de una vez. Más es un dedazo, no una bodega. */
const CANTIDAD_MAXIMA = 100_000;

/**
 * Una entrada o un ajuste, como lo escribe el admin.
 *
 * **Las ventas, las devoluciones y las anulaciones no se registran a mano**: llegan solas
 * desde la compra, el mesón y la cancelación, y escritas a mano dejarían un stock que
 * ningún pedido explica.
 */
export function leerMovimiento(cuerpo: unknown): MovimientoDelPanel {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const nota = typeof datos.nota === 'string' ? datos.nota.trim() : '';

  if (nota.length > LARGO_DE_LA_NOTA) {
    throw new BadRequestException(
      `Acorta la nota: tiene más de ${LARGO_DE_LA_NOTA} caracteres.`,
    );
  }

  if (datos.motivo === MotivoMovimientoStock.ENTRADA) {
    return {
      motivo: MotivoMovimientoStock.ENTRADA,
      cantidad: entero(datos.cantidad, 'Lo que entra', 1, CANTIDAD_MAXIMA),
      nota: nota || null,
    };
  }

  if (datos.motivo === MotivoMovimientoStock.AJUSTE) {
    const cantidad = entero(
      datos.cantidad,
      'El ajuste',
      -CANTIDAD_MAXIMA,
      CANTIDAD_MAXIMA,
    );
    if (cantidad === 0) {
      throw new BadRequestException(
        'Un ajuste de cero no cambia nada: escribe cuánto sobra o cuánto falta.',
      );
    }
    // La regla la impone también moverStock(); acá se dice antes, con un mensaje propio.
    if (!nota) {
      throw new BadRequestException(
        'Un ajuste lleva una nota que diga por qué: un conteo, una merma.',
      );
    }

    return { motivo: MotivoMovimientoStock.AJUSTE, cantidad, nota };
  }

  throw new BadRequestException(
    'Desde el panel se registran entradas y ajustes. Las ventas y las devoluciones llegan solas.',
  );
}
