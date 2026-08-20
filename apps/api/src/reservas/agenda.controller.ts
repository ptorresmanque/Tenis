import {
  BadRequestException,
  Controller,
  Get,
  MessageEvent,
  Query,
  Sse,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

import { fechaDelClub } from '../comun/tiempo';
import { SoloAdmin } from '../identidad/guards';
import { AgendaService, ReservaDelDia } from './agenda.service';
import { EventosDeReserva } from './eventos';

/**
 * El día del club para quien atiende el mesón.
 *
 * `@SoloAdmin()` en el controlador entero, igual que `AdminCanchasController`: acá
 * viajan los teléfonos de quienes reservaron, que en la grilla pública ni siquiera
 * aparecen.
 */
@Controller('admin/reservas')
@SoloAdmin()
export class AgendaController {
  constructor(
    private readonly agenda: AgendaService,
    private readonly eventos: EventosDeReserva,
  ) {}

  /**
   * El panel escucha acá y vuelve a pedir el día cuando le avisan.
   *
   * **Server-Sent Events y no WebSocket**: el flujo va en un solo sentido, viaja sobre
   * el mismo HTTP —así pasa por el proxy del dev server y por la cookie de sesión sin
   * nada especial— y `EventSource` reconecta solo. Un WebSocket traería una
   * dependencia y un canal bidireccional que nadie necesita.
   */
  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.eventos.flujo.pipe(map((cambio) => ({ data: cambio })));
  }

  @Get()
  delDia(@Query('fecha') fecha: string | undefined): Promise<ReservaDelDia[]> {
    if (!fecha || !esFechaDelClub(fecha)) {
      // Como en la disponibilidad de T12: una fecha ilegible es culpa de quien la
      // pidió, y dejarla fallar adentro saldría con un 500 que parece la API rota.
      throw new BadRequestException(
        'La fecha tiene que existir y tener la forma AAAA-MM-DD.',
      );
    }

    return this.agenda.delDia(fecha);
  }
}

function esFechaDelClub(fecha: string): boolean {
  try {
    fechaDelClub(fecha);
    return true;
  } catch {
    return false;
  }
}
