import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';

import { SoloAdmin, Yo } from '../identidad/guards';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { EmisionDeCuotas } from './emision.service';
import { leerMedio, PagoManualDeCuota } from './pago-manual.service';

/**
 * Las cuotas del club, mes a mes.
 *
 * `@SoloAdmin()` sobre el controlador entero: acá está cuánto debe cada socio con
 * nombre y apellido. Lo que el socio ve de lo suyo es otra pantalla y otro endpoint.
 */
@Controller('admin/cuotas')
@SoloAdmin()
export class CuotasController {
  constructor(
    private readonly emision: EmisionDeCuotas,
    private readonly pagoManual: PagoManualDeCuota,
  ) {}

  /**
   * `GET` que escribe, y conviene decirlo: mirar el mes lo emite.
   *
   * Es la decisión de `SPEC-cuotas.md` § La emisión es perezosa, y la alternativa
   * —un `POST /emitir` aparte— sería un endpoint que hay que acordarse de llamar, o
   * sea el mismo problema del cron con otra forma. La operación es idempotente, que
   * es lo que un `GET` promete de verdad.
   */
  @Get()
  delPeriodo(@Query('periodo') periodo = '') {
    return this.emision.delPeriodo(periodo);
  }

  /**
   * El pago en el mesón: efectivo o transferencia.
   *
   * `@Yo()` porque queda escrito quién lo registró. Es dinero que pasó por las manos
   * de una persona.
   */
  @Post(':id/pago')
  pagar(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    return this.pagoManual.registrar(id, leerMedio(cuerpo), yo);
  }
}
