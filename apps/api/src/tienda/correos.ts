import { Injectable, Logger } from '@nestjs/common';

import { DatosDelClub, firmaDelClub } from '../comun/club';
import { web } from '../comun/urls';
import { EnviadorCorreo, enviarOAnotar } from '../identidad/correo';
import { PrismaService } from '../prisma/prisma.service';

/** Un pedido con lo que dicen sus correos. */
export interface PedidoParaCorreo {
  id: number;
  token: string;
  nombre: string;
  entrega: 'RETIRO' | 'DESPACHO' | 'EN_MESON';
  region: string | null;
  comuna: string | null;
  direccion: string | null;
  referencia: string | null;
  totalClp: number;
  descuentoSocioClp: number;
  documento: 'VOUCHER' | 'BOLETA' | 'FACTURA';
  facturaRazonSocial: string | null;
  /** El de Starken, al despachar (T169). */
  numeroSeguimiento?: string | null;
  lineas: {
    descripcion: string;
    cantidad: number;
    precioUnitarioClp: number;
    descuentoUnitarioClp: number;
  }[];
}

type Correo = { asunto: string; cuerpo: string };

const pesos = (monto: number) => `$${monto.toLocaleString('es-CL')}`;

/** "1 × Babolat Pure Drive · Grip 2: $249.990", ya con el descuento de la línea. */
function detalle(pedido: PedidoParaCorreo): string {
  const lineas = pedido.lineas.map(
    (l) =>
      `${l.cantidad} × ${l.descripcion}: ` +
      pesos((l.precioUnitarioClp - l.descuentoUnitarioClp) * l.cantidad),
  );
  const descuento =
    pedido.descuentoSocioClp > 0
      ? [`Descuento de socio: −${pesos(pedido.descuentoSocioClp)}`]
      : [];

  return [...lineas, ...descuento].join('\n');
}

function entrega(pedido: PedidoParaCorreo): string {
  if (pedido.entrega === 'DESPACHO') {
    const donde = [pedido.direccion, pedido.comuna, pedido.region]
      .filter(Boolean)
      .join(', ');
    const referencia = pedido.referencia ? ` (${pedido.referencia})` : '';

    return `Despacho a ${donde}${referencia}.`;
  }

  return 'Retiro en el club.';
}

/**
 * Lo que la ley pide confirmar por escrito (Ley N.º 19.496, modificada por la Ley N.º
 * 21.398). **No es adorno**: si el correo de compra no lo trae, el retracto pasa de 10 a
 * 90 días (`SPEC-tienda.md` § Legal).
 */
function condicionesDeVenta(origenWeb: string): string {
  return (
    'Condiciones de venta\n' +
    '- Garantía legal: seis meses desde que recibes el producto. Si falla, lo ' +
    'cambiamos, lo reparamos o te devolvemos lo que pagaste.\n' +
    '- Derecho a retracto: 10 días desde que recibes el producto, sin expresar causa, ' +
    'salvo lo que por su naturaleza no se puede devolver.\n' +
    `- Los términos completos están en ${origenWeb}/tienda/terminos`
  );
}

/**
 * "Compra confirmada" (T165), al comprador: el detalle, el total, la entrega, el
 * documento, el enlace para seguir el pedido y **las condiciones de venta**.
 */
export function compraConfirmada(
  pedido: PedidoParaCorreo,
  club: DatosDelClub,
  origenWeb: string,
): Correo {
  const siguiente =
    pedido.entrega === 'DESPACHO'
      ? `${entrega(pedido)} El despacho es por pagar: lo pagas a Starken al ` +
        'recibirlo. Te mandamos el número de seguimiento cuando salga.'
      : 'Retiro en el club: te avisamos por correo cuando esté listo para retirar.';
  const documento =
    pedido.documento === 'FACTURA'
      ? `Emitimos la factura a nombre de ${pedido.facturaRazonSocial ?? 'tu empresa'} ` +
        'y te la mandamos por correo.'
      : 'El comprobante de Webpay vale como boleta.';

  return {
    asunto: `Compra confirmada: pedido N.º ${pedido.id}`,
    cuerpo:
      `Hola ${pedido.nombre}:\n\n` +
      `Recibimos el pago de tu compra en la tienda de ${club.nombre}.\n\n` +
      `${detalle(pedido)}\n` +
      `Total pagado: ${pesos(pedido.totalClp)}\n\n` +
      `${siguiente}\n` +
      `${documento}\n\n` +
      'Puedes seguir tu pedido en:\n' +
      `${origenWeb}/tienda/pedido/${pedido.token}\n\n` +
      `${condicionesDeVenta(origenWeb)}\n\n` +
      firmaDelClub(club),
  };
}

/**
 * El aviso al club de un pedido pagado (T165). **Con un motivo, va en revisión**: un pago
 * que llegó con la unidad ya vendida, o uno para un pedido que ya no estaba pendiente.
 */
export function avisoAlClub(
  pedido: PedidoParaCorreo,
  motivoRevision: string | null,
  club: DatosDelClub,
  origenWeb: string,
): Correo {
  const que = motivoRevision ? 'Pedido en revisión' : 'Pedido nuevo';

  return {
    asunto: `${que} N.º ${pedido.id}: ${pesos(pedido.totalClp)}`,
    cuerpo:
      'Hola:\n\n' +
      (motivoRevision
        ? `Llegó un pago que hay que revisar. ${motivoRevision}\n\n`
        : `Llegó un pedido pagado de ${pedido.nombre}.\n\n`) +
      `${detalle(pedido)}\n` +
      `Total: ${pesos(pedido.totalClp)}\n` +
      `${entrega(pedido)}\n\n` +
      'Míralo en el panel:\n' +
      `${origenWeb}/administracion/tienda/pedidos/${pedido.id}\n\n` +
      firmaDelClub(club),
  };
}

/**
 * "Listo para retirar" (T169), al comprador: dónde, en qué horario —el de la tienda, si el
 * club lo cargó— y el enlace al pedido.
 */
export function listoParaRetirar(
  pedido: PedidoParaCorreo,
  horario: string,
  club: DatosDelClub,
  origenWeb: string,
): Correo {
  return {
    asunto: `Tu pedido N.º ${pedido.id} está listo para retirar`,
    cuerpo:
      `Hola ${pedido.nombre}:\n\n` +
      `Tu pedido ya está listo. Puedes retirarlo en ${club.nombre}` +
      (club.direccion ? `, ${club.direccion}` : '') +
      '.\n' +
      (horario ? `Horario de la tienda: ${horario}\n` : '') +
      `\n${detalle(pedido)}\n\n` +
      'El detalle de tu pedido:\n' +
      `${origenWeb}/tienda/pedido/${pedido.token}\n\n` +
      firmaDelClub(club),
  };
}

/**
 * El recordatorio de retiro (T171): **uno**, a los 7 días de quedar listo. El pedido no se
 * cancela solo (`SPEC-tienda.md` 16b), así que el correo no amenaza con nada: recuerda.
 */
export function recordatorioDeRetiro(
  pedido: Pick<PedidoParaCorreo, 'id' | 'token' | 'nombre'>,
  horario: string,
  club: DatosDelClub,
  origenWeb: string,
): Correo {
  return {
    asunto: `Tu pedido N.º ${pedido.id} te espera en el club`,
    cuerpo:
      `Hola ${pedido.nombre}:\n\n` +
      `Tu pedido sigue listo para retirar en ${club.nombre}` +
      (club.direccion ? `, ${club.direccion}` : '') +
      '.\n' +
      (horario ? `Horario de la tienda: ${horario}\n` : '') +
      '\nEl detalle de tu pedido:\n' +
      `${origenWeb}/tienda/pedido/${pedido.token}\n\n` +
      firmaDelClub(club),
  };
}

/** "Va en camino" (T169), al comprador: la empresa, el número de seguimiento y lo por pagar. */
export function despachado(
  pedido: PedidoParaCorreo,
  club: DatosDelClub,
  origenWeb: string,
): Correo {
  return {
    asunto: `Tu pedido N.º ${pedido.id} va en camino`,
    cuerpo:
      `Hola ${pedido.nombre}:\n\n` +
      `Despachamos tu pedido con Starken. ${entrega(pedido)}\n` +
      `Número de seguimiento: ${pedido.numeroSeguimiento ?? ''}\n\n` +
      'Recuerda que el despacho es por pagar: lo pagas a Starken al recibirlo.\n\n' +
      'El detalle de tu pedido:\n' +
      `${origenWeb}/tienda/pedido/${pedido.token}\n\n` +
      firmaDelClub(club),
  };
}

/**
 * Manda los correos de un pedido recién pagado. **Después de confirmar, nunca dentro**:
 * una falla del correo no puede deshacer un pago, y `enviarOAnotar` la deja en el log.
 *
 * El aviso al club va al correo de "Datos del club" (`SPEC-tienda.md` § Correos). Si el
 * club no lo cargó, a los administradores: un pedido pagado que nadie ve es plata
 * cobrada sin entregar.
 */
@Injectable()
export class CorreosDeLaTienda {
  private readonly log = new Logger('Tienda');

  constructor(
    private readonly prisma: PrismaService,
    private readonly correo: EnviadorCorreo,
  ) {}

  async pedidoPagado(
    pedidoId: number,
    motivoRevision: string | null,
  ): Promise<void> {
    try {
      const [pedido, club] = await Promise.all([
        this.prisma.pedido.findUniqueOrThrow({
          where: { id: pedidoId },
          include: { lineas: { orderBy: { id: 'asc' } } },
        }),
        this.prisma.configuracionClub.findFirstOrThrow(),
      ]);

      if (pedido.email) {
        await enviarOAnotar(
          this.correo,
          { para: pedido.email, ...compraConfirmada(pedido, club, web()) },
          this.log,
          `No salió la compra confirmada del pedido ${pedidoId}`,
        );
      }

      const aviso = avisoAlClub(pedido, motivoRevision, club, web());
      for (const para of await this.correosDelClub(club.email)) {
        await enviarOAnotar(
          this.correo,
          { para, ...aviso },
          this.log,
          `No salió el aviso del pedido ${pedidoId} para ${para}`,
        );
      }
    } catch (falla) {
      this.log.error(
        `No se pudieron armar los correos del pedido ${pedidoId}: ${String(falla)}`,
      );
    }
  }

  /** "Listo para retirar" (T169). */
  async pedidoListo(pedidoId: number): Promise<void> {
    await this.alComprador(pedidoId, 'el aviso de listo', (pedido, club) =>
      listoParaRetirar(pedido, club.tiendaHorario, club, web()),
    );
  }

  /** "Va en camino" (T169), con el número de Starken. */
  async pedidoDespachado(pedidoId: number): Promise<void> {
    await this.alComprador(pedidoId, 'el aviso de despacho', (pedido, club) =>
      despachado(pedido, club, web()),
    );
  }

  /**
   * Arma un correo al comprador y lo manda. Como `pedidoPagado`: **después del cambio de
   * estado, nunca dentro**, y una falla queda en el log sin deshacer lo hecho.
   */
  private async alComprador(
    pedidoId: number,
    que: string,
    armar: (
      pedido: PedidoParaCorreo,
      club: DatosDelClub & { tiendaHorario: string },
    ) => Correo,
  ): Promise<void> {
    try {
      const [pedido, club] = await Promise.all([
        this.prisma.pedido.findUniqueOrThrow({
          where: { id: pedidoId },
          include: { lineas: { orderBy: { id: 'asc' } } },
        }),
        this.prisma.configuracionClub.findFirstOrThrow(),
      ]);
      // En el mesón el correo es opcional: sin él, no hay a quién avisar.
      if (!pedido.email) return;

      await enviarOAnotar(
        this.correo,
        { para: pedido.email, ...armar(pedido, club) },
        this.log,
        `No salió ${que} del pedido ${pedidoId}`,
      );
    } catch (falla) {
      this.log.error(
        `No se pudo armar ${que} del pedido ${pedidoId}: ${String(falla)}`,
      );
    }
  }

  private async correosDelClub(delClub: string): Promise<string[]> {
    if (delClub) return [delClub];

    const admins = await this.prisma.usuario.findMany({
      where: { esAdmin: true },
      select: { email: true },
    });

    return admins.map((a) => a.email);
  }
}
