import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

/** Espejo de `ReservaDelDia` en la API. */
export interface ReservaDelDia {
  id: number;
  folio: string;
  cancha: string;
  inicio: string;
  fin: string;
  estado: 'PENDIENTE_PAGO' | 'CONFIRMADA';
  nombre: string;
  telefono: string;
  esSocio: boolean;
  acompanantes: string[];
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

  /** Las reservas activas de un día del club, "AAAA-MM-DD". */
  delDia(fecha: string): Promise<ReservaDelDia[]> {
    return firstValueFrom(
      this.http.get<ReservaDelDia[]>('/api/admin/reservas', {
        params: { fecha },
      }),
    );
  }
}
