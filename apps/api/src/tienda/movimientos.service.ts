import { Injectable, NotFoundException } from '@nestjs/common';

import { MotivoMovimientoStock } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CorreosDeLaTienda } from './correos';
import type { MovimientoDelPanel } from './movimientos.dto';
import { moverStock } from './stock';

/** Un movimiento como lo lee el panel: cuándo, cuánto, por qué y quién. */
export interface MovimientoDeLaLista {
  id: number;
  cantidad: number;
  motivo: MotivoMovimientoStock;
  nota: string | null;
  creadoEn: Date;
  /** "Nombre Apellido" del admin, o nulo en una compra en línea. */
  quien: string | null;
}

export interface HistorialDeStock {
  variante: { id: number; etiqueta: string; stock: number; producto: string };
  movimientos: MovimientoDeLaLista[];
}

/**
 * Cuántos movimientos trae la lista, del más nuevo hacia atrás.
 *
 * `ponytail: los últimos 200. Una variante que se vende todos los días los pasa en unos
 * meses; si hace falta ir más atrás, se pagina por fecha. El stock no depende de esto: es
 * una columna, no la suma de la lista.`
 */
const MOVIMIENTOS_EN_LA_LISTA = 200;

/** Las entradas, los ajustes y el historial de stock de una variante (T160). */
@Injectable()
export class MovimientosDeStock {
  constructor(
    private readonly prisma: PrismaService,
    private readonly correos: CorreosDeLaTienda,
  ) {}

  async historial(varianteId: number): Promise<HistorialDeStock> {
    const variante = await this.prisma.variante.findUnique({
      where: { id: varianteId },
      select: {
        id: true,
        etiqueta: true,
        stock: true,
        producto: { select: { nombre: true } },
      },
    });
    if (!variante)
      throw new NotFoundException('No hay una variante con ese número.');

    const filas = await this.prisma.movimientoStock.findMany({
      where: { varianteId },
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      take: MOVIMIENTOS_EN_LA_LISTA,
      select: {
        id: true,
        cantidad: true,
        motivo: true,
        nota: true,
        creadoEn: true,
        usuarioId: true,
      },
    });

    // `usuarioId` no tiene clave foránea, como `Cuota.registradaPor`: los nombres se buscan
    // aparte, todos de una vez, y una cuenta que ya no existe queda sin nombre.
    const ids = [
      ...new Set(filas.flatMap((f) => (f.usuarioId ? [f.usuarioId] : []))),
    ];
    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: ids } },
      select: { id: true, nombre: true, apellido: true },
    });
    const nombres = new Map(
      usuarios.map((u) => [u.id, `${u.nombre} ${u.apellido}`.trim()]),
    );

    return {
      variante: {
        id: variante.id,
        etiqueta: variante.etiqueta,
        stock: variante.stock,
        producto: variante.producto.nombre,
      },
      movimientos: filas.map(({ usuarioId, ...fila }) => ({
        ...fila,
        quien: usuarioId ? (nombres.get(usuarioId) ?? null) : null,
      })),
    };
  }

  /** Una entrada o un ajuste, con `moverStock()`. Devuelve el stock que quedó. */
  async registrar(
    varianteId: number,
    movimiento: MovimientoDelPanel,
    usuarioId: number,
  ): Promise<{ stock: number }> {
    const existe = await this.prisma.variante.findUnique({
      where: { id: varianteId },
      select: { id: true },
    });
    if (!existe)
      throw new NotFoundException('No hay una variante con ese número.');

    const { stock, avisarStockBajo } = await this.prisma.$transaction((tx) =>
      moverStock(tx, { varianteId, ...movimiento, usuarioId }),
    );
    if (avisarStockBajo) await this.correos.stockBajo([varianteId]);

    return { stock };
  }
}
