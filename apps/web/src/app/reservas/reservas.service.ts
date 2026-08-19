import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Con quién juega el socio: otro socio por su número, o un invitado por su nombre. */
export interface AcompananteNuevo {
  numeroSocio?: string;
  nombre?: string;
}

export interface ReservaConfirmada {
  id: number;
  folio: string;
  inicio: string;
  fin: string;
}

export interface PagoIniciado {
  reservaId: number;
  folio: string;
  montoClp: number;
  urlRedireccion: string;
}

/** Lo que la API responde cuando una regla del club rechaza la reserva. */
export interface RechazoDeReserva {
  motivo: string;
  mensaje: string;
}

@Service()
export class Reservas {
  private readonly http = inject(HttpClient);

  /** El socio reserva contra su cupo, sin pagar. */
  reservarComoSocio(datos: {
    canchaId: number;
    inicio: string;
    acompanantes: AcompananteNuevo[];
  }): Promise<ReservaConfirmada> {
    return firstValueFrom(
      this.http.post<ReservaConfirmada>('/api/reservas', datos),
    );
  }

  /** El visitante toma la hora y sale a pagar. */
  reservarComoNoSocio(datos: {
    canchaId: number;
    inicio: string;
    nombre: string;
    email: string;
    telefono: string;
  }): Promise<PagoIniciado> {
    return firstValueFrom(
      this.http.post<PagoIniciado>('/api/reservas/no-socio', datos),
    );
  }
}

/**
 * Traduce el error de la API a algo que se pueda mostrar.
 *
 * El servidor manda `{ motivo, message }` en los rechazos de negocio: el motivo es
 * para el código y el mensaje es el que ya viene escrito para la persona. Lo que no
 * es un rechazo conocido no se muestra crudo — un "Internal server error" en pantalla
 * no le dice nada a nadie, que es el mismo arreglo que necesitó el registro en T5.
 */
export function mensajeDeRechazo(error: unknown): RechazoDeReserva {
  const cuerpo = (error as { error?: { motivo?: string; message?: string } })
    ?.error;

  if (cuerpo?.motivo && cuerpo.message) {
    return { motivo: cuerpo.motivo, mensaje: cuerpo.message };
  }

  const estado = (error as { status?: number })?.status;

  if (estado === 400 && typeof cuerpo?.message === 'string') {
    return { motivo: 'DATOS_INVALIDOS', mensaje: cuerpo.message };
  }

  if (estado === 404) {
    return {
      motivo: 'BLOQUE_INEXISTENTE',
      mensaje: 'Esa hora ya no está en el horario de la cancha.',
    };
  }

  return {
    motivo: 'ERROR',
    mensaje: 'No se pudo completar la reserva. Reintenta en un momento.',
  };
}
