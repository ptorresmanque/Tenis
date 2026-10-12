import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';

import { SoloAdmin } from '../identidad/guards';
import {
  leerCambioDeCategoria,
  leerCategoria,
  leerMarca,
  leerTablaDeTallas,
} from './catalogo-admin.dto';
import { CategoriasYMarcas } from './catalogo-admin.service';

/**
 * Las categorías, las marcas y sus tablas de tallas, para el panel (T156).
 *
 * `@SoloAdmin()` en la clase entera, como en el resto del panel. Antes que el guard
 * corre el interruptor del módulo: con la tienda apagada, esto responde 404 incluso a un
 * admin.
 */
@Controller('admin/tienda')
@SoloAdmin()
export class CatalogoAdminController {
  constructor(private readonly catalogo: CategoriasYMarcas) {}

  @Get('categorias')
  listarCategorias() {
    return this.catalogo.listarCategorias();
  }

  @Post('categorias')
  crearCategoria(@Body() cuerpo: unknown) {
    return this.catalogo.crearCategoria(leerCategoria(cuerpo));
  }

  @Patch('categorias/:id')
  editarCategoria(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.catalogo.editarCategoria(id, leerCambioDeCategoria(cuerpo));
  }

  @Get('marcas')
  listarMarcas() {
    return this.catalogo.listarMarcas();
  }

  @Post('marcas')
  crearMarca(@Body() cuerpo: unknown) {
    return this.catalogo.crearMarca(leerMarca(cuerpo));
  }

  @Patch('marcas/:id')
  editarMarca(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.catalogo.editarMarca(id, leerMarca(cuerpo));
  }

  @Get('marcas/:id/tallas')
  tallas(@Param('id', ParseIntPipe) id: number) {
    return this.catalogo.tallasDe(id);
  }

  @Put('marcas/:id/tallas')
  guardarTallas(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.catalogo.guardarTallas(id, leerTablaDeTallas(cuerpo));
  }
}
