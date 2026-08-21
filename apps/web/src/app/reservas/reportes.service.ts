import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Una hora que este socio podría reportar, para el botón de la grilla. */
export interface HoraReportable {
  reservaId: number;
  canchaId: number;
  /** Instante en UTC, con el mismo formato con que la grilla nombra sus bloques. */
  inicio: string;
  yaReportada: boolean;
}

/**
 * Reportar una hora que quedó sin usar, desde el lado del socio.
 *
 * Separado de `admin/reportes.service.ts` aunque hablen de lo mismo: eso es la
 * bandeja donde el club decide, y esto es lo que puede hacer cualquier socio. Vivir
 * bajo `admin/` haría creer que la grilla pública necesita permisos de
 * administración para funcionar.
 */
@Service()
export class ReportesDelSocio {
  private readonly http = inject(HttpClient);

  reportables(fecha: string): Promise<HoraReportable[]> {
    return firstValueFrom(
      this.http.get<HoraReportable[]>('/api/reservas/reportables', {
        params: { fecha },
      }),
    );
  }

  reportar(reservaId: number): Promise<{ mensaje: string }> {
    return firstValueFrom(
      this.http.post<{ mensaje: string }>(
        `/api/reservas/${reservaId}/reportes`,
        {},
      ),
    );
  }
}
