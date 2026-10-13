import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CanalPedido,
  DocumentoPedido,
  EntregaPedido,
  EstadoPedido,
  MedioPagoPedido,
  Prisma,
} from '../generated/prisma/client';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { limiteDeExpiracion } from '../pagos/expiracion';
import { PrismaService } from '../prisma/prisma.service';
import { CarritoDeLaTienda, LineaCotizada } from './carrito.service';
import type { PedidoNuevo } from './pedidos.dto';

/** Lo que ve quien tiene el enlace del pedido (T166): su compra, sin datos de cuentas. */
const PEDIDO_PUBLICO = {
  id: true,
  token: true,
  estado: true,
  entrega: true,
  nombre: true,
  email: true,
  // Sin el teléfono: ninguna pantalla lo muestra, y lo que no se muestra no viaja.
  region: true,
  comuna: true,
  direccion: true,
  referencia: true,
  numeroSeguimiento: true,
  totalClp: true,
  descuentoSocioClp: true,
  documento: true,
  facturaRazonSocial: true,
  creadoEn: true,
  pagadoEn: true,
  listoEn: true,
  despachadoEn: true,
  entregadoEn: true,
  lineas: {
    select: {
      descripcion: true,
      cantidad: true,
      precioUnitarioClp: true,
      descuentoUnitarioClp: true,
      esEncargo: true,
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.PedidoSelect;

export type PedidoPublico = Prisma.PedidoGetPayload<{
  select: typeof PEDIDO_PUBLICO;
}>;

/** Lo que vuelve al crear un pedido: con qué seguirlo y cuánto cobrar. */
export interface PedidoCreado {
  token: string;
  totalClp: number;
}

/**
 * Los pedidos de la tienda en línea (T164).
 *
 * **Crear un pedido toma la fila de cada variante con `SELECT … FOR UPDATE`**, cotiza con
 * lo disponible bajo ese cerrojo y recién entonces inserta. Dos compradores por la última
 * unidad: el segundo espera, ve cero disponible y recibe "se agotó mientras comprabas"
 * **antes** de ir a Webpay (`SPEC-tienda.md` § Disponibilidad).
 *
 * El pedido nace en `PENDIENTE_PAGO` y aparta sus unidades durante `MINUTOS_PARA_EXPIRAR`
 * (`disponible.ts`). **El stock no baja acá**: baja cuando el pago se confirma (T165).
 */
@Injectable()
export class PedidosDeLaTienda {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carrito: CarritoDeLaTienda,
  ) {}

  crear(datos: PedidoNuevo, yo: UsuarioActual | null): Promise<PedidoCreado> {
    return this.prisma.$transaction(async (tx) => {
      // En orden de id: dos pedidos con las mismas variantes las toman en el mismo orden y
      // no se cruzan. Va por SQL crudo porque Prisma no expone `FOR UPDATE`; los ids viajan
      // parametrizados.
      const ids = datos.lineas.map((l) => l.varianteId).sort((a, b) => a - b);
      await tx.$queryRaw`SELECT id FROM variante WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;

      // Se cotiza bajo el cerrojo: el precio, el descuento y lo disponible son los de este
      // instante, y nada que mande el cliente. **El orden importa**: en REPEATABLE READ la
      // vista de la transacción nace con su primera lectura sin cerrojo, que es esta, ya con
      // el `FOR UPDATE` tomado. Así el segundo pedido ve el que el primero acaba de guardar;
      // una lectura antes del cerrojo lo dejaría mirando la base de antes.
      const cotizacion = await this.carrito.cotizar(datos.lineas, yo, tx);
      const problema = cotizacion.lineas.find((l) => l.estado !== 'ok');
      if (problema) throw new ConflictException(porQueNo(problema));
      // Lo que va por encargo se retira en el club (decisión 35): llega cuando llega, y un
      // despacho por pagar sobre una fecha estimada es un paquete que nadie espera.
      if (datos.entrega === 'DESPACHO' && !cotizacion.sePuedeDespachar) {
        throw new ConflictException(
          'Lo que va por encargo se retira en el club: elige retiro para seguir.',
        );
      }

      const token = randomUUID();
      await tx.pedido.create({
        data: {
          token,
          canal: CanalPedido.EN_LINEA,
          estado: EstadoPedido.PENDIENTE_PAGO,
          entrega: EntregaPedido[datos.entrega],
          usuarioId: yo?.id ?? null,
          socioId: cotizacion.descuentoClp > 0 ? (yo?.socioId ?? null) : null,
          nombre: datos.nombre,
          email: datos.email,
          telefono: datos.telefono,
          ...datos.despacho,
          totalClp: cotizacion.totalClp,
          descuentoSocioClp: cotizacion.descuentoClp,
          medioPago: MedioPagoPedido.WEBPAY,
          // Webpay: el comprobante vale como boleta. Quien pide factura, factura.
          documento: datos.factura
            ? DocumentoPedido.FACTURA
            : DocumentoPedido.VOUCHER,
          facturaRut: datos.factura?.rut,
          facturaRazonSocial: datos.factura?.razonSocial,
          facturaGiro: datos.factura?.giro,
          facturaDireccion: datos.factura?.direccion,
          lineas: {
            create: cotizacion.lineas.map((linea) => ({
              varianteId: linea.varianteId,
              descripcion: descripcion(linea),
              cantidad: linea.cantidad,
              precioUnitarioClp: linea.precioUnitarioClp ?? 0,
              descuentoUnitarioClp: linea.descuentoUnitarioClp,
              esEncargo: linea.porEncargo,
            })),
          },
        },
      });

      return { token, totalClp: cotizacion.totalClp };
    });
  }

  /**
   * El pedido de un enlace (T166): la confirmación y el seguimiento. Sin sesión: el token
   * lo conoce quien compró, como el de una reserva.
   *
   * Un pendiente que pasó su plazo se muestra vencido aunque nadie lo haya marcado: el
   * barrido es al leer, como el apartado.
   */
  async porToken(token: string): Promise<PedidoPublico> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { token },
      select: PEDIDO_PUBLICO,
    });
    if (!pedido)
      throw new NotFoundException('No hay un pedido con ese enlace.');

    const vencido =
      pedido.estado === EstadoPedido.PENDIENTE_PAGO &&
      pedido.creadoEn <= limiteDeExpiracion();

    return vencido ? { ...pedido, estado: EstadoPedido.EXPIRADO } : pedido;
  }

  /**
   * "Mis pedidos" (T166): las compras de quien mira, de la más nueva a la más vieja. **Sin
   * los intentos sin pagar**: un pedido pendiente o vencido no es una compra.
   *
   * `ponytail: los últimos 50, sin paginar. Un club no vende 50 pedidos a una persona; si
   * pasa, se pagina.`
   */
  mios(usuarioId: number) {
    return this.prisma.pedido.findMany({
      where: {
        usuarioId,
        estado: {
          notIn: [EstadoPedido.PENDIENTE_PAGO, EstadoPedido.EXPIRADO],
        },
      },
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      take: 50,
      select: {
        id: true,
        token: true,
        estado: true,
        entrega: true,
        totalClp: true,
        creadoEn: true,
        _count: { select: { lineas: true } },
      },
    });
  }
}

/** "Babolat Pure Drive · Grip 2": lo que se compró, como se leía al comprarlo. */
function descripcion(linea: LineaCotizada): string {
  const { marca, nombre } = linea.producto ?? {
    marca: null,
    nombre: 'Producto',
  };

  return [[marca, nombre].filter(Boolean).join(' '), linea.talla]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 255);
}

function porQueNo(linea: LineaCotizada): string {
  if (linea.estado === 'no-disponible') {
    return `${linea.producto ? descripcion(linea) : 'Un producto del carrito'} ya no está a la venta. Quítalo del carrito para seguir.`;
  }

  return linea.disponible === 0
    ? `Se agotó mientras comprabas: ya no queda ${descripcion(linea)}.`
    : `Se agotó mientras comprabas: de ${descripcion(linea)} quedan ${linea.disponible}.`;
}
