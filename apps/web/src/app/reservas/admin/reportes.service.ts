import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Una hora reportada, como la ve el admin.
 *
 * **No trae quién reportó, y no es un olvido**: el anonimato es lo que sostiene la
 * función. El servidor tampoco lo devuelve (T34).
 */
export interface HoraReportada {
  reservaId: number;
  folio: string;
  cancha: string;
  inicio: string;
  fin: string;
  /** Cuántos socios distintos avisaron por esta misma hora. */
  reportes: number;
  ultimoReporteEn: string;
  socio: {
    id: number;
    numeroSocio: string;
    nombre: string;
    sancionadoHasta: string | null;
  } | null;
}

export type Decision = 'SANCIONAR' | 'DESCARTAR';

/** La bandeja del admin. Lo que puede hacer un socio vive en `../reportes.service`. */
@Service()
export class Reportes {
  private readonly http = inject(HttpClient);

  pendientes(): Promise<HoraReportada[]> {
    return firstValueFrom(this.http.get<HoraReportada[]>('/api/admin/reportes'));
  }

  resolver(
    reservaId: number,
    decision: Decision,
  ): Promise<{ sancionadoHasta: string | null }> {
    return firstValueFrom(
      this.http.post<{ sancionadoHasta: string | null }>(
        `/api/admin/reportes/${reservaId}`,
        { decision },
      ),
    );
  }
}
