import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  CanalPedido,
  ConceptoPago,
  EstadoPedido,
  EstadoTransaccion,
  MotivoMovimientoStock,
  Prisma,
} from '../generated/prisma/client';
import { AnulacionService } from '../pagos/anulacion.service';
import { PrismaService } from '../prisma/prisma.service';
import { CorreosDeLaTienda } from './correos';
import type { Cancelacion, DevolucionNueva } from './devoluciones.dto';
import { moverStock } from './stock';

/** Lo pagado que todavía está en el club se cancela (`SPEC-tienda.md` § Cancelaciones). */
const CANCELABLES: EstadoPedido[] = [
  EstadoPedido.PAGADO,
  EstadoPedido.LISTO_PARA_RETIRO,
];

/** Todo lo que se pagó se puede devolver, entregado o no. */
const PAGADOS: EstadoPedido[] = [
  ...CANCELABLES,
  EstadoPedido.DESPACHADO,
  EstadoPedido.ENTREGADO,
];

const NO_SE_CANCELA =
  'Solo un pedido en línea pagado, antes de entregarlo o despacharlo, se cancela. Lo ' +
  'que ya salió del club se devuelve: registra una devolución.';

const pesos = (monto: number) => `$${monto.toLocaleString('es-CL')}`;

/**
 * Cancelar y devolver (T174, `SPEC-tienda.md` § Cancelaciones y devoluciones).
 *
 * **Cancelar** anula el pago en Webpay y deja el pedido `CANCELADO` en la misma
 * transacción, con el efecto de `AnulacionService.anular`: si Webpay no deja anular, no
 * cambia nada y el panel ofrece devolver por transferencia. **Devolver** una parte se
 * registra con su medio y su motivo, sin pasar por Webpay.
 *
 * Cancelar devuelve el total y una devolución una parte, así que **no se cancela un
 * pedido que ya tiene una devolución**: lo devuelto saldría dos veces.
 */
@Injectable()
export class DevolucionesDeLaTienda {
  private readonly log = new Logger('Tienda');

  constructor(
    private readonly prisma: PrismaService,
    private readonly anulacion: AnulacionService,
    private readonly correos: CorreosDeLaTienda,
  ) {}

  async cancelar(
    pedidoId: number,
    { motivo, medio }: Cancelacion,
    adminId: number,
  ): Promise<void> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: { canal: true, estado: true, totalClp: true },
    });
    if (!pedido)
      throw new NotFoundException('No hay un pedido con ese número.');
    // Antes de Webpay: lo que no se cancela no tiene por qué llegar a la pasarela.
    if (
      pedido.canal !== CanalPedido.EN_LINEA ||
      !CANCELABLES.includes(pedido.estado)
    ) {
      throw new ConflictException(NO_SE_CANCELA);
    }

    let cancelado = false;
    const efecto = async (tx: Prisma.TransactionClient) => {
      await this.cancelarDentro(
        tx,
        pedidoId,
        pedido.totalClp,
        motivo,
        medio,
        adminId,
      );
      cancelado = true;
    };

    if (medio === 'TRANSFERENCIA') {
      await this.prisma.$transaction(efecto);
    } else {
      const pago = await this.pagoDe(pedidoId);
      try {
        await this.anulacion.anular(pago, efecto);
      } catch (falla) {
        // Si el efecto no alcanzó a terminar, el error es suyo —el pedido cambió entre
        // medio— y se dice tal cual. Si terminó, lo que falló fue Webpay, y el rollback
        // deshizo la cancelación.
        if (!cancelado || falla instanceof HttpException) throw falla;
        this.log.error(
          `Webpay no anuló el pago del pedido ${pedidoId}: ${String(falla)}`,
        );
        throw new BadGatewayException(
          'Webpay no dejó anular el pago, y el pedido sigue como estaba. Si Webpay ' +
            'está caído, reintenta en un rato; si pasaron 90 días desde la compra, ya ' +
            'no se puede anular, y lo que queda es cancelarlo y devolver por transferencia.',
        );
      }
    }

    // Otra cancelación ganó: la transacción ya estaba anulada y el efecto no corrió.
    if (!cancelado) throw new ConflictException('El pedido ya se canceló.');

    await this.correos.devolucion(pedidoId, {
      montoClp: pedido.totalClp,
      medio,
      cancelado: true,
    });
  }

  async devolver(
    pedidoId: number,
    nueva: DevolucionNueva,
    adminId: number,
  ): Promise<void> {
    const existe = await this.prisma.pedido.count({ where: { id: pedidoId } });
    if (existe === 0)
      throw new NotFoundException('No hay un pedido con ese número.');

    await this.prisma.$transaction(async (tx) => {
      // La fila del pedido antes de leer nada, como al crear un pedido: dos devoluciones,
      // o una devolución y una cancelación, se ordenan acá, y la vista de la transacción
      // nace después del cerrojo, con lo que dejó la primera.
      await tx.$queryRaw`SELECT id FROM pedido WHERE id = ${pedidoId} FOR UPDATE`;
      const pedido = await tx.pedido.findUniqueOrThrow({
        where: { id: pedidoId },
        include: { lineas: true },
      });
      if (!PAGADOS.includes(pedido.estado)) {
        throw new ConflictException(
          'Solo se devuelve lo que se pagó, y este pedido no está pagado.',
        );
      }

      let pagado = 0;
      for (const pedida of nueva.lineas) {
        const linea = pedido.lineas.find((l) => l.id === pedida.lineaId);
        if (!linea)
          throw new BadRequestException('Esa línea no es de este pedido.');

        const quedan = linea.cantidad - linea.cantidadDevuelta;
        if (pedida.cantidad > quedan) {
          throw new ConflictException(
            quedan === 0
              ? `${linea.descripcion} ya se devolvió entera.`
              : `De ${linea.descripcion} quedan ${quedan} por devolver.`,
          );
        }
        pagado +=
          (linea.precioUnitarioClp - linea.descuentoUnitarioClp) *
          pedida.cantidad;
      }
      if (nueva.montoClp > pagado) {
        throw new BadRequestException(
          `La devolución no puede pasar de lo que se pagó por esas unidades: ${pesos(pagado)}.`,
        );
      }

      for (const pedida of nueva.lineas) {
        const linea = pedido.lineas.find((l) => l.id === pedida.lineaId)!;
        await tx.lineaPedido.update({
          where: { id: linea.id },
          data: { cantidadDevuelta: { increment: pedida.cantidad } },
        });
        if (nueva.reponeStock && linea.varianteId) {
          await moverStock(tx, {
            varianteId: linea.varianteId,
            cantidad: pedida.cantidad,
            motivo: MotivoMovimientoStock.DEVOLUCION,
            usuarioId: adminId,
            nota: `Devolución del pedido N.º ${pedidoId}`,
          });
        }
      }

      await tx.devolucion.create({
        data: {
          pedidoId,
          montoClp: nueva.montoClp,
          medio: nueva.medio,
          reponeStock: nueva.reponeStock,
          motivo: nueva.motivo,
          registradaPorId: adminId,
        },
      });
    });

    await this.correos.devolucion(pedidoId, {
      montoClp: nueva.montoClp,
      medio: nueva.medio,
      cancelado: false,
    });
  }

  /**
   * La cancelación, dentro de la transacción que anula. **Compare-and-set** en el pedido y
   * en cada línea: el `UPDATE` lee lo último confirmado aunque la vista de la transacción
   * sea anterior, así que una devolución registrada entre medio la ataja acá.
   */
  private async cancelarDentro(
    tx: Prisma.TransactionClient,
    pedidoId: number,
    totalClp: number,
    motivo: string,
    medio: Cancelacion['medio'],
    adminId: number,
  ): Promise<void> {
    const { count } = await tx.pedido.updateMany({
      where: {
        id: pedidoId,
        canal: CanalPedido.EN_LINEA,
        estado: { in: CANCELABLES },
      },
      data: {
        estado: EstadoPedido.CANCELADO,
        canceladoEn: new Date(),
        canceladoPorId: adminId,
        motivoCancelacion: motivo,
      },
    });
    if (count === 0) throw new ConflictException(NO_SE_CANCELA);

    const lineas = await tx.lineaPedido.findMany({ where: { pedidoId } });
    for (const linea of lineas) {
      const devuelta = await tx.lineaPedido.updateMany({
        where: { id: linea.id, cantidadDevuelta: 0 },
        data: { cantidadDevuelta: linea.cantidad },
      });
      if (devuelta.count === 0) {
        throw new ConflictException(
          'Este pedido ya tiene una devolución: cancelarlo devolvería dos veces lo ' +
            'mismo. Lo que falta, regístralo como otra devolución.',
        );
      }
      // Lo vendido vuelve al estante, y el −1 de un encargo vuelve a 0.
      if (linea.varianteId) {
        await moverStock(tx, {
          varianteId: linea.varianteId,
          cantidad: linea.cantidad,
          motivo: MotivoMovimientoStock.ANULACION,
          usuarioId: adminId,
          nota: `Pedido N.º ${pedidoId} cancelado`,
        });
      }
    }

    await tx.devolucion.create({
      data: {
        pedidoId,
        montoClp: totalClp,
        medio,
        reponeStock: true,
        motivo,
        registradaPorId: adminId,
      },
    });
  }

  /**
   * El pago que se anula: el primero autorizado, el que pagó el pedido.
   *
   * `ponytail: un segundo cobro del mismo pedido ya lo dejó en revisión como "cobro de
   * más" (T165), y ese se devuelve a mano. Si pasa seguido, cancelar anula todos.`
   */
  private async pagoDe(pedidoId: number): Promise<number> {
    const pago = await this.prisma.transaccion.findFirst({
      where: {
        concepto: ConceptoPago.PEDIDO,
        conceptoId: pedidoId,
        estado: EstadoTransaccion.AUTORIZADA,
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (!pago) {
      throw new ConflictException(
        'Este pedido no tiene un pago de Webpay que anular. Puedes cancelarlo y ' +
          'devolver por transferencia.',
      );
    }

    return pago.id;
  }
}
