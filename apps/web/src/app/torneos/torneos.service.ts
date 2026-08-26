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

export type EstadoInscripcionTorneo = 'INSCRITA' | 'LISTA_ESPERA' | 'RETIRADA';

/** Una inscripción a un torneo, como se lee en la lista. */
export interface InscripcionTorneo {
  id: number;
  jugadorId: number;
  jugador: string;
  numeroSocio: string | null;
  siembra: number | null;
  estado: EstadoInscripcionTorneo;
  inscritaEn: string;
}

/** La lista del torneo, en tres grupos porque son tres cosas distintas. */
export interface ListaDelTorneo {
  torneoId: number;
  cupo: number;
  estado: EstadoTorneo;
  inscritos: InscripcionTorneo[];
  enEspera: InscripcionTorneo[];
  retirados: InscripcionTorneo[];
}

/** Un partido, como se dibuja en el cuadro. */
export interface PartidoDelCuadro {
  id: number;
  ronda: number;
  ronda_nombre: string;
  posicion: number;
  jugadorA: string | null;
  jugadorB: string | null;
  jugadorAId: number | null;
  jugadorBId: number | null;
  ganadorId: number | null;
  marcador: string | null;
  walkover: boolean;
}

export interface Cuadro {
  torneoId: number;
  estado: EstadoTorneo;
  rondas: number;
  /** Con qué se sorteó: guardada para poder rehacer el sorteo. */
  semillaSorteo: number | null;
  partidos: PartidoDelCuadro[];
}

/** Un torneo del calendario, como lo ve quien todavía no es del club. */
export interface TorneoPublico {
  id: number;
  nombre: string;
  categoria: string;
  superficie: string | null;
  fechaInicio: string;
  fechaFin: string;
  cierreInscripcion: string;
  estado: EstadoTorneo;
  cupo: number;
  cuposLibres: number;
}

/** Un partido publicado: nombres y marcador, sin teléfonos. */
export interface PartidoPublico {
  ronda: number;
  ronda_nombre: string;
  posicion: number;
  jugadorA: string | null;
  jugadorB: string | null;
  ganador: string | null;
  marcador: string | null;
  walkover: boolean;
}

export interface CuadroPublico {
  id: number;
  nombre: string;
  categoria: string;
  estado: EstadoTorneo;
  inscritos: string[];
  partidos: PartidoPublico[];
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

  /** El calendario del año, sin cuenta. */
  calendario(anio?: number): Promise<TorneoPublico[]> {
    return firstValueFrom(
      this.http.get<TorneoPublico[]>('/api/torneos/publicos', {
        params: anio ? { anio } : {},
      }),
    );
  }

  /** El cuadro público, con los resultados que ya se cargaron. */
  cuadroPublico(id: number): Promise<CuadroPublico> {
    return firstValueFrom(
      this.http.get<CuadroPublico>(`/api/torneos/${id}/cuadro`),
    );
  }

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

  /** Quién juega el torneo: en el cuadro, esperando y retirados. */
  inscripciones(torneoId: number): Promise<ListaDelTorneo> {
    return firstValueFrom(
      this.http.get<ListaDelTorneo>(
        `/api/admin/torneos/${torneoId}/inscripciones`,
      ),
    );
  }

  /** Pasado el cupo el servidor deja al jugador en espera, no lo rechaza. */
  inscribir(
    torneoId: number,
    quien: { jugadorId: number } | { socioId: number },
  ): Promise<{ id: number; estado: EstadoInscripcionTorneo }> {
    return firstValueFrom(
      this.http.post<{ id: number; estado: EstadoInscripcionTorneo }>(
        `/api/admin/torneos/${torneoId}/inscripciones`,
        quien,
      ),
    );
  }

  retirar(torneoId: number, id: number): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(
        `/api/admin/torneos/${torneoId}/inscripciones/${id}/retiro`,
        {},
      ),
    );
  }

  /** Manual a propósito: el club llama antes de meter a alguien en el cuadro. */
  promover(torneoId: number, id: number): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(
        `/api/admin/torneos/${torneoId}/inscripciones/${id}/promocion`,
        {},
      ),
    );
  }

  /** La siembra la pone el admin, no el ranking. `null` la quita. */
  sembrar(
    torneoId: number,
    id: number,
    siembra: number | null,
  ): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.patch<{ id: number }>(
        `/api/admin/torneos/${torneoId}/inscripciones/${id}/siembra`,
        { siembra },
      ),
    );
  }

  cuadro(torneoId: number): Promise<Cuadro> {
    return firstValueFrom(
      this.http.get<Cuadro>(`/api/admin/torneos/${torneoId}/cuadro`),
    );
  }

  /** Armar cierra la inscripción y sortea a los no sembrados. */
  armarCuadro(torneoId: number): Promise<Cuadro> {
    return firstValueFrom(
      this.http.post<Cuadro>(`/api/admin/torneos/${torneoId}/cuadro`, {}),
    );
  }

  /** Solo mientras no haya resultados: con partidos jugados el servidor se niega. */
  deshacerCuadro(torneoId: number): Promise<{ torneoId: number }> {
    return firstValueFrom(
      this.http.post<{ torneoId: number }>(
        `/api/admin/torneos/${torneoId}/cuadro/deshacer`,
        {},
      ),
    );
  }

  /** Cuántos partidos se deshacen si se corrige este resultado. No escribe nada. */
  consecuencias(
    torneoId: number,
    partidoId: number,
  ): Promise<{ deshace: number }> {
    return firstValueFrom(
      this.http.get<{ deshace: number }>(
        `/api/admin/torneos/${torneoId}/partidos/${partidoId}/consecuencias`,
      ),
    );
  }

  /** Cargar el resultado avanza al ganador al partido y al lado que le tocan. */
  cargarResultado(
    torneoId: number,
    partidoId: number,
    resultado: { ganadorId: number; marcador?: string; walkover?: boolean },
  ): Promise<{ id: number; deshechos: number }> {
    return firstValueFrom(
      this.http.post<{ id: number; deshechos: number }>(
        `/api/admin/torneos/${torneoId}/partidos/${partidoId}/resultado`,
        resultado,
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
