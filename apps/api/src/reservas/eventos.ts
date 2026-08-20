import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import { hoyEnElClub } from '../comun/tiempo';

/** Algo cambió en la agenda de ese día del club, "AAAA-MM-DD". */
export interface CambioDeReserva {
  fecha: string;
}

/**
 * Avisos de que la agenda del club cambió, para el panel en vivo (T26).
 *
 * **El aviso lleva solo la fecha, no la reserva.** Quien escucha vuelve a pedir el
 * día: así el panel no puede quedar mostrando una versión del evento distinta de la
 * que devuelve la consulta, y los teléfonos no viajan por dos caminos que hay que
 * mantener iguales.
 *
 * `ponytail: el Subject vive en memoria, así que los avisos solo llegan a quien esté
 * conectado a **este** proceso. Con una sola instancia —que es como corre el club—
 * alcanza; si algún día hay varias detrás de un balanceador, esto pasa a ser Redis
 * pub/sub o la tabla de eventos de turno, sin tocar a quien lo usa.`
 */
@Injectable()
export class EventosDeReserva {
  private readonly cambios = new Subject<CambioDeReserva>();

  readonly flujo: Observable<CambioDeReserva> = this.cambios.asObservable();

  /**
   * Avisa por el **día del club** del bloque, no por su fecha UTC: las 22:00 de un
   * lunes en Santiago son las 02:00Z del martes, y el panel abierto en el lunes es el
   * que tiene que enterarse.
   */
  cambio(inicioDelBloque: Date): void {
    this.cambios.next({
      fecha: hoyEnElClub(inicioDelBloque).toISOString().slice(0, 10),
    });
  }
}
