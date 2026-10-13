import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Una fila de la tabla, con el puesto ya calculado por el servidor. */
export interface PosicionDeTorneos {
  puesto: number;
  jugadorId: number;
  nombre: string;
  puntos: number;
  /** En cuántos torneos los consiguió. Es el primer criterio de desempate. */
  torneos: number;
}

/**
 * Un **cuadro** que la tabla está contando: "Copa Aniversario · 4ª · Nivel 500 · terminó
 * el 3 de mayo". Un cuadro y no un torneo: una Copa que corre 4ª y Honor aporta a dos
 * tablas distintas.
 */
export interface CuadroContado {
  /** El del cuadro. El del torneo va aparte. */
  id: number;
  torneoId: number;
  nombre: string;
  /** La categoría de juego: "4ª", "Honor". */
  categoria: string;
  /** El nivel con que el torneo entró a esta temporada: "500". */
  nivel: string;
  fechaFin: string;
}

/**
 * La tabla de un tour en una temporada y una categoría de juego (T198, `SPEC-ranking.md`
 * § Ranking de torneos).
 */
export interface TablaDeTorneos {
  temporada: { id: number; nombre: string; fechaInicio: string; fechaFin: string };
  /** Las categorías con filas en esta temporada, de la más alta a la más baja. */
  categorias: { id: number; nombre: string }[];
  /** La que se está mostrando: la pedida, o la más alta con filas. */
  categoriaJuegoId: number | null;
  torneos: CuadroContado[];
  posiciones: PosicionDeTorneos[];
}

export type EstadoPartidoInterno = 'PENDIENTE' | 'CONFIRMADO' | 'RECHAZADO';

/** Cómo se lee cada estado en pantalla. */
export const ESTADOS_PARTIDO: Record<EstadoPartidoInterno, string> = {
  PENDIENTE: 'Esperando confirmación',
  CONFIRMADO: 'Confirmado',
  RECHAZADO: 'Rechazado',
};

/** Un partido amistoso, como lo ve uno de los dos que jugaron. */
export interface PartidoMio {
  id: number;
  /** El otro. Cada uno ve al que tuvo enfrente, no una pareja de nombres. */
  rival: string;
  ganeYo: boolean;
  marcador: string | null;
  jugadoEn: string;
  estado: EstadoPartidoInterno;
  /** Si me toca a mí contestar. Es lo que decide si se dibuja el botón. */
  esperaMiRespuesta: boolean;
  resueltoPorAdmin: boolean;
}

/** Alguien contra quien se puede cargar un partido. */
export interface Rival {
  socioId: number;
  numeroSocio: string;
  nombre: string;
}

export interface PartidoNuevo {
  rivalSocioId: number;
  ganadorSocioId: number;
  marcador: string | null;
  jugadoEn: string;
}

/** Una fila de la tabla interna. */
export interface FilaInterna {
  /** `null` en los inactivos: están en la lista, pero no ocupan lugar. */
  puesto: number | null;
  socioId: number;
  nombre: string;
  elo: number;
  partidos: number;
  ganados: number;
  ultimoPartido: string;
  activo: boolean;
}

export interface TablaDelClub {
  partidos: number;
  ultimoPartido: string | null;
  /** Quien no juega desde este día sale de la tabla principal. */
  inactivosDesde: string;
  posiciones: FilaInterna[];
}

/**
 * Las tablas que ordenan personas.
 *
 * **Se calculan al consultar**: no hay una tabla guardada que pueda quedar vieja, así
 * que cada carga de la pantalla trae el estado real, y la respuesta trae los cuadros que
 * está contando para poder explicarla.
 */
@Service()
export class Ranking {
  private readonly http = inject(HttpClient);

  /**
   * La tabla de una temporada y una categoría de juego. Sin cuenta. Sin categoría, el
   * servidor sirve la más alta con filas.
   */
  torneos(temporadaId: number, categoriaJuegoId: number | null): Promise<TablaDeTorneos> {
    const params: Record<string, number> = { temporada: temporadaId };
    if (categoriaJuegoId !== null) params['categoria'] = categoriaJuegoId;

    return firstValueFrom(this.http.get<TablaDeTorneos>('/api/ranking/torneos', { params }));
  }

  /**
   * La tabla interna: el Elo de los amistosos. **Solo para socios**, al revés que la
   * de torneos: un torneo es público y su cuadro está en el mural; el orden de juego
   * entre socios es cosa de adentro.
   */
  interno(): Promise<TablaDelClub> {
    return firstValueFrom(this.http.get<TablaDelClub>('/api/ranking/interno'));
  }

  /** Los partidos amistosos míos: los que cargué y los que tengo que contestar. */
  misPartidos(): Promise<PartidoMio[]> {
    return firstValueFrom(this.http.get<PartidoMio[]>('/api/partidos-internos/mios'));
  }

  /** Contra quién puedo cargar uno. Nombre y número de socio, nada más. */
  rivales(): Promise<Rival[]> {
    return firstValueFrom(this.http.get<Rival[]>('/api/partidos-internos/rivales'));
  }

  /**
   * Cargar un partido. **Quien lo carga no va en el cuerpo**: lo pone el servidor
   * desde la sesión, que es lo que impide cargarlo a nombre de otro.
   */
  cargarPartido(datos: PartidoNuevo): Promise<{ id: number }> {
    return firstValueFrom(this.http.post<{ id: number }>('/api/partidos-internos', datos));
  }

  /** Contestar. Solo el rival puede, y solo una vez. */
  responderPartido(id: number, acepto: boolean): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(
        `/api/partidos-internos/${id}/${acepto ? 'confirmacion' : 'rechazo'}`,
        {},
      ),
    );
  }
}
