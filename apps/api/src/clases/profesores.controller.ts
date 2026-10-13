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

  /** Con `usuarioId`, la ficha nace con cuenta (T217). */
  @Post()
  crear(@Body() cuerpo: unknown) {
    const { usuarioId } = (cuerpo ?? {}) as Record<string, unknown>;

    return this.profesores.crear(
      leerFichaNueva(cuerpo),
      usuarioId === undefined || usuarioId === null
        ? null
        : entero(usuarioId, 'La cuenta', 1),
    );
  }

  /** Le da cuenta a una ficha que no la tiene, para que entre a Clases (T217). */
  @Post(':id/cuenta')
  @HttpCode(200)
  vincular(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    const { usuarioId } = (cuerpo ?? {}) as Record<string, unknown>;

    return this.profesores.vincular(id, entero(usuarioId, 'La cuenta', 1));
  }

  @Delete(':id/cuenta')
  desvincular(@Param('id', ParseIntPipe) id: number) {
    return this.profesores.desvincular(id);
  }

  /** Editar la ficha y activar o desactivar son el mismo verbo: cambiar un campo. */
  @Patch(':id')
  editar(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.profesores.editar(id, leerCambio(cuerpo));
  }
}
