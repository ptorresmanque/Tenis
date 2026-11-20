import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { SoloAdmin } from '../identidad/guards';
import { descargaCsv } from '../reportes/csv';
import {
  FichaDePago,
  leerFiltro,
  leerOrigen,
  leerPagina,
  ListadoDePagos,
  PagosDelClubService,
} from './pagos-del-club.service';

/**
 * Finanzas › Pagos (T396, `SPEC-panel.md` § Los pagos del club). Solo el admin: Finanzas no es
 * del gestor (asunción 1). Ningún endpoint devuelve el token de la pasarela (F9): todo sale de
 * `pagoWebpay`, que lo deja afuera.
 */
@Controller('admin')
@SoloAdmin()
export class PagosDelClubController {
  constructor(private readonly pagos: PagosDelClubService) {}

  @Get('pagos')
  listado(@Query() consulta: Record<string, unknown>): Promise<ListadoDePagos> {
    return this.pagos.listado(
      leerFiltro(consulta),
      leerPagina(consulta['pagina']),
    );
  }

  /** La planilla del mismo filtro, sin paginar (asunción 10). */
  @Get('pagos.csv')
  async csv(
    @Res({ passthrough: true }) res: Response,
    @Query() consulta: Record<string, unknown>,
  ): Promise<string> {
    const filtro = leerFiltro(consulta);
    return descargaCsv(
      res,
      `pagos-${filtro.desde}-a-${filtro.hasta}`,
      await this.pagos.csv(filtro),
    );
  }

  @Get('pagos/:origen/:id')
  ficha(
    @Param('origen') origen: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<FichaDePago> {
    return this.pagos.ficha(leerOrigen(origen), id);
  }
}
