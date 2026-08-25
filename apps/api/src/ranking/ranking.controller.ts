import { Controller, Get } from '@nestjs/common';

import { RankingDeTorneos } from './ranking-torneos.service';

/**
 * El ranking, sin cuenta.
 *
 * **Sin guard a propósito**, por lo mismo que el cuadro: la tabla está colgada en el
 * mural del club y esta pantalla es ese mural en el teléfono. De las personas sale el
 * nombre y el puntaje, que es lo que ya está a la vista de cualquiera que entre.
 */
@Controller('ranking')
export class RankingController {
  constructor(private readonly torneos: RankingDeTorneos) {}

  /** La tabla de torneos: puntos de las últimas 52 semanas. */
  @Get('torneos')
  torneosDelAnio() {
    return this.torneos.tabla();
  }
}
