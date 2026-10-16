import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { esFechaDelClub } from '../comun/tiempo';
import { AdminO } from '../identidad/guards';
import { informeDelDiaACsv } from './csv-de-reportes';
import { descargaCsv } from './csv';
import { InformeDelDia } from './informe-del-dia.service';

/**
 * El CSV de la agenda del día (T273). Aparte de `ReportesController`, que es solo del
 * admin: la agenda la mira también el gestor, y el informe del día es la agenda en una
 * planilla.
 */
@Controller('admin')
@AdminO('gestor')
export class InformeDelDiaController {
  constructor(private readonly informe: InformeDelDia) {}

  @Get('agenda.csv')
  async csv(
    @Res({ passthrough: true }) res: Response,
    @Query('fecha') fecha?: string,
  ) {
    if (!fecha || !esFechaDelClub(fecha)) {
      throw new BadRequestException(
        'La fecha tiene que existir y tener la forma AAAA-MM-DD.',
      );
    }

    return descargaCsv(
      res,
      `agenda-${fecha}`,
      informeDelDiaACsv(await this.informe.delDia(fecha)),
    );
  }
}
