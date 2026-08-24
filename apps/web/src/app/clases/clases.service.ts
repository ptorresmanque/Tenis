import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { HoraAfectada } from '../catalogo-canchas/admin/admin-canchas.service';

export type NivelClase =
  | 'INICIACION'
  | 'INTERMEDIO'
  | 'COMPETITIVO'
  | 'NINOS';

/** Cómo se lee cada nivel en pantalla. */
export const NIVELES: Record<NivelClase, string> = {
  INICIACION: 'Iniciación',
  INTERMEDIO: 'Intermedio',
  COMPETITIVO: 'Competitivo',
  NINOS: 'Niños',
};

/** Espejo de una fila de `GET /api/admin/clases`. */
export interface ClaseDelDia {
  id: number;
  cancha: string;
  profesor: string;
  inicio: string;
  fin: string;
  nivel: NivelClase;
  cupoMaximo: number;
  notas: string | null;
}

/** Lo que el formulario manda para agendar. Horas del club, como las escribe el admin. */
export interface ClaseNueva {
  canchaId: number;
  profesorId: number;
  fecha: string;
  horaDesde: string;
  horaHasta: string;
  cupoMaximo: number;
  nivel: NivelClase;
  notas?: string;
}

export interface ResultadoAgendar {
  id: number;
  bloqueoId: number;
  canceladas: HoraAfectada[];
}

/**
 * Las clases del club.
 *
 * **Agendar cierra la cancha**, y por eso tiene simulación: antes de confirmar, el
 * admin ve a quién le va a quitar la hora. Es el mismo flujo de dos pasos que el
 * cierre por mantención, porque es la misma operación con otro nombre.
 */
@Service()
export class Clases {
  private readonly http = inject(HttpClient);

  delDia(fecha: string): Promise<ClaseDelDia[]> {
    return firstValueFrom(
      this.http.get<ClaseDelDia[]>('/api/admin/clases', { params: { fecha } }),
    );
  }

  /** A quién le quitaría la hora. No escribe nada. */
  simular(clase: ClaseNueva): Promise<{ afectadas: HoraAfectada[] }> {
    return firstValueFrom(
      this.http.post<{ afectadas: HoraAfectada[] }>(
        '/api/admin/clases/simulacion',
        clase,
      ),
    );
  }

  agendar(clase: ClaseNueva): Promise<ResultadoAgendar> {
    return firstValueFrom(
      this.http.post<ResultadoAgendar>('/api/admin/clases', clase),
    );
  }

  /** Mover conserva el id de la clase y, cuando existan, sus inscritos. */
  mover(
    id: number,
    adonde: { fecha: string; horaDesde: string; horaHasta: string; canchaId?: number },
  ): Promise<ResultadoAgendar> {
    return firstValueFrom(
      this.http.patch<ResultadoAgendar>(`/api/admin/clases/${id}`, adonde),
    );
  }

  /** El motivo es obligatorio: los inscritos van a preguntar por qué no hubo clase. */
  cancelar(id: number, motivo: string): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(`/api/admin/clases/${id}/cancelacion`, {
        motivo,
      }),
    );
  }
}
