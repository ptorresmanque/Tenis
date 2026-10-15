import {
  BadRequestException,
  Body,
  Controller,
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

  /**
   * La ficha nace con su cuenta (T217), y desde T297 **siempre** con una
   * (SPEC-panel.md D12): el profesor se registra en el sitio y el admin lo marca
   * Profesor en Personas.
   */
  @Post()
  crear(@Body() cuerpo: unknown) {
    const { usuarioId } = (cuerpo ?? {}) as Record<string, unknown>;
    const ficha = leerFichaNueva(cuerpo);

    if (usuarioId === undefined || usuarioId === null) {
      throw new BadRequestException(
        'El profesor necesita su cuenta: que se registre en el sitio, y márcalo ' +
          'Profesor en Personas.',
      );
    }

    return this.profesores.crear(ficha, entero(usuarioId, 'La cuenta', 1));
  }

  /**
   * Le da cuenta a una ficha que no la tiene, para que entre a Clases (T217). Desde T297
   * es como se asocia, desde Personas, una ficha de antes que no tenía cuenta (D14).
   * Quitársela ya no existe: el Profesor se quita desactivando la ficha.
   */
  @Post(':id/cuenta')
  @HttpCode(200)
  vincular(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    const { usuarioId } = (cuerpo ?? {}) as Record<string, unknown>;

    return this.profesores.vincular(id, entero(usuarioId, 'La cuenta', 1));
  }

  /** Editar la ficha y activar o desactivar son el mismo verbo: cambiar un campo. */
  @Patch(':id')
  editar(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.profesores.editar(id, leerCambio(cuerpo));
  }
}
