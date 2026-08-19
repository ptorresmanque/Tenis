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
   * La grilla del día: cada cancha activa con sus bloques.
   *
   * Una petición por cancha, en paralelo, porque el endpoint es por cancha. Con
   * tres canchas no se nota; si el club creciera, conviene un endpoint que
   * devuelva el día entero antes que disparar veinte consultas.
   */
  async delDia(fecha: string): Promise<GrillaDeCancha[]> {
    const canchas = await firstValueFrom(
      this.http.get<Cancha[]>('/api/canchas'),
    );

    return Promise.all(
      canchas.map(async (cancha) => ({
        cancha,
        bloques: await firstValueFrom(
          this.http.get<BloqueDisponible[]>('/api/disponibilidad', {
            params: { cancha: cancha.id, fecha },
          }),
        ),
      })),
    );
  }
}
