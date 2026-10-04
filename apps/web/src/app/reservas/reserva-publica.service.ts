import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { DuracionMin, GrillaDeCancha } from '../catalogo-canchas/disponibilidad';

/** Espejo de `ReservaPublica` en la API. Es a propósito menos que la ficha entera. */
export interface ReservaPublica {
  folio: string;
  cancha: string;
  inicio: string;
  fin: string;
  nombre: string;
  esPico: boolean;
  estado: 'PENDIENTE_PAGO' | 'CONFIRMADA' | 'CANCELADA' | 'EXPIRADA';
  acompanantes: number;
  /** Lo pagado, para mostrar la diferencia como dato; el servidor la recalcula (T88). */
  pagadoClp: number;
  /** Si el enlace ofrece cambiar la hora o la duración (T88). */
  sePuedeCambiar: boolean;
}

/**
 * La reserva vista por su token: lo que abre el QR de portería.
 *
 * Sin sesión y sin cookies que importen: el mesón escanea con un teléfono que no
 * tiene la cuenta de nadie. Lo que hace de credencial es el token de la URL.
 */
@Service()
export class ReservasPublicas {
  private readonly http = inject(HttpClient);

  porToken(token: string): Promise<ReservaPublica> {
    return firstValueFrom(
      this.http.get<ReservaPublica>(
        `/api/reservas/publica/${encodeURIComponent(token)}`,
      ),
    );
  }

  /** El día para mover desde el enlace, sin contar la reserva (T88). */
  grillaParaMover(
    token: string,
    fecha: string,
    duracionMin: DuracionMin,
  ): Promise<GrillaDeCancha[]> {
    return firstValueFrom(
      this.http.get<GrillaDeCancha[]>(
        `/api/reservas/publica/${encodeURIComponent(token)}/grilla`,
        { params: { fecha, duracion: duracionMin } },
      ),
    );
  }

  /** Mueve desde el enlace. Solo mover: por el enlace no se cancela. */
  mover(
    token: string,
    destino: { canchaId: number; inicio: string; duracionMin: number },
  ): Promise<unknown> {
    return firstValueFrom(
      this.http.patch(`/api/reservas/publica/${encodeURIComponent(token)}`, destino),
    );
  }
}
