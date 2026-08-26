import { Controller, Get } from '@nestjs/common';

import { SoloSocio } from '../identidad/guards';
import { RankingInterno } from './ranking-interno.service';
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
  constructor(
    private readonly torneos: RankingDeTorneos,
    private readonly interno: RankingInterno,
  ) {}

  /** La tabla de torneos: puntos de las últimas 52 semanas. */
  @Get('torneos')
  torneosDelAnio() {
    return this.torneos.tabla();
  }

  /**
   * La tabla interna: el Elo de los amistosos entre socios.
   *
   * **Ésta sí lleva guardia, al revés que la de torneos.** Un torneo es un evento
   * público y su cuadro está colgado en el mural; el orden de juego entre socios es
   * cosa de adentro, y publicarlo en la calle es sacar a la vereda quién le gana a
   * quién en el club.
   */
  @Get('interno')
  @SoloSocio()
  delClub() {
    return this.interno.tabla();
  }
}
