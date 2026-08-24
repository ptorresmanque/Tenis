import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

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

  delMes(periodo: string): Promise<MesDeCuotas> {
    return firstValueFrom(
      this.http.get<MesDeCuotas>('/api/admin/cuotas', { params: { periodo } }),
    );
  }
}
