import { Controller, Get, Query } from '@nestjs/common';

import { esFechaDelClub, hoyEnElClub } from '../comun/tiempo';
import { ClasesPublicas } from './clases-publicas.service';

/**
 * Las clases, sin cuenta.
 *
 * **Sin guard a propósito**: es el circuito del apoderado que busca clases para su
 * hijo, y exigirle registro para mirar horarios es la barrera que esto viene a sacar.
 * Lo que se publica lo decide `ClasesPublicas`, que arma sus propias formas para que
 * un campo nuevo del panel no salga a la calle sin que nadie lo decida.
 */
@Controller('clases')
export class ClasesPublicasController {
  constructor(private readonly clases: ClasesPublicas) {}

  /**
   * Los profesores y las clases de la semana.
   *
   * Una sola respuesta y no dos endpoints: la página los muestra juntos y siempre, y
   * dos consultas para dibujar una pantalla son dos oportunidades de que una falle.
   */
  @Get('publicas')
  async publicas(@Query('desde') desde?: string) {
    // Una fecha inventada no es un error que valga la pena mostrarle a un visitante:
    // se cae a hoy, que es lo que buscaba.
    const arranque =
      desde && esFechaDelClub(desde)
        ? desde
        : hoyEnElClub().toISOString().slice(0, 10);

    const [profesores, clases] = await Promise.all([
      this.clases.profesores(),
      this.clases.delaSemana(arranque),
    ]);

    return { profesores, clases };
  }
}
