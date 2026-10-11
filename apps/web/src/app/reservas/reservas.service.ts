import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { DuracionMin, GrillaDeCancha } from '../catalogo-canchas/disponibilidad';
import { RedireccionAPasarela } from '../core/pagos/ir-a-pagar';

/** Con quién juega el socio: otro socio por su número, o un invitado por su nombre. */
export interface AcompananteNuevo {
  numeroSocio?: string;
  nombre?: string;
}

export interface ReservaConfirmada {
  id: number;
  folio: string;
  /** La llave de su página pública: con ella la confirmación muestra el QR. */
  token: string;
  inicio: string;
  fin: string;
}

/** Lo mismo que devuelve el cobro de una cuota, más lo que se acaba de reservar. */
export interface PagoIniciado extends RedireccionAPasarela {
  reservaId: number;
  folio: string;
  montoClp: number;
}

/** El socio del club que puede acompañar a otro, tal como lo lista la API. */
export interface SocioDelDirectorio {
  numeroSocio: string;
  nombre: string;
}

/** Lo que la API responde cuando una regla del club rechaza la reserva. */
export interface RechazoDeReserva {
  motivo: string;
  mensaje: string;
}

/** Espejo de `ReservaMia` en la API. Las dos ventanas llegan ya resueltas. */
export interface ReservaMia {
  id: number;
  folio: string;
  cancha: string;
  inicio: string;
  fin: string;
  estado: 'PENDIENTE_PAGO' | 'CONFIRMADA';
  esPico: boolean;
  pagada: boolean;
  sePuedeModificar: boolean;
  devolucionAlCancelar: boolean;
}

export interface ReservaCancelada {
  folio: string;
  huboDevolucion: boolean;
  motivo: string | null;
}

@Service()
export class Reservas {
  private readonly http = inject(HttpClient);

  /** El socio reserva contra su cupo, sin pagar. */
  reservarComoSocio(datos: {
    canchaId: number;
    inicio: string;
    /** 60 o 90. Un número cualquiera, porque quien la valida es la API (T82). */
    duracionMin: number;
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
    duracionMin: number;
    nombre: string;
    email: string;
    telefono: string;
    /** Con quién juega: de 1 a 3 nombres escritos (T107). */
    acompanantes: { nombre: string }[];
  }): Promise<PagoIniciado> {
    return firstValueFrom(
      this.http.post<PagoIniciado>('/api/reservas/no-socio', datos),
    );
  }

  /** Los socios activos con los que se puede jugar, para elegir de una lista. */
  socios(): Promise<SocioDelDirectorio[]> {
    return firstValueFrom(this.http.get<SocioDelDirectorio[]>('/api/socios'));
  }

  /** Los invitados que el socio declaró antes, del último que usó al primero (T106). */
  misInvitados(): Promise<string[]> {
    return firstValueFrom(this.http.get<string[]>('/api/reservas/mis-invitados'));
  }

  /** Las horas que tengo tomadas, de la más próxima a la más lejana. */
  mias(): Promise<ReservaMia[]> {
    return firstValueFrom(this.http.get<ReservaMia[]>('/api/reservas/mias'));
  }

  /** Mueve una reserva a otro bloque de la grilla. */
  mover(
    id: number,
    /** `duracionMin`, 60 o 90, cambia lo que dura (T87). La valida la API. */
    destino: { canchaId: number; inicio: string; duracionMin: number },
  ): Promise<unknown> {
    return firstValueFrom(this.http.patch(`/api/reservas/${id}`, destino));
  }

  /**
   * El día para mover esta reserva: la grilla de siempre, sin contarla a ella (T87). Con
   * la pública, alargarla en la misma cancha y hora salía ocupado por ella misma.
   */
  grillaParaMover(
    id: number,
    fecha: string,
    duracionMin: DuracionMin,
  ): Promise<GrillaDeCancha[]> {
    return firstValueFrom(
      this.http.get<GrillaDeCancha[]>(`/api/reservas/${id}/grilla`, {
        params: { fecha, duracion: duracionMin },
      }),
    );
  }

  /** Cancela. Si corresponde devolución, la hace el servidor: acá solo se informa. */
  cancelar(id: number): Promise<ReservaCancelada> {
    return firstValueFrom(
      this.http.delete<ReservaCancelada>(`/api/reservas/${id}`),
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
    // El `message` del servidor gana al texto fijo. Un 404 no siempre es un bloque
    // que dejó de existir: al mover una reserva también significa "no encontramos esa
    // reserva", y responder ahí con "esa hora ya no está en el horario de la cancha"
    // manda a buscar el problema al lugar equivocado.
    return {
      motivo: 'NO_ENCONTRADO',
      mensaje:
        typeof cuerpo?.message === 'string'
          ? cuerpo.message
          : 'Esa hora ya no está en el horario de la cancha.',
    };
  }

  return {
    motivo: 'ERROR',
    mensaje: 'No se pudo completar la reserva. Reintenta en un momento.',
  };
}
