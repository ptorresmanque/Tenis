import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';

import { QuizasYo, SesionOpcional } from '../identidad/guards';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { leerFiltroDelCatalogo } from './catalogo-publico.dto';
import { CatalogoPublico } from './catalogo-publico.service';

/**
 * El catálogo de la tienda para cualquiera (T161). La sesión es opcional: sin ella se ve
 * todo igual, menos el precio de socio. Bajo `tienda/`, así que el interruptor lo cubre.
 */
@Controller('tienda')
export class CatalogoPublicoController {
  constructor(private readonly catalogo: CatalogoPublico) {}

  @Get('productos')
  @SesionOpcional()
  listar(
    @Query() consulta: Record<string, unknown>,
    @QuizasYo() yo: UsuarioActual | null,
  ) {
    return this.catalogo.listar(leerFiltroDelCatalogo(consulta), yo);
  }

  @Get('productos/:id')
  @SesionOpcional()
  ficha(
    @Param('id', ParseIntPipe) id: number,
    @QuizasYo() yo: UsuarioActual | null,
  ) {
    return this.catalogo.ficha(id, yo);
  }

  /** Para armar los filtros de `/tienda`. El menú muestra "Tienda" si trae categorías. */
  @Get('filtros')
  filtros() {
    return this.catalogo.filtros();
  }
}
