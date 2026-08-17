import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { fechaDelClub } from '../comun/tiempo';
import { SoloAdmin } from '../identidad/guards';
import { AdminCanchasService } from './admin.service';
import {
  leerBloqueo,
  leerCambiosDeCancha,
  leerCanchaNueva,
  leerFranja,
  leerHorarios,
} from './admin.dto';

/**
 * El panel del club. `@SoloAdmin()` va en el controlador entero y no ruta por
 * ruta: alcanza con que a una se le olvide el decorador para que un socio pueda
 * editar las tarifas, y ese olvido no se ve leyendo el archivo.
 */
@Controller('admin')
@SoloAdmin()
export class AdminCanchasController {
  constructor(private readonly servicio: AdminCanchasService) {}

  @Get('canchas')
  canchas() {
    return this.servicio.canchas();
  }

  @Post('canchas')
  crear(@Body() cuerpo: unknown) {
    return this.servicio.crear(leerCanchaNueva(cuerpo));
  }

  @Patch('canchas/:id')
  editar(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.servicio.editar(id, leerCambiosDeCancha(cuerpo));
  }

  @Put('canchas/:id/horarios')
  horarios(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.servicio.fijarHorarios(id, leerHorarios(cuerpo));
  }

  @Post('franjas')
  crearFranja(@Body() cuerpo: unknown) {
    return this.servicio.crearFranja(leerFranja(cuerpo));
  }

  @Delete('franjas/:id')
  @HttpCode(204)
  borrarFranja(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.servicio.borrarFranja(id);
  }

  @Get('bloqueos')
  bloqueos(@Query('cancha', ParseIntPipe) cancha: number) {
    return this.servicio.bloqueos(cancha);
  }

  @Post('bloqueos')
  crearBloqueo(@Body() cuerpo: unknown) {
    return this.servicio.crearBloqueo(leerBloqueo(cuerpo));
  }

  @Delete('bloqueos/:id')
  @HttpCode(204)
  borrarBloqueo(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.servicio.borrarBloqueo(id);
  }

  @Get('advertencias')
  advertencias(@Query('fecha') fecha: string | undefined) {
    if (!fecha || !esFechaDelClub(fecha)) {
      throw new BadRequestException(
        'La fecha tiene que existir y tener la forma AAAA-MM-DD.',
      );
    }

    return this.servicio.advertencias(fecha);
  }
}

function esFechaDelClub(fecha: string): boolean {
  try {
    fechaDelClub(fecha);
    return true;
  } catch {
    return false;
  }
}
