import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';

import { SoloAdmin, SoloSocio, Yo } from '../identidad/guards';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { ReportesService } from './reportes.service';

/**
 * Reportar una hora que quedó sin usar. `@SoloSocio()`: es una función del club
 * hacia adentro, y un visitante no tiene forma de saber qué pasó en esa cancha.
 */
@Controller('reservas')
export class ReportesController {
  constructor(private readonly servicio: ReportesService) {}

  @Post(':id/reportes')
  @HttpCode(201)
  @SoloSocio()
  async reportar(
    @Param('id', ParseIntPipe) id: number,
    @Yo() yo: UsuarioActual,
  ): Promise<{ mensaje: string }> {
    await this.servicio.reportar(id, yo.socioId!);

    // Lo que se promete es que alguien lo va a mirar, no una sanción: decidirlo
    // es del club, y prometer castigo haría de esta pantalla un arma.
    return {
      mensaje:
        'Gracias. Tu reporte es anónimo y lo revisa la administración del club.',
    };
  }
}

/** La bandeja del admin. Separada porque su prefijo y su guardia son otros. */
@Controller('admin/reportes')
@SoloAdmin()
export class AdminReportesController {
  constructor(private readonly servicio: ReportesService) {}

  @Get()
  pendientes() {
    return this.servicio.pendientes();
  }

  @Post(':reservaId')
  resolver(
    @Param('reservaId', ParseIntPipe) reservaId: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    const decision = (cuerpo as { decision?: unknown } | null)?.decision;

    if (decision !== 'SANCIONAR' && decision !== 'DESCARTAR') {
      throw new BadRequestException(
        'La decisión tiene que ser SANCIONAR o DESCARTAR.',
      );
    }

    return this.servicio.resolver(reservaId, decision, yo.id);
  }
}
