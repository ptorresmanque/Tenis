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
  /** La cuenta con que entra a Clases, o nulo si no tiene (T217). */
  usuarioId: number | null;
}

/** La ficha como se manda al crear. La cuenta va aparte (T224), y desde T297 no es opcional. */
export type FichaNueva = Omit<Profesor, 'id' | 'activo' | 'usuarioId'>;

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

  /** La ficha nace con la cuenta, y esa persona entra a Clases (T224, T297). */
  crear(ficha: FichaNueva, usuarioId: number): Promise<Profesor> {
    return firstValueFrom(
      this.http.post<Profesor>('/api/admin/profesores', { ...ficha, usuarioId }),
    );
  }

  /** Le da cuenta a una ficha que no la tiene (T217). */
  vincular(id: number, usuarioId: number): Promise<Profesor> {
    return firstValueFrom(
      this.http.post<Profesor>(`/api/admin/profesores/${id}/cuenta`, { usuarioId }),
    );
  }

  editar(id: number, cambio: CambioDeFicha): Promise<Profesor> {
    return firstValueFrom(
      this.http.patch<Profesor>(`/api/admin/profesores/${id}`, cambio),
    );
  }
}
