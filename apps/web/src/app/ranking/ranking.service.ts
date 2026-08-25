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
  /** El corte: solo suman los torneos terminados desde este día. */
  desde: string;
  hasta: string;
  torneos: TorneoContado[];
  posiciones: PosicionDeTorneos[];
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
}
