import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Espejo de una fila de `GET /api/admin/profesores`. */
export interface Profesor {
  id: number;
  nombreVisible: string;
  telefono: string;
  especialidad: string;
  tarifaHoraClp: number | null;
  activo: boolean;
}

/** La ficha como se manda al crear. El profesor no tiene cuenta ni la necesita. */
export type FichaNueva = Omit<Profesor, 'id' | 'activo'>;

/** Un cambio parcial: lo que no vaya, no se toca. */
export type CambioDeFicha = Partial<FichaNueva> & { activo?: boolean };

/**
 * Quiénes dan clases en el club.
 *
 * **No hay borrar.** Un profesor que se fue dio clases que pasaron; desactivarlo lo
 * saca de la agenda y deja su historia donde estaba.
 */
@Service()
export class Profesores {
  private readonly http = inject(HttpClient);

  /** Con `soloActivos`, la lista con la que se agenda una clase nueva. */
  listar(soloActivos = false): Promise<Profesor[]> {
    return firstValueFrom(
      this.http.get<Profesor[]>('/api/admin/profesores', {
        params: soloActivos ? { activos: '1' } : {},
      }),
    );
  }

  crear(ficha: FichaNueva): Promise<Profesor> {
    return firstValueFrom(
      this.http.post<Profesor>('/api/admin/profesores', ficha),
    );
  }

  editar(id: number, cambio: CambioDeFicha): Promise<Profesor> {
    return firstValueFrom(
      this.http.patch<Profesor>(`/api/admin/profesores/${id}`, cambio),
    );
  }
}
