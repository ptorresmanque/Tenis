import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Cancha } from '../disponibilidad';

export interface Horario {
  id: number;
  diaSemana: number;
  horaApertura: string;
  horaCierre: string;
}

export interface Franja {
  id: number;
  canchaId: number | null;
  diaSemana: number | null;
  horaDesde: string;
  horaHasta: string;
  esPico: boolean;
  montoClp: number;
}

/** La cancha como la ve el panel: con lo suyo colgando, y también si está activa. */
export interface CanchaAdmin extends Cancha {
  activa: boolean;
  orden: number;
  horarios: Horario[];
  franjas: Franja[];
}

export interface Advertencia {
  canchaId: number;
  nombre: string;
  sinTarifa: string[];
}

export interface CanchaNueva {
  nombre: string;
  superficie: Cancha['superficie'];
  techada: boolean;
  iluminacion: boolean;
}

@Service()
export class AdminCanchas {
  private readonly http = inject(HttpClient);

  canchas(): Promise<CanchaAdmin[]> {
    return firstValueFrom(this.http.get<CanchaAdmin[]>('/api/admin/canchas'));
  }

  advertencias(fecha: string): Promise<Advertencia[]> {
    return firstValueFrom(
      this.http.get<Advertencia[]>('/api/admin/advertencias', {
        params: { fecha },
      }),
    );
  }

  crear(cancha: CanchaNueva): Promise<CanchaAdmin> {
    return firstValueFrom(
      this.http.post<CanchaAdmin>('/api/admin/canchas', cancha),
    );
  }

  /** Solo lo que cambia: lo que no viaja, no se toca. */
  editar(id: number, cambios: Partial<CanchaAdmin>): Promise<CanchaAdmin> {
    return firstValueFrom(
      this.http.patch<CanchaAdmin>(`/api/admin/canchas/${id}`, cambios),
    );
  }

  fijarHorarios(
    canchaId: number,
    horarios: Omit<Horario, 'id'>[],
  ): Promise<Horario[]> {
    return firstValueFrom(
      this.http.put<Horario[]>(
        `/api/admin/canchas/${canchaId}/horarios`,
        horarios,
      ),
    );
  }

  crearFranja(franja: {
    canchaId: number | null;
    diaSemana: number | null;
    horaDesde: string;
    horaHasta: string;
    esPico: boolean;
    montoClp: number;
    vigenteDesde: string;
  }): Promise<Franja> {
    return firstValueFrom(this.http.post<Franja>('/api/admin/franjas', franja));
  }

  borrarFranja(id: number): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`/api/admin/franjas/${id}`),
    );
  }
}
