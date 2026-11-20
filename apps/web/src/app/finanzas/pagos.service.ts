import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** De dónde sale el pago: la pasarela, o un cobro del mesón de una cuota o una inscripción. */
export type OrigenDelPago = 'webpay' | 'cuota' | 'inscripcion';
export type ConceptoDelPago = 'RESERVA' | 'CUOTA' | 'INSCRIPCION';
export type EstadoDelPago =
  | 'PENDIENTE'
  | 'AUTORIZADA'
  | 'RECHAZADA'
  | 'ANULADA'
  | 'EXPIRADA'
  | 'MESON';
export type MedioDelPago = 'WEBPAY' | 'EFECTIVO' | 'TRANSFERENCIA';

/** Una fila de Finanzas › Pagos, como la manda `GET /api/admin/pagos` (T396). */
export interface FilaDePago {
  origen: OrigenDelPago;
  id: number;
  /** Cuándo se movió la plata. */
  fecha: string;
  concepto: ConceptoDelPago;
  detalle: string;
  quien: string;
  esSocio: boolean;
  medio: MedioDelPago;
  tipoPago: string | null;
  montoClp: number;
  estado: EstadoDelPago;
  referencia: string | null;
  codigoAutorizacion: string | null;
  porRevisar: boolean;
}

export interface ListadoDePagos {
  pagos: FilaDePago[];
  total: number;
  pagina: number;
  porPagina: number;
  /** Del filtro entero, no de la página. */
  resumen: { cobradoClp: number; devueltoClp: number; porRevisar: number };
}

/** Lo que se filtra, como viaja en la dirección y a la API. */
export interface FiltroDePagos {
  desde: string;
  hasta: string;
  conceptos: ConceptoDelPago[];
  estado: EstadoDelPago | null;
  medio: MedioDelPago | null;
  q: string;
  porRevisar: boolean;
  orden: 'fecha' | 'monto';
  direccion: 'asc' | 'desc';
}

/** Los parámetros de la consulta: lo que no se filtra no viaja. */
export function parametrosDe(filtro: FiltroDePagos): Record<string, string> {
  return {
    desde: filtro.desde,
    hasta: filtro.hasta,
    ...(filtro.conceptos.length > 0 && { concepto: filtro.conceptos.join(',') }),
    ...(filtro.estado && { estado: filtro.estado }),
    ...(filtro.medio && { medio: filtro.medio }),
    ...(filtro.q && { q: filtro.q }),
    ...(filtro.porRevisar && { porRevisar: 'true' }),
    orden: filtro.orden,
    direccion: filtro.direccion,
  };
}

/** Finanzas › Pagos (T398): los pagos por Webpay y los cobros del mesón, solo para el admin. */
@Service()
export class PagosDelClub {
  private readonly http = inject(HttpClient);

  listar(filtro: FiltroDePagos, pagina: number): Promise<ListadoDePagos> {
    return firstValueFrom(
      this.http.get<ListadoDePagos>('/api/admin/pagos', {
        params: { ...parametrosDe(filtro), pagina },
      }),
    );
  }

  /** La planilla del mismo filtro, sin paginar: la baja el navegador con `<a download>`. */
  urlDelCsv(filtro: FiltroDePagos): string {
    return `/api/admin/pagos.csv?${new URLSearchParams(parametrosDe(filtro))}`;
  }
}
