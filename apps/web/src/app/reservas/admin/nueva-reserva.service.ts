import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Espejo de `CupoDelSocio` en la API. */
export interface CupoDelSocio {
  socioId: number;
  nombre: string;
  numeroSocio: string;
  estado: string;
  alDia: boolean;
  reservasDelDia: number;
  cupoDiarioSocioReservas: number;
  reservasPicoDeLaSemana: number;
  cupoPicoSemanalReservas: number;
  invitadosDelMes: number;
  invitadosPorMes: number;
}

export interface ReservaDelAdmin {
  canchaId: number;
  inicio: string;
  socioId?: number | null;
  nombre?: string;
  email?: string;
  telefono?: string;
  acompanantes?: { nombre?: string; socioId?: number }[];
}

/** La hora que el club toma por teléfono o en el mesón. */
@Service()
export class ReservasDelAdmin {
  private readonly http = inject(HttpClient);

  cupoDe(socioId: number, fecha: string): Promise<CupoDelSocio> {
    return firstValueFrom(
      this.http.get<CupoDelSocio>(`/api/admin/reservas/cupo/${socioId}`, {
        params: { fecha },
      }),
    );
  }

  crear(datos: ReservaDelAdmin): Promise<{ id: number; folio: string }> {
    return firstValueFrom(
      this.http.post<{ id: number; folio: string }>('/api/admin/reservas', datos),
    );
  }
}
