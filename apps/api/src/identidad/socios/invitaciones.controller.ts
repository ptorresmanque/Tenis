import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';

import { SoloAdmin } from '../guards';
import { leerInvitacion } from './invitaciones.dto';
import { InvitacionesService } from './invitaciones.service';

/**
 * Los socios del club, desde la administración.
 *
 * `@SoloAdmin()` en el controlador entero y no ruta por ruta: alcanza con que a una
 * se le olvide el decorador para que cualquiera se dé de alta como socio.
 */
@Controller('admin/socios')
@SoloAdmin()
export class InvitacionesController {
  constructor(private readonly servicio: InvitacionesService) {}

  @Get()
  listado() {
    return this.servicio.listado();
  }

  @Post('invitaciones')
  invitar(@Body() cuerpo: unknown) {
    return this.servicio.invitar(leerInvitacion(cuerpo));
  }

  @Delete('invitaciones/:id')
  @HttpCode(204)
  revocar(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.servicio.revocar(id);
  }
}
