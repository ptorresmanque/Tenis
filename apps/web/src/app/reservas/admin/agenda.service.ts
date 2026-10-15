import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

/** Espejo de `ReservaDelDia` en la API. */
export interface ReservaDelDia {
  id: number;
  folio: string;
  cancha: string;
  /** Para ubicarla en el tablero de la agenda (T269). */
  canchaId: number;
  inicio: string;
  fin: string;
  estado: 'PENDIENTE_PAGO' | 'CONFIRMADA';
  nombre: string;
  telefono: string;
  esSocio: boolean;
  /** El socio, para abrir su historial de observaciones (T226). Nulo si es visitante. */
  socioId: number | null;
  acompanantes: string[];
  observaciones: ObservacionDeReserva[];
  /** Cuántas tiene el socio en reservas de días anteriores. */
  observacionesAnteriores: number;
}

/** Una nota del mesón sobre una reserva (T225). */
export interface ObservacionDeReserva {
  id: number;
  texto: string;
  autorId: number;
  autorNombre: string;
  creadaEn: string;
  editadaEn: string | null;
}

/** Una observación del historial del socio, con la reserva a la que pertenece. */
export interface ObservacionDelHistorial extends ObservacionDeReserva {
  reservaId: number;
  folio: string;
  cancha: string;
  inicio: string;
}

@Service()
export class Agenda {
  private readonly http = inject(HttpClient);

  /**
   * Avisos de que la agenda cambió, por Server-Sent Events.
   *
   * `EventSource` y no un WebSocket: el flujo va en un solo sentido, viaja sobre el
   * mismo HTTP —así lo pasa el proxy del dev server y lleva la cookie de sesión sin
   * configurar nada— y el navegador reconecta solo si se corta.
   *
   * Es un observable frío: se conecta cuando alguien se suscribe y cierra el canal al
   * desuscribirse, así el panel no deja una conexión abierta al salir de la pantalla.
   */
  readonly avisos = new Observable<{ fecha: string }>((quienEscucha) => {
    const fuente = new EventSource('/api/admin/reservas/stream');

    fuente.onmessage = (evento: MessageEvent<string>) =>
      quienEscucha.next(JSON.parse(evento.data) as { fecha: string });

    // Sin `onerror` el navegador reintenta solo, que es lo que se quiere; se registra
    // para no dejar el error mudo si el canal se cae del todo.
    fuente.onerror = () => console.warn('Se cortó el aviso en vivo; reintentando.');

    return () => fuente.close();
  });

  anotar(reservaId: number, texto: string): Promise<ObservacionDeReserva> {
    return firstValueFrom(
      this.http.post<ObservacionDeReserva>(
        `/api/admin/reservas/${reservaId}/observaciones`,
        { texto },
      ),
    );
  }

  corregir(id: number, texto: string): Promise<ObservacionDeReserva> {
    return firstValueFrom(
      this.http.patch<ObservacionDeReserva>(`/api/admin/reservas/observaciones/${id}`, {
        texto,
      }),
    );
  }

  borrar(id: number): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.delete<{ id: number }>(`/api/admin/reservas/observaciones/${id}`),
    );
  }

  /** Todas las observaciones del socio, de la reserva más nueva a la más vieja. */
  historial(socioId: number): Promise<ObservacionDelHistorial[]> {
    return firstValueFrom(
      this.http.get<ObservacionDelHistorial[]>('/api/admin/reservas/observaciones', {
        params: { socioId },
      }),
    );
  }

  /** Las reservas activas de un día del club, "AAAA-MM-DD". */
  delDia(fecha: string): Promise<ReservaDelDia[]> {
    return firstValueFrom(
      this.http.get<ReservaDelDia[]>('/api/admin/reservas', {
        params: { fecha },
      }),
    );
  }
}
