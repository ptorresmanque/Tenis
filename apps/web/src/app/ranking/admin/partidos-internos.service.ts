import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { EstadoPartidoInterno } from '../ranking.service';

/** Un partido como lo ve el club cuando alguien reclama. */
export interface PartidoEnDisputa {
  id: number;
  socioA: string;
  socioB: string;
  ganador: string;
  marcador: string | null;
  jugadoEn: string;
  estado: EstadoPartidoInterno;
  resueltoPorAdmin: boolean;
}

/**
 * Lo que el club puede hacer con los partidos amistosos.
 *
 * Aparte del servicio del socio a propósito: son rutas de `admin/` y quien las
 * consuma tiene que verlo en el nombre que inyecta.
 */
@Service()
export class RankingAdmin {
  private readonly http = inject(HttpClient);

  partidosInternos(estado?: EstadoPartidoInterno): Promise<PartidoEnDisputa[]> {
    return firstValueFrom(
      this.http.get<PartidoEnDisputa[]>('/api/admin/partidos-internos', {
        params: estado ? { estado } : {},
      }),
    );
  }

  /** Cerrar una disputa a mano. Queda marcado como resuelto por el club. */
  resolver(
    id: number,
    estado: EstadoPartidoInterno,
  ): Promise<{ id: number; estado: EstadoPartidoInterno }> {
    return firstValueFrom(
      this.http.post<{ id: number; estado: EstadoPartidoInterno }>(
        `/api/admin/partidos-internos/${id}/resolucion`,
        { estado },
      ),
    );
  }
}
