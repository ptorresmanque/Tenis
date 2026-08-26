import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';

import { hoyEnElClub } from '../comun/tiempo';
import { TorneosPublicos } from './torneos-publicos.service';

/**
 * Los torneos, sin cuenta.
 *
 * **Sin guard a propósito**: el calendario es de las pocas cosas que un tercero mira
 * antes de asociarse, y el cuadro es el mismo mural del club en el teléfono de quien
 * está en la cancha de al lado. Lo que se publica lo decide `TorneosPublicos`, que
 * arma sus propias formas para que un campo del panel no salga a la calle sin que
 * nadie lo decida.
 */
@Controller('torneos')
export class TorneosPublicosController {
  constructor(private readonly torneos: TorneosPublicos) {}

  /** El calendario del año. Sin `anio`, el que está corriendo. */
  @Get('publicos')
  calendario(@Query('anio') anio?: string) {
    const pedido = Number(anio);
    const valido = Number.isInteger(pedido) && pedido > 2000 && pedido < 2100;

    // Un año inventado no es un error que valga la pena mostrarle a un visitante: se
    // cae al actual, que es lo que buscaba.
    return this.torneos.calendario(
      valido ? pedido : hoyEnElClub().getUTCFullYear(),
    );
  }

  /** El cuadro con sus resultados, o la lista de inscritos si todavía no se armó. */
  @Get(':id/cuadro')
  cuadro(@Param('id', ParseIntPipe) id: number) {
    return this.torneos.cuadro(id);
  }
}
