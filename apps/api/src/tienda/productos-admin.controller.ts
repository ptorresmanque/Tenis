import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { MAXIMO_BYTES } from '../comun/imagenes';
import { SoloAdmin, Yo } from '../identidad/guards';
// `import type`: con isolatedModules y emitDecoratorMetadata, un tipo que aparece en una
// firma decorada no puede entrar como import normal.
import type { UsuarioActual } from '../identidad/usuario-actual';
import { FotosDeProductos } from './fotos.service';
import {
  leerCambioDeProducto,
  leerCambioDeVariante,
  leerCategoriaDeLaLista,
  leerEstado,
  leerOrdenDeFotos,
  leerProductoNuevo,
  leerVarianteNueva,
} from './productos.dto';
import { ProductosDeLaTienda } from './productos.service';

/**
 * Los productos, sus variantes y sus fotos, para el panel (T158).
 *
 * `@SoloAdmin()` en la clase, como en el resto del panel, y antes el interruptor del
 * módulo. **No hay `DELETE` de productos ni de variantes**: se archivan y se desactivan,
 * porque en cuanto se venden tienen pedidos colgando.
 */
@Controller('admin/tienda')
@SoloAdmin()
export class ProductosAdminController {
  constructor(
    private readonly productos: ProductosDeLaTienda,
    private readonly fotos: FotosDeProductos,
  ) {}

  @Get('productos')
  listar(
    @Query('estado') estado?: string,
    @Query('categoriaId') categoriaId?: string,
  ) {
    return this.productos.listar({
      estado: leerEstado(estado),
      categoriaId: leerCategoriaDeLaLista(categoriaId),
    });
  }

  @Get('productos/:id')
  ficha(@Param('id', ParseIntPipe) id: number) {
    return this.productos.ficha(id);
  }

  @Post('productos')
  crear(@Body() cuerpo: unknown, @Yo() yo: UsuarioActual) {
    return this.productos.crear(leerProductoNuevo(cuerpo), yo.id);
  }

  @Patch('productos/:id')
  editar(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.productos.editar(id, leerCambioDeProducto(cuerpo));
  }

  @Post('productos/:id/variantes')
  agregarVariante(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    return this.productos.agregarVariante(id, leerVarianteNueva(cuerpo), yo.id);
  }

  @Patch('variantes/:id')
  editarVariante(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.productos.editarVariante(id, leerCambioDeVariante(cuerpo));
  }

  /** Como las fotos de torneos: reencodada, sin EXIF, con su miniatura. */
  @Post('productos/:id/fotos')
  @UseInterceptors(
    FileInterceptor('foto', { limits: { fileSize: MAXIMO_BYTES } }),
  )
  subirFoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() archivo?: { buffer: Buffer },
  ) {
    if (!archivo) throw new BadRequestException('Adjunta la foto.');

    return this.fotos.subir(id, archivo.buffer);
  }

  @Put('productos/:id/fotos/orden')
  ordenarFotos(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.fotos.reordenar(id, leerOrdenDeFotos(cuerpo));
  }

  @Delete('productos/:productoId/fotos/:id')
  quitarFoto(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.fotos.quitar(productoId, id);
  }
}
