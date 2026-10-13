import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { EntregaPedido, EstadoPedido } from '../tienda.service';

export type CanalPedido = 'EN_LINEA' | 'MESON';
export type AccionDePedido = 'listo' | 'despachado' | 'entregado';
export type MedioDevolucion = 'WEBPAY' | 'TRANSFERENCIA' | 'EFECTIVO';

/** Plata que volvió al comprador (T174): la cancelación entera o una parte. */
export interface DevolucionDelPedido {
  id: number;
  montoClp: number;
  medio: MedioDevolucion;
  reponeStock: boolean;
  motivo: string;
  creadaEn: string;
}

/** Lo que se manda al devolver una parte. Por Webpay no: solo se anula el total. */
export interface DevolucionNueva {
  lineas: { lineaId: number; cantidad: number }[];
  montoClp: number;
  medio: 'TRANSFERENCIA' | 'EFECTIVO';
  reponeStock: boolean;
  motivo: string;
}

/** Espejo de `PedidoDelPanel` en la API (T169). */
export interface PedidoDelPanel {
  id: number;
  canal: CanalPedido;
  estado: EstadoPedido;
  entrega: EntregaPedido;
  nombre: string;
  email: string;
  totalClp: number;
  creadoEn: string;
  pagadoEn: string | null;
  requiereRevision: boolean;
  /** Listo hace más de 30 días y nadie lo retiró. */
  sinRetirar: boolean;
  lineas: number;
}

/** El pedido completo, como lo trae el detalle del panel. */
export interface DetalleDePedido {
  id: number;
  token: string;
  canal: CanalPedido;
  estado: EstadoPedido;
  entrega: EntregaPedido;
  requiereRevision: boolean;
  nombre: string;
  email: string;
  telefono: string;
  region: string | null;
  comuna: string | null;
  direccion: string | null;
  referencia: string | null;
  numeroSeguimiento: string | null;
  totalClp: number;
  descuentoSocioClp: number;
  medioPago: 'WEBPAY' | 'TARJETA_MESON' | 'EFECTIVO' | 'TRANSFERENCIA';
  documento: 'VOUCHER' | 'BOLETA' | 'FACTURA';
  folioDocumento: string | null;
  facturaRut: string | null;
  facturaRazonSocial: string | null;
  facturaGiro: string | null;
  facturaDireccion: string | null;
  creadoEn: string;
  pagadoEn: string | null;
  listoEn: string | null;
  despachadoEn: string | null;
  entregadoEn: string | null;
  lineas: {
    id: number;
    descripcion: string;
    cantidad: number;
    precioUnitarioClp: number;
    descuentoUnitarioClp: number;
    esEncargo: boolean;
    /** Las unidades que ya se devolvieron (T174). */
    cantidadDevuelta: number;
  }[];
  devoluciones: DevolucionDelPedido[];
}

/** Los pedidos de la tienda para el panel (T169). */
@Service()
export class PedidosDeLaTiendaAdmin {
  private readonly http = inject(HttpClient);

  listar(filtro: { estado: EstadoPedido | null; canal: CanalPedido | null }) {
    const params = Object.fromEntries(
      Object.entries(filtro).filter(([, valor]) => valor !== null),
    ) as Record<string, string>;

    return firstValueFrom(this.http.get<PedidoDelPanel[]>('/api/admin/tienda/pedidos', { params }));
  }

  detalle(id: number): Promise<DetalleDePedido> {
    return firstValueFrom(this.http.get<DetalleDePedido>(`/api/admin/tienda/pedidos/${id}`));
  }

  async accion(id: number, cual: AccionDePedido, cuerpo: object): Promise<void> {
    await firstValueFrom(this.http.post(`/api/admin/tienda/pedidos/${id}/${cual}`, cuerpo));
  }

  /** Anula en Webpay, o con `TRANSFERENCIA`, cancela y devuelve por fuera (T174). */
  async cancelar(
    id: number,
    cuerpo: { motivo: string; medio: 'WEBPAY' | 'TRANSFERENCIA' },
  ): Promise<void> {
    await firstValueFrom(this.http.post(`/api/admin/tienda/pedidos/${id}/cancelar`, cuerpo));
  }

  async devolver(id: number, cuerpo: DevolucionNueva): Promise<void> {
    await firstValueFrom(this.http.post(`/api/admin/tienda/pedidos/${id}/devoluciones`, cuerpo));
  }
}
