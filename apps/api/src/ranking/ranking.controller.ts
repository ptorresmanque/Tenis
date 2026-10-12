import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

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

  /**
   * La tabla de torneos de una temporada y una categoría de juego (T198). Sin
   * categoría, la más alta con filas. La temporada es obligatoria: es la de un tour, y
   * elegir el tour es de la pantalla.
   */
  @Get('torneos')
  torneosDeLaTemporada(
    @Query('temporada') temporada?: string,
    @Query('categoria') categoria?: string,
  ) {
    const temporadaId = idDeConsulta(temporada);

    if (temporadaId === null) {
      throw new BadRequestException('Dinos de qué temporada es el ranking.');
    }

    const categoriaId =
      categoria === undefined ? null : idDeConsulta(categoria);

    if (categoria !== undefined && categoriaId === null) {
      throw new BadRequestException('Esa categoría no existe.');
    }

    return this.torneos.tabla(temporadaId, categoriaId);
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

/** Un número de la consulta, o nulo si no es un id: "uno", "0" y "-3" no lo son. */
function idDeConsulta(valor: string | undefined): number | null {
  const numero = Number(valor);

  return Number.isInteger(numero) && numero > 0 ? numero : null;
}
