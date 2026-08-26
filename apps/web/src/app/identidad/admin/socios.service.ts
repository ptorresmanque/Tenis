import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Espejo de `EstadoSocio` en el schema. */
export type EstadoSocio = 'ACTIVO' | 'SUSPENDIDO' | 'RETIRADO';

export interface SocioDelClub {
  id: number;
  numeroSocio: string;
  estado: EstadoSocio;
  /** Fecha civil, tal como la devuelve la API. */
  alDiaHasta: string;
  usuario: { nombre: string; apellido: string; email: string };
}

/** Un correo al que el club le abrió la puerta y que todavía no se registró. */
export interface InvitacionPendiente {
  id: number;
  email: string;
  numeroSocio: string;
  alDiaHasta: string;
  creadaEn: string;
}

export interface ListadoDeSocios {
  socios: SocioDelClub[];
  invitaciones: InvitacionPendiente[];
}

/** Lo que el club puede cambiar de una ficha. Se manda solo lo que cambia. */
export interface CambiosDeFicha {
  estado?: EstadoSocio;
  alDiaHasta?: string;
  numeroSocio?: string;
  sancionadoHasta?: string | null;
  /** Por qué. Viaja al historial y no a la ficha. */
  motivo?: string;
}

/** Un renglón del historial: un campo que cambió, con su autor. */
export interface CambioDeFicha {
  id: number;
  campo: string;
  valorAnterior: string;
  valorNuevo: string;
  hechoPorNombre: string;
  hechoEn: string;
  motivo: string | null;
}

/**
 * Lo que el admin escribe para dar de alta. **Solo el correo es obligatorio**: el
 * número y la fecha los pone el club si no vienen.
 */
export interface AltaDeSocio {
  email: string;
  numeroSocio?: string;
  alDiaHasta?: string;
}

@Service()
export class Socios {
  private readonly http = inject(HttpClient);

  listado(): Promise<ListadoDeSocios> {
    return firstValueFrom(this.http.get<ListadoDeSocios>('/api/admin/socios'));
  }

  invitar(datos: AltaDeSocio): Promise<InvitacionPendiente> {
    return firstValueFrom(
      this.http.post<InvitacionPendiente>(
        '/api/admin/socios/invitaciones',
        datos,
      ),
    );
  }

  /**
   * Cambia los campos de la ficha que tocan derechos.
   *
   * Hasta T37 esto se hacía escribiendo en la base. Cada cambio queda firmado en el
   * historial; el servidor decide qué se audita y qué no.
   */
  editar(id: number, cambios: CambiosDeFicha): Promise<SocioDelClub> {
    return firstValueFrom(
      this.http.patch<SocioDelClub>(`/api/admin/socios/${id}`, cambios),
    );
  }

  historial(id: number): Promise<CambioDeFicha[]> {
    return firstValueFrom(
      this.http.get<CambioDeFicha[]>(`/api/admin/socios/${id}/cambios`),
    );
  }

  revocar(id: number): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`/api/admin/socios/invitaciones/${id}`),
    );
  }
}
