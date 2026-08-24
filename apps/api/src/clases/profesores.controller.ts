import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { SoloAdmin } from '../identidad/guards';
import { leerCambio, leerFichaNueva } from './profesores.dto';
import { Profesores } from './profesores.service';

/**
 * Las fichas de los profesores.
 *
 * `@SoloAdmin()` sobre el controlador entero: acá está el teléfono y la tarifa de
 * cada uno. Lo que el club anuncia de ellos es otra pantalla y sale sin cuenta.
 */
@Controller('admin/profesores')
@SoloAdmin()
export class ProfesoresController {
  constructor(private readonly profesores: Profesores) {}

  /** Con `?activos=1`, la lista con la que se agenda. */
  @Get()
  listar(@Query('activos') activos = '') {
    return this.profesores.listar(activos === '1');
  }

  @Post()
  crear(@Body() cuerpo: unknown) {
    return this.profesores.crear(leerFichaNueva(cuerpo));
  }

  /** Editar la ficha y activar o desactivar son el mismo verbo: cambiar un campo. */
  @Patch(':id')
  editar(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.profesores.editar(id, leerCambio(cuerpo));
  }
}
