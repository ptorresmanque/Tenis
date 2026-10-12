import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Un tour en la lista del panel, con cuántas temporadas tiene. */
export interface TourEnLista {
  id: number;
  nombre: string;
  temporadas: number;
}

/** Cuánto da cada resultado, de campeón a treintaidosavos (`SPEC-tours.md`). */
export interface TablaDePuntos {
  campeon: number;
  finalista: number;
  semifinal: number;
  cuartos: number;
  octavos: number;
  dieciseisavos: number;
  treintaidosavos: number;
}

/** Un nivel de una temporada, con en cuántos torneos se usa y cuántos ya terminaron. */
export interface NivelDelPanel {
  id: number;
  nombre: string;
  tabla: TablaDePuntos;
  torneos: number;
  torneosTerminados: number;
}

/** Una temporada, con sus fechas civiles ("2027-03-01") y sus niveles. */
export interface TemporadaDelPanel {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  niveles: NivelDelPanel[];
}

/** Una foto de la galería, con sus dos direcciones. */
export interface FotoDeTour {
  id: number;
  descripcion: string | null;
  miniatura: string;
  imagen: string;
}

/** Espejo de `FichaDeTour` en la API: todo lo del tour que se edita en el panel. */
export interface FichaDeTour {
  id: number;
  nombre: string;
  descripcion: string;
  /** La representativa, o nula. Su dirección no cambia al reemplazarla. */
  imagen: { miniatura: string; web: string } | null;
  temporadas: TemporadaDelPanel[];
  fotos: FotoDeTour[];
}

/**
 * Los tours, para el panel (T191). Lo público llega en T194.
 *
 * Promesas y no observables, como el resto de los servicios del panel: cada llamada es
 * una ida y vuelta, y la pantalla decide qué recargar después.
 */
@Service()
export class Tours {
  private readonly http = inject(HttpClient);

  listar(): Promise<TourEnLista[]> {
    return firstValueFrom(this.http.get<TourEnLista[]>('/api/admin/tours'));
  }

  crear(nombre: string): Promise<FichaDeTour> {
    return firstValueFrom(this.http.post<FichaDeTour>('/api/admin/tours', { nombre }));
  }

  ficha(id: number): Promise<FichaDeTour> {
    return firstValueFrom(this.http.get<FichaDeTour>(`/api/admin/tours/${id}`));
  }

  editar(
    id: number,
    cambio: Partial<Pick<FichaDeTour, 'nombre' | 'descripcion'>>,
  ): Promise<FichaDeTour> {
    return firstValueFrom(this.http.patch<FichaDeTour>(`/api/admin/tours/${id}`, cambio));
  }

  borrar(id: number): Promise<{ id: number }> {
    return firstValueFrom(this.http.delete<{ id: number }>(`/api/admin/tours/${id}`));
  }

  subirImagen(id: number, archivo: File): Promise<{ miniatura: string; web: string }> {
    const cuerpo = new FormData();
    cuerpo.append('imagen', archivo);

    return firstValueFrom(
      this.http.post<{ miniatura: string; web: string }>(
        `/api/admin/tours/${id}/imagen`,
        cuerpo,
      ),
    );
  }

  // ── Temporadas y niveles (T192) ────────────────────────────────────────────

  crearTemporada(
    tourId: number,
    datos: { nombre: string; fechaInicio: string; fechaFin: string },
  ): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/admin/tours/${tourId}/temporadas`, datos));
  }

  editarTemporada(
    id: number,
    cambio: { nombre?: string; fechaInicio?: string; fechaFin?: string },
  ): Promise<unknown> {
    return firstValueFrom(this.http.patch(`/api/admin/temporadas/${id}`, cambio));
  }

  borrarTemporada(id: number): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/admin/temporadas/${id}`));
  }

  crearNivel(
    temporadaId: number,
    datos: { nombre: string; tabla: TablaDePuntos },
  ): Promise<NivelDelPanel> {
    return firstValueFrom(
      this.http.post<NivelDelPanel>(`/api/admin/temporadas/${temporadaId}/niveles`, datos),
    );
  }

  editarNivel(
    id: number,
    cambio: { nombre?: string; tabla?: TablaDePuntos },
  ): Promise<NivelDelPanel> {
    return firstValueFrom(this.http.patch<NivelDelPanel>(`/api/admin/niveles/${id}`, cambio));
  }

  borrarNivel(id: number): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/admin/niveles/${id}`));
  }
}
