import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { RedireccionAPasarela } from '../core/pagos/ir-a-pagar';

export type EstadoCuota = 'PENDIENTE' | 'PAGADA' | 'ANULADA';
export type MedioPago = 'WEBPAY' | 'EFECTIVO' | 'TRANSFERENCIA';

/** Espejo de una fila de `GET /api/admin/cuotas`. */
export interface CuotaDelMes {
  id: number;
  socioId: number;
  tipo: 'MENSUAL' | 'INCORPORACION';
  periodo: string;
  montoClp: number;
  descuentoClp: number;
  motivoDescuento: string | null;
  estado: EstadoCuota;
  pagadaEn: string | null;
  medio: MedioPago | null;
  socio: { numeroSocio: string; nombre: string; email: string };
}

export interface MesDeCuotas {
  periodo: string;
  cuotas: CuotaDelMes[];
  totalEmitidoClp: number;
  totalPagadoClp: number;
}

/** Una cuota como la ve su propio socio. */
export interface MiCuota {
  id: number;
  tipo: 'MENSUAL' | 'INCORPORACION';
  periodo: string;
  montoClp: number;
  descuentoClp: number;
  estado: EstadoCuota;
  pagadaEn: string | null;
  medio: MedioPago | null;
}

/** Un socio con cuotas impagas, como lo lista el panel de morosidad. */
export interface Moroso {
  socioId: number;
  numeroSocio: string;
  nombre: string;
  email: string;
  cuotasImpagas: number;
  deudaClp: number;
  desdePeriodo: string;
}

/** Lo que el admin puede hacerle a una cuota que todavía no se cobró. */
export interface AjusteDeCuota {
  descuentoClp?: number;
  condonar?: boolean;
  anular?: boolean;
  /** Obligatorio en los tres casos: el servidor lo exige. */
  motivo: string;
}

/**
 * Las cuotas del club.
 *
 * **Pedir el mes lo emite.** No es un efecto raro: es la decisión de `SPEC-cuotas.md`
 * —la emisión es perezosa, no hay cron— y por eso esta pantalla no tiene ningún botón
 * de "generar cuotas" que alguien tenga que acordarse de apretar.
 */
@Service()
export class Cuotas {
  private readonly http = inject(HttpClient);

  /**
   * El cobro en el mesón.
   *
   * `WEBPAY` no es un medio válido acá: ese lo escribe la pasarela cuando el cobro se
   * autoriza de verdad, y el servidor lo rechaza.
   */
  cobrar(
    id: number,
    medio: 'EFECTIVO' | 'TRANSFERENCIA',
  ): Promise<CuotaDelMes> {
    return firstValueFrom(
      this.http.post<CuotaDelMes>(`/api/admin/cuotas/${id}/pago`, { medio }),
    );
  }

  /** Lo que el socio debe de lo suyo. Vacío para quien todavía no es socio. */
  mias(): Promise<{ cuotas: MiCuota[]; deudaClp: number }> {
    return firstValueFrom(
      this.http.get<{ cuotas: MiCuota[]; deudaClp: number }>('/api/cuotas/mias'),
    );
  }

  /**
   * Empieza el cobro en línea y devuelve a dónde mandar a la persona.
   *
   * El monto no viaja: sale de la cuota emitida. Aceptarlo del navegador sería dejar
   * que cada socio elija cuánto paga.
   */
  pagar(id: number): Promise<RedireccionAPasarela> {
    return firstValueFrom(
      this.http.post<RedireccionAPasarela>(`/api/cuotas/${id}/pagar`, {}),
    );
  }

  morosos(): Promise<Moroso[]> {
    return firstValueFrom(this.http.get<Moroso[]>('/api/admin/cuotas/morosos'));
  }

  /**
   * Descuento, condonación o anulación.
   *
   * Los tres exigen motivo y lo impone el servidor: un descuento sin motivo no se
   * distingue de un error de tipeo seis meses después.
   */
  ajustar(id: number, ajuste: AjusteDeCuota): Promise<CuotaDelMes> {
    return firstValueFrom(
      this.http.patch<CuotaDelMes>(`/api/admin/cuotas/${id}`, ajuste),
    );
  }

  delMes(periodo: string): Promise<MesDeCuotas> {
    return firstValueFrom(
      this.http.get<MesDeCuotas>('/api/admin/cuotas', { params: { periodo } }),
    );
  }
}
