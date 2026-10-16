import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';
import { AdminO, Yo } from '../identidad/guards';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { leerTexto, Observaciones } from './observaciones.service';

/**
 * Las observaciones del mesón (T225). Para el admin y el gestor: el socio no las ve, y el
 * profesor no tiene nada que anotar sobre las reservas de nadie.
 */
@Controller('admin/reservas')
@AdminO('gestor')
export class ObservacionesController {
  constructor(private readonly observaciones: Observaciones) {}

  /** El historial completo de un socio, para la agenda y para su ficha. */
  @Get('observaciones')
  historial(@Query('socioId') socioId: string | undefined) {
    return this.observaciones.delSocio(entero(Number(socioId), 'El socio', 1));
  }

  @Post(':id/observaciones')
  anotar(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    return this.observaciones.anotar(id, leerTexto(cuerpo), yo);
  }

  @Patch('observaciones/:id')
  corregir(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    return this.observaciones.corregir(id, leerTexto(cuerpo), yo);
  }

  @Delete('observaciones/:id')
  @HttpCode(200)
  borrar(@Param('id', ParseIntPipe) id: number, @Yo() yo: UsuarioActual) {
    return this.observaciones.borrar(id, yo);
  }
}
