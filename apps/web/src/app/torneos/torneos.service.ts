import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type EstadoTorneo =
  | 'INSCRIPCION'
  | 'CUADRO_ARMADO'
  | 'EN_CURSO'
  | 'FINALIZADO'
  | 'CANCELADO';

/** Cómo se lee cada estado en pantalla. */
export const ESTADOS_TORNEO: Record<EstadoTorneo, string> = {
  INSCRIPCION: 'Inscripción abierta',
  CUADRO_ARMADO: 'Cuadro armado',
  EN_CURSO: 'En curso',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
};

/** Quien juega torneos. No es el socio: vuelve el año siguiente con sus puntos. */
export interface Jugador {
  id: number;
  nombre: string;
  apellido: string;
  telefono: string | null;
  socioId: number | null;
  /** Plano y no anidado: se muestra al lado del nombre en todas las listas. */
  numeroSocio: string | null;
  activo: boolean;
}

export interface CategoriaTorneo {
  id: number;
  nombre: string;
  puntosCampeon: number;
  activa: boolean;
}

export interface Torneo {
  id: number;
  nombre: string;
  categoriaId: number;
  categoria: string;
  puntosCampeon: number;
  superficie: string | null;
  fechaInicio: string;
  fechaFin: string;
  cierreInscripcion: string;
  cupo: number;
  estado: EstadoTorneo;
}

export interface TorneoNuevo {
  nombre: string;
  categoriaId: number;
  superficie: string | null;
  fechaInicio: string;
  fechaFin: string;
  cierreInscripcion: string;
  cupo: number;
}

/**
 * Los torneos del club.
 *
 * **El jugador se pide por su socio o por su nombre, nunca por los dos.** Con el socio,
 * el servidor reutiliza el jugador que ya tenga: el mismo socio en dos torneos es un
 * solo jugador, o el ranking sumaría sus puntos en dos filas distintas.
 */
@Service()
export class Torneos {
  private readonly http = inject(HttpClient);

  jugadores(soloActivos = false): Promise<Jugador[]> {
    return firstValueFrom(
      this.http.get<Jugador[]>('/api/admin/jugadores', {
        params: soloActivos ? { activos: '1' } : {},
      }),
    );
  }

  crearJugador(
    datos: { socioId: number } | { nombre: string; apellido: string; telefono?: string },
  ): Promise<Jugador> {
    return firstValueFrom(
      this.http.post<Jugador>('/api/admin/jugadores', datos),
    );
  }

  /** Editar, desactivar, o enlazar a una ficha de socio. */
  editarJugador(
    id: number,
    cambio: Partial<{
      nombre: string;
      apellido: string;
      telefono: string;
      socioId: number;
      activo: boolean;
    }>,
  ): Promise<Jugador> {
    return firstValueFrom(
      this.http.patch<Jugador>(`/api/admin/jugadores/${id}`, cambio),
    );
  }

  categorias(soloActivas = false): Promise<CategoriaTorneo[]> {
    return firstValueFrom(
      this.http.get<CategoriaTorneo[]>('/api/admin/categorias-torneo', {
        params: soloActivas ? { activas: '1' } : {},
      }),
    );
  }

  crearCategoria(datos: {
    nombre: string;
    puntosCampeon: number;
  }): Promise<CategoriaTorneo> {
    return firstValueFrom(
      this.http.post<CategoriaTorneo>('/api/admin/categorias-torneo', datos),
    );
  }

  editarCategoria(
    id: number,
    cambio: Partial<{ nombre: string; puntosCampeon: number; activa: boolean }>,
  ): Promise<CategoriaTorneo> {
    return firstValueFrom(
      this.http.patch<CategoriaTorneo>(
        `/api/admin/categorias-torneo/${id}`,
        cambio,
      ),
    );
  }

  torneos(): Promise<Torneo[]> {
    return firstValueFrom(this.http.get<Torneo[]>('/api/admin/torneos'));
  }

  crearTorneo(datos: TorneoNuevo): Promise<Torneo> {
    return firstValueFrom(this.http.post<Torneo>('/api/admin/torneos', datos));
  }

  editarTorneo(id: number, cambio: Partial<TorneoNuevo>): Promise<Torneo> {
    return firstValueFrom(
      this.http.patch<Torneo>(`/api/admin/torneos/${id}`, cambio),
    );
  }
}
