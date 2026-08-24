import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Los cuatro públicos que el perfil describe, y que van a manos distintas. */
export type TipoSolicitud = 'SOCIO' | 'CLASES' | 'EMPRESA' | 'OTRO';
export type EstadoSolicitud = 'NUEVA' | 'ATENDIDA' | 'DESCARTADA';

export interface SolicitudNueva {
  tipo: TipoSolicitud;
  nombre: string;
  email: string;
  telefono: string;
  mensaje: string;
}

/** Espejo de `SolicitudContacto` en la API. */
export interface Solicitud {
  id: number;
  tipo: TipoSolicitud;
  nombre: string;
  email: string;
  telefono: string;
  mensaje: string | null;
  estado: EstadoSolicitud;
  creadaEn: string;
  nota: string | null;
  invitacionId: number | null;
}

/**
 * Quién le escribe al club desde afuera.
 *
 * El envío es público —quien pregunta cómo asociarse todavía no es nadie del club— y
 * la bandeja es solo del admin: lo que llega son datos de contacto de terceros.
 */
@Service()
export class Contacto {
  private readonly http = inject(HttpClient);

  enviar(solicitud: SolicitudNueva): Promise<Solicitud> {
    return firstValueFrom(
      this.http.post<Solicitud>('/api/contacto', solicitud),
    );
  }

  bandeja(filtros: { estado?: string; tipo?: string } = {}): Promise<Solicitud[]> {
    return firstValueFrom(
      this.http.get<Solicitud[]>('/api/admin/solicitudes', { params: filtros }),
    );
  }

  resolver(id: number, estado: EstadoSolicitud, nota: string): Promise<Solicitud> {
    return firstValueFrom(
      this.http.patch<Solicitud>(`/api/admin/solicitudes/${id}`, { estado, nota }),
    );
  }

  /** Convierte la solicitud en un alta de socio. Solo vale para las de tipo `SOCIO`. */
  invitar(id: number): Promise<{ id: number; email: string }> {
    return firstValueFrom(
      this.http.post<{ id: number; email: string }>(
        `/api/admin/solicitudes/${id}/invitacion`,
        {},
      ),
    );
  }
}
