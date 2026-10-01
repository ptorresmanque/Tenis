import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Espejo de `CanchaPublica` en la API. */
export interface Cancha {
  id: number;
  nombre: string;
  superficie: 'ARCILLA' | 'CEMENTO' | 'PASTO_SINTETICO';
  techada: boolean;
  iluminacion: boolean;
}

/** Espejo de `BloqueDisponible` en la API. Las fechas llegan como ISO en UTC. */
export interface BloqueDisponible {
  inicio: string;
  fin: string;
  canchaId: number;
  montoClp: number;
  esPico: boolean;
  bloqueado: boolean;
  motivoBloqueo: string | null;
  /** Alguien ya tomó esa hora. Lo agrega `reservas` sobre lo que calcula el catálogo. */
  reservado: boolean;
}

export interface GrillaDeCancha {
  cancha: Cancha;
  bloques: BloqueDisponible[];
}

@Service()
export class Disponibilidad {
  private readonly http = inject(HttpClient);

  /**
   * Las canchas activas, sin sus horas.
   *
   * Separado de `delDia` para quien solo quiere el catálogo —la página del club
   * las lista y nada más—: pedir la grilla entera para tirar los bloques son
   * cuatro peticiones donde bastaba una.
   */
  canchas(): Promise<Cancha[]> {
    return firstValueFrom(this.http.get<Cancha[]>('/api/canchas'));
  }

  /**
   * La grilla del día: cada cancha activa con sus bloques, **en una petición**.
   *
   * Antes eran una por cancha más la del catálogo: con ocho canchas, nueve
   * viajes al servidor para pintar la portada. El endpoint del día entero se
   * agregó el 2026-09-08 para cerrar ese hallazgo de la auditoría, y devuelve
   * exactamente lo mismo que preguntar cancha por cancha —hay un test de la API
   * que compara las dos respuestas—.
   */
  delDia(fecha: string): Promise<GrillaDeCancha[]> {
    return firstValueFrom(
      this.http.get<GrillaDeCancha[]>('/api/disponibilidad', { params: { fecha } }),
    );
  }
}
