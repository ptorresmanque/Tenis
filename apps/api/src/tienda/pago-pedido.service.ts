import {
  ConflictException,
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
import { ConfirmacionService } from '../pagos/confirmacion.service';
import { limiteDeExpiracion } from '../pagos/expiracion';
import { PagosService } from '../pagos/pagos.service';
import { PrismaService } from '../prisma/prisma.service';
import { CorreosDeLaTienda } from './correos';
import { moverStock } from './stock';

export interface PagoDePedidoIniciado {
  totalClp: number;
  urlRedireccion: string;
  /** Se manda como `token_ws` en el POST a la pasarela. Ver `PagoIniciado`. */
  tokenPasarela: string;
}

/** Cómo terminó la vuelta, para saber a qué pantalla mandar a la persona. */
export type VueltaDelPago =
  | { resultado: 'listo'; pedidoToken: string }
  | { resultado: 'rechazado' | 'anulado' | 'invalido' };

/** Lo que dejó el efecto del pago, para los correos que salen después. */
interface Efecto {
  pedidoId: number;
  motivoRevision: string | null;
}

/**
 * Pagar un pedido de la tienda con Webpay (T165), con el modelo de
 * `cuotas/pago-en-linea.service.ts`: la tienda no habla con Transbank, le pide un cobro a
 * `pagos` y aplica su efecto en la misma transacción que lo confirma. **La idempotencia
 * del callback duplicado está resuelta allá** y no se vuelve a resolver acá.
 */
@Injectable()
export class PagoDePedido {
  private readonly log = new Logger('Tienda');

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagos: PagosService,
    private readonly confirmacion: ConfirmacionService,
    private readonly correos: CorreosDeLaTienda,
  ) {}

  /**
   * Empieza el cobro de un pedido pendiente que no venció. El token del pedido hace de
   * llave: quien vuelve al paso de pagar reintenta con el mismo pedido, sin crear otro
   * que choque con su propio apartado.
   */
  async iniciar(
    token: string,
    urlRetorno: string,
  ): Promise<PagoDePedidoIniciado> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { token },
      select: {
        id: true,
        canal: true,
        estado: true,
        creadoEn: true,
        totalClp: true,
        usuarioId: true,
      },
    });

    if (!pedido || pedido.canal !== CanalPedido.EN_LINEA) {
      throw new NotFoundException('No hay un pedido con ese enlace.');
    }
    if (pedido.estado !== EstadoPedido.PENDIENTE_PAGO) {
      throw new ConflictException(
        pedido.estado === EstadoPedido.EXPIRADO
          ? 'Ese pedido ya no está pendiente: vuelve al carrito para armarlo de nuevo.'
          : 'Ese pedido ya está pagado.',
      );
    }
    // Vencido el apartado, sus unidades pueden ser de otro: cobrar sería vender lo que
    // tal vez ya no hay.
    if (pedido.creadoEn <= limiteDeExpiracion()) {
      throw new ConflictException(
        'Pasaron más de 15 minutos y el pedido venció: vuelve al carrito para armarlo de nuevo.',
      );
    }

    const pago = await this.pagos.iniciar({
      concepto: ConceptoPago.PEDIDO,
      conceptoId: pedido.id,
      montoClp: pedido.totalClp,
      usuarioId: pedido.usuarioId,
      urlRetorno,
    });

    return {
      totalClp: pedido.totalClp,
      urlRedireccion: pago.urlRedireccion,
      tokenPasarela: pago.tokenPasarela,
    };
  }

  /**
   * La vuelta desde Webpay. Autorizado: el pedido queda pagado y salen los correos.
   * **Rechazado o anulado: el pedido se suelta al tiro** (`EXPIRADO`), y con él sus
   * unidades, sin esperar los 15 minutos: si no, quien anula y reintenta chocaría con su
   * propio apartado por la última unidad.
   */
  async volver(
    tokenWs: string | undefined,
    tokenAnulado: string | undefined,
    ordenAnulada: string | undefined,
  ): Promise<VueltaDelPago> {
    // Solo `token_ws`, sin `TBK_TOKEN`, trae un pago que confirmar. Sin `token_ws` vuelve
    // quien apretó "anular" o dejó vencer el formulario —este, sin ningún token—, y los dos
    // traen `TBK_ORDEN_COMPRA`, que es la `referencia`: el mismo camino que la reserva del
    // no-socio y la inscripción al torneo.
    if (!tokenWs || tokenAnulado) {
      const transaccion = await this.deLaTienda({
        referencia: ordenAnulada ?? '',
      });
      if (transaccion) await this.soltar(transaccion.conceptoId);

      return { resultado: 'anulado' };
    }

    const transaccion = await this.deLaTienda({ tokenPasarela: tokenWs });
    if (!transaccion) return { resultado: 'invalido' };

    let efecto: Efecto | null = null;
    const confirmada = await this.confirmacion.confirmar(
      tokenWs,
      async (tx, { conceptoId }) => {
        efecto = await this.aplicar(tx, conceptoId);
      },
    );

    if (confirmada.estado !== EstadoTransaccion.AUTORIZADA) {
      await this.soltar(transaccion.conceptoId);
      return { resultado: 'rechazado' };
    }

    // Solo si el efecto corrió en esta llamada: el callback repetido no repite correos.
    const aplicado = efecto as Efecto | null;
    if (aplicado) {
      await this.correos.pedidoPagado(
        aplicado.pedidoId,
        aplicado.motivoRevision,
      );
    }

    const { token } = await this.prisma.pedido.findUniqueOrThrow({
      where: { id: transaccion.conceptoId },
      select: { token: true },
    });

    return { resultado: 'listo', pedidoToken: token };
  }

  /**
   * La transacción de un pedido, por su token o su referencia. **Solo de la tienda**: con
   * el token de una cuota, el efecto del pedido correría sobre el pedido que tenga el
   * número de esa cuota.
   */
  private async deLaTienda(
    donde: { tokenPasarela: string } | { referencia: string },
  ) {
    const transaccion = await this.prisma.transaccion.findUnique({
      where: donde,
      select: { concepto: true, conceptoId: true },
    });

    return transaccion?.concepto === ConceptoPago.PEDIDO ? transaccion : null;
  }

  /**
   * El efecto del pago, dentro de la transacción que lo confirma: el pedido a `PAGADO` y
   * una venta por línea en el stock, con `moverStock`. **Se confirma aunque falte stock**
   * —la plata ya se cobró—: el pedido queda en revisión y el club se entera.
   */
  private async aplicar(
    tx: Prisma.TransactionClient,
    pedidoId: number,
  ): Promise<Efecto> {
    // `EXPIRADO` también: un pago que llega cuando el pedido ya se había soltado se
    // cobró igual, y el pedido tiene que reflejarlo.
    const { count } = await tx.pedido.updateMany({
      where: {
        id: pedidoId,
        estado: { in: [EstadoPedido.PENDIENTE_PAGO, EstadoPedido.EXPIRADO] },
      },
      data: { estado: EstadoPedido.PAGADO, pagadoEn: new Date() },
    });

    if (count === 0) {
      // Ya estaba pagado o cancelado: este cobro es de más. No se descuenta de nuevo.
      await tx.pedido.update({
        where: { id: pedidoId },
        data: { requiereRevision: true },
      });
      this.log.error(`Llegó un segundo pago para el pedido ${pedidoId}.`);

      return {
        pedidoId,
        motivoRevision:
          'Llegó un pago para un pedido que ya no estaba pendiente: puede ser un ' +
          'cobro de más, que hay que devolver.',
      };
    }

    const lineas = await tx.lineaPedido.findMany({
      where: { pedidoId, varianteId: { not: null } },
      select: {
        varianteId: true,
        cantidad: true,
        descripcion: true,
        esEncargo: true,
      },
    });
    const faltantes: string[] = [];

    for (const linea of lineas) {
      const quedo = await moverStock(tx, {
        varianteId: linea.varianteId!,
        cantidad: -linea.cantidad,
        motivo: MotivoMovimientoStock.VENTA,
        nota: `Pedido en línea N.º ${pedidoId}`,
      });

      // Por encargo, quedar en negativo es lo esperado: "le debemos uno a alguien".
      if (quedo < 0 && !linea.esEncargo) {
        faltantes.push(`${linea.descripcion}: el stock quedó en −${-quedo}`);
      }
    }

    if (faltantes.length === 0) return { pedidoId, motivoRevision: null };

    await tx.pedido.update({
      where: { id: pedidoId },
      data: { requiereRevision: true },
    });

    return {
      pedidoId,
      motivoRevision:
        'El pago llegó con lo comprado ya vendido. ' +
        faltantes.join('. ') +
        '.',
    };
  }

  /** El pedido se suelta, si todavía estaba pendiente: sus unidades vuelven al tiro. */
  private async soltar(pedidoId: number): Promise<void> {
    await this.prisma.pedido.updateMany({
      where: { id: pedidoId, estado: EstadoPedido.PENDIENTE_PAGO },
      data: { estado: EstadoPedido.EXPIRADO },
    });
  }
}
