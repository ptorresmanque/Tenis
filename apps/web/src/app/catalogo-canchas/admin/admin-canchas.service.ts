import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Cancha } from '../disponibilidad';

export interface Horario {
  id: number;
  diaSemana: number;
  horaApertura: string;
  horaCierre: string;
}

export interface Franja {
  id: number;
  canchaId: number | null;
  diaSemana: number | null;
  horaDesde: string;
  horaHasta: string;
  esPico: boolean;
  montoClp: number;
}

/**
 * Dónde rige un horario o una tarifa: una cancha, o el club entero.
 *
 * `id: null` es el club —las filas con `cancha_id` nulo—, y existe para que los
 * editores de horario y tarifas sirvan para los dos casos. Sin esto habría dos
 * copias de cada editor y la del club envejecería primero.
 */
export interface AmbitoDeReglas {
  id: number | null;
  nombre: string;
  horarios: Horario[];
  franjas: Franja[];
}

/** El horario y las tarifas generales del club. */
export interface ReglasGenerales {
  horarios: Horario[];
  franjas: Franja[];
}

/** La cancha como la ve el panel: con lo suyo colgando, y también si está activa. */
export interface CanchaAdmin extends Cancha, AmbitoDeReglas {
  id: number;
  activa: boolean;
  orden: number;
}

export type MotivoBloqueo = 'MANTENCION' | 'TORNEO' | 'CLASE' | 'OTRO';

export interface Bloqueo {
  id: number;
  canchaId: number;
  /** Instantes en UTC, como los devuelve la API. */
  inicio: string;
  fin: string;
  motivo: MotivoBloqueo;
  descripcion: string | null;
}

/**
 * El rango va en hora del club y no en instantes: la conversión la hace el
 * servidor, que es donde está probada contra los dos domingos que Chile cambia
 * la hora.
 */
export interface BloqueoNuevo {
  canchaId: number;
  fechaDesde: string;
  horaDesde: string;
  fechaHasta: string;
  horaHasta: string;
  motivo: MotivoBloqueo;
  descripcion: string | null;
}

export interface Advertencia {
  canchaId: number;
  nombre: string;
  sinTarifa: string[];
}

/**
 * Las reglas del club, la fila única de `ConfiguracionClub`.
 *
 * Espejo de `CambiosDeConfiguracion` en la API. El servidor devuelve además `id` y
 * `actualizadoEn`, que al panel no le sirven para nada.
 */
export interface ReglasDelClub {
  duracionBloqueMin: number;
  cupoDiarioSocioHoras: number;
  cupoPicoSemanalHoras: number;
  invitadosPorMes: number;
  horasMinModificacion: number;
  horasReembolsoTotal: number;
}

export interface CanchaNueva {
  nombre: string;
  superficie: Cancha['superficie'];
  techada: boolean;
  iluminacion: boolean;
}

@Service()
export class AdminCanchas {
  private readonly http = inject(HttpClient);

  canchas(): Promise<CanchaAdmin[]> {
    return firstValueFrom(this.http.get<CanchaAdmin[]>('/api/admin/canchas'));
  }

  configuracion(): Promise<ReglasDelClub> {
    return firstValueFrom(
      this.http.get<ReglasDelClub>('/api/admin/configuracion'),
    );
  }

  fijarConfiguracion(reglas: ReglasDelClub): Promise<ReglasDelClub> {
    return firstValueFrom(
      this.http.patch<ReglasDelClub>('/api/admin/configuracion', reglas),
    );
  }

  advertencias(fecha: string): Promise<Advertencia[]> {
    return firstValueFrom(
      this.http.get<Advertencia[]>('/api/admin/advertencias', {
        params: { fecha },
      }),
    );
  }

  crear(cancha: CanchaNueva): Promise<CanchaAdmin> {
    return firstValueFrom(
      this.http.post<CanchaAdmin>('/api/admin/canchas', cancha),
    );
  }

  /** Solo lo que cambia: lo que no viaja, no se toca. */
  editar(id: number, cambios: Partial<CanchaAdmin>): Promise<CanchaAdmin> {
    return firstValueFrom(
      this.http.patch<CanchaAdmin>(`/api/admin/canchas/${id}`, cambios),
    );
  }

  /**
   * Borra la cancha. El servidor responde 409 si tiene historial: la regla vive
   * allá, así que el panel no la repite y solo muestra lo que le contestan.
   */
  eliminar(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/admin/canchas/${id}`));
  }

  /** El horario y las tarifas que rigen donde la cancha no dice otra cosa. */
  general(): Promise<ReglasGenerales> {
    return firstValueFrom(this.http.get<ReglasGenerales>('/api/admin/general'));
  }

  /** `canchaId` nulo fija el horario general del club. */
  fijarHorarios(
    canchaId: number | null,
    horarios: Omit<Horario, 'id'>[],
  ): Promise<Horario[]> {
    return firstValueFrom(
      this.http.put<Horario[]>(
        canchaId === null
          ? '/api/admin/general/horarios'
          : `/api/admin/canchas/${canchaId}/horarios`,
        horarios,
      ),
    );
  }

  crearFranja(franja: {
    canchaId: number | null;
    diaSemana: number | null;
    horaDesde: string;
    horaHasta: string;
    esPico: boolean;
    montoClp: number;
    vigenteDesde: string;
  }): Promise<Franja> {
    return firstValueFrom(this.http.post<Franja>('/api/admin/franjas', franja));
  }

  borrarFranja(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/admin/franjas/${id}`));
  }

  bloqueos(canchaId: number): Promise<Bloqueo[]> {
    return firstValueFrom(
      this.http.get<Bloqueo[]>('/api/admin/bloqueos', {
        params: { cancha: canchaId },
      }),
    );
  }

  crearBloqueo(bloqueo: BloqueoNuevo): Promise<Bloqueo> {
    return firstValueFrom(
      this.http.post<Bloqueo>('/api/admin/bloqueos', bloqueo),
    );
  }

  borrarBloqueo(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/admin/bloqueos/${id}`));
  }
}
