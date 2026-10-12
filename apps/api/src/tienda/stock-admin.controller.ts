import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';

import { SoloAdmin, Yo } from '../identidad/guards';
// `import type`: con isolatedModules y emitDecoratorMetadata, un tipo que aparece en una
// firma decorada no puede entrar como import normal.
import type { UsuarioActual } from '../identidad/usuario-actual';
import { leerMovimiento } from './movimientos.dto';
import { MovimientosDeStock } from './movimientos.service';

/**
 * El stock de una variante en el panel (T160): su historial, y registrar una entrada o un
 * ajuste. `@SoloAdmin()` en la clase, y antes el interruptor del módulo.
 */
@Controller('admin/tienda/variantes')
@SoloAdmin()
export class StockAdminController {
  constructor(private readonly movimientos: MovimientosDeStock) {}

  @Get(':id/movimientos')
  historial(@Param('id', ParseIntPipe) id: number) {
    return this.movimientos.historial(id);
  }

  @Post(':id/movimientos')
  registrar(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    return this.movimientos.registrar(id, leerMovimiento(cuerpo), yo.id);
  }
}
