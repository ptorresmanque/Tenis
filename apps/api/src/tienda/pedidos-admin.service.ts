import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CanalPedido,
  EntregaPedido,
  EstadoPedido,
  Prisma,
} from '../generated/prisma/client';
import { limiteDeExpiracion } from '../pagos/expiracion';
import { PrismaService } from '../prisma/prisma.service';
import { CorreosDeLaTienda } from './correos';

/** Lo que el panel tiene que atender: lo pagado que todavía no se entrega. */
const POR_ATENDER = [
  EstadoPedido.PAGADO,
  EstadoPedido.LISTO_PARA_RETIRO,
  EstadoPedido.DESPACHADO,
];

/** Cuántos días listo sin retirar hasta que el panel lo marca (`SPEC-tienda.md` 16b). */
const DIAS_SIN_RETIRAR = 30;

/** El filtro de la lista. Sin estado, lo que hay que atender. */
export interface FiltroDePedidos {
  estado: EstadoPedido | null;
  canal: CanalPedido | null;
}

/** Un pedido en la lista del panel. */
export interface PedidoDelPanel {
  id: number;
  canal: CanalPedido;
  estado: EstadoPedido;
  entrega: EntregaPedido;
  nombre: string;
  email: string;
  totalClp: number;
  creadoEn: Date;
  pagadoEn: Date | null;
  requiereRevision: boolean;
  /** Listo hace más de 30 días y nadie lo retiró. Se calcula al listar. */
  sinRetirar: boolean;
  lineas: number;
}

/** Cada acción: de qué estado sale, a cuál llega y con qué entrega se puede. */
const ACCIONES = {
  listo: {
    desde: [EstadoPedido.PAGADO],
    hacia: EstadoPedido.LISTO_PARA_RETIRO,
    entregas: [EntregaPedido.RETIRO],
    fecha: 'listoEn',
    noSePuede:
      'Solo un pedido pagado con retiro en el club se marca listo para retirar.',
  },
  despachado: {
    desde: [EstadoPedido.PAGADO],
    hacia: EstadoPedido.DESPACHADO,
    entregas: [EntregaPedido.DESPACHO],
    fecha: 'despachadoEn',
    noSePuede: 'Solo un pedido pagado con despacho se marca despachado.',
  },
  entregado: {
    desde: [EstadoPedido.LISTO_PARA_RETIRO, EstadoPedido.DESPACHADO],
    hacia: EstadoPedido.ENTREGADO,
    entregas: [EntregaPedido.RETIRO, EntregaPedido.DESPACHO],
    fecha: 'entregadoEn',
    noSePuede:
      'Solo un pedido listo para retirar o despachado se marca entregado.',
  },
} as const;

export type AccionDePedido = keyof typeof ACCIONES;

/**
 * Los pedidos en el panel (T169): la lista, el detalle y las acciones de cada estado.
 *
 * **Las marcas se calculan al listar**, sin job: "30 días sin retirar" sale de `listoEn`, y
 * los pendientes que vencieron pasan a `EXPIRADO` con un barrido al listar, el mismo que
 * libera los bloques de `reservas` (`SPEC-tienda.md` § Disponibilidad).
 */
@Injectable()
export class PedidosDelPanel {
  constructor(
    private readonly prisma: PrismaService,
    private readonly correos: CorreosDeLaTienda,
  ) {}

  /**
   * `ponytail: los últimos 200, sin paginar. Con lo que vende un club alcanza para meses;
   * si no, se pagina.`
   */
  async listar(
    filtro: FiltroDePedidos,
    ahora = new Date(),
  ): Promise<PedidoDelPanel[]> {
    await this.prisma.pedido.updateMany({
      where: {
        estado: EstadoPedido.PENDIENTE_PAGO,
        creadoEn: { lte: limiteDeExpiracion(ahora) },
      },
      data: { estado: EstadoPedido.EXPIRADO },
    });

    const pedidos = await this.prisma.pedido.findMany({
      where: {
        estado: filtro.estado ?? { in: POR_ATENDER },
        ...(filtro.canal ? { canal: filtro.canal } : {}),
      },
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      take: 200,
      select: {
        id: true,
        canal: true,
        estado: true,
        entrega: true,
        nombre: true,
        email: true,
        totalClp: true,
        creadoEn: true,
        pagadoEn: true,
        listoEn: true,
        requiereRevision: true,
        _count: { select: { lineas: true } },
      },
    });
    const limite = ahora.getTime() - DIAS_SIN_RETIRAR * 24 * 60 * 60_000;

    return pedidos.map(({ listoEn, _count, ...pedido }) => ({
      ...pedido,
      sinRetirar:
        pedido.estado === EstadoPedido.LISTO_PARA_RETIRO &&
        listoEn !== null &&
        listoEn.getTime() <= limite,
      lineas: _count.lineas,
    }));
  }

  /** Todo el pedido: el contacto, la entrega, la factura, las líneas y las devoluciones. */
  async detalle(id: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: {
        lineas: { orderBy: { id: 'asc' } },
        devoluciones: { orderBy: { id: 'asc' } },
      },
    });
    if (!pedido)
      throw new NotFoundException('No hay un pedido con ese número.');

    return pedido;
  }

  /**
   * Una acción de su estado. **Compare-and-set**: el cambio va con el estado esperado en el
   * `where`, así que dos clics a la vez —o dos admins— no lo aplican dos veces ni mandan dos
   * correos. Fuera de su estado, 409 con lo que se puede hacer.
   */
  async aplicar(
    id: number,
    accion: AccionDePedido,
    numeroSeguimiento: string | null = null,
  ): Promise<void> {
    const regla = ACCIONES[accion];

    const { count } = await this.prisma.pedido.updateMany({
      where: {
        id,
        estado: { in: [...regla.desde] },
        entrega: { in: [...regla.entregas] },
      },
      data: {
        estado: regla.hacia,
        [regla.fecha]: new Date(),
        ...(accion === 'despachado' ? { numeroSeguimiento } : {}),
      } satisfies Prisma.PedidoUpdateManyMutationInput,
    });

    if (count === 0) {
      const existe = await this.prisma.pedido.count({ where: { id } });
      if (existe === 0)
        throw new NotFoundException('No hay un pedido con ese número.');
      throw new ConflictException(regla.noSePuede);
    }

    if (accion === 'listo') await this.correos.pedidoListo(id);
    if (accion === 'despachado') await this.correos.pedidoDespachado(id);
  }
}
