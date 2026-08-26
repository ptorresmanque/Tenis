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
} from '@nestjs/common';

import { SoloAdmin, Yo } from '../guards';
import type { UsuarioActual } from '../usuario-actual';
import { FichaDeSocioService, leerCambiosDeFicha } from './ficha.service';
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
  constructor(
    private readonly servicio: InvitacionesService,
    private readonly fichas: FichaDeSocioService,
  ) {}

  @Get()
  listado() {
    return this.servicio.listado();
  }

  /**
   * Cambia los campos de la ficha que tocan derechos.
   *
   * `@Yo()` porque cada cambio queda firmado: quién lo hizo es la mitad de lo que
   * esta operación existe para registrar.
   */
  @Patch(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    const { cambios, motivo } = leerCambiosDeFicha(cuerpo);

    return this.fichas.editar(id, cambios, yo, motivo);
  }

  @Get(':id/cambios')
  cambios(@Param('id', ParseIntPipe) id: number) {
    return this.fichas.historial(id);
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
