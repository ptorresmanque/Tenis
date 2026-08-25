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

/** Un torneo que la tabla está contando. */
export interface TorneoContado {
  id: number;
  nombre: string;
  categoria: string;
  fechaFin: string;
}

export interface TablaDeTorneos {
  /**
   * El corte: solo suman los torneos terminados desde este día. **Sin un tope**: la
   * ventana tiene un solo borde, porque un torneo que se terminó de jugar antes de su
   * fecha prevista ya repartió sus puntos.
   */
  desde: string;
  torneos: TorneoContado[];
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
 * que cada carga de la pantalla trae el estado real. El precio es que el ranking cambia
 * sin que pase nada —un torneo caduca y alguien baja tres puestos—, y por eso la
 * respuesta trae el corte y los torneos que está contando.
 */
@Service()
export class Ranking {
  private readonly http = inject(HttpClient);

  /** La tabla de torneos: puntos de las últimas 52 semanas. Sin cuenta. */
  torneos(): Promise<TablaDeTorneos> {
    return firstValueFrom(this.http.get<TablaDeTorneos>('/api/ranking/torneos'));
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
