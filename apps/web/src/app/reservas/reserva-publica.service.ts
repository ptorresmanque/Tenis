import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

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
}
