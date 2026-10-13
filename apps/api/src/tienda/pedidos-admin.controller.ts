import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';

import { SoloAdmin, Yo } from '../identidad/guards';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { leerCancelacion, leerDevolucion } from './devoluciones.dto';
import { DevolucionesDeLaTienda } from './devoluciones.service';
import { leerFiltroDePedidos, leerSeguimiento } from './pedidos-admin.dto';
import { PedidosDelPanel } from './pedidos-admin.service';

/**
 * Los pedidos de la tienda en el panel (T169). Bajo `admin/tienda/`: el interruptor lo
 * cubre, y con la tienda apagada responde 404.
 */
@Controller('admin/tienda/pedidos')
@SoloAdmin()
export class PedidosAdminController {
  constructor(
    private readonly pedidos: PedidosDelPanel,
    private readonly devoluciones: DevolucionesDeLaTienda,
  ) {}

  @Get()
  listar(@Query('estado') estado?: string, @Query('canal') canal?: string) {
    return this.pedidos.listar(leerFiltroDePedidos(estado, canal));
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.pedidos.detalle(id);
  }

  @Post(':id/listo')
  @HttpCode(200)
  listo(@Param('id', ParseIntPipe) id: number) {
    return this.pedidos.aplicar(id, 'listo');
  }

  @Post(':id/despachado')
  @HttpCode(200)
  despachado(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.pedidos.aplicar(id, 'despachado', leerSeguimiento(cuerpo));
  }

  @Post(':id/entregado')
  @HttpCode(200)
  entregado(@Param('id', ParseIntPipe) id: number) {
    return this.pedidos.aplicar(id, 'entregado');
  }

  /** Anula el pago en Webpay, o con `medio: TRANSFERENCIA`, devuelve por fuera (T174). */
  @Post(':id/cancelar')
  @HttpCode(200)
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    return this.devoluciones.cancelar(id, leerCancelacion(cuerpo), yo.id);
  }

  @Post(':id/devoluciones')
  devolver(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    return this.devoluciones.devolver(id, leerDevolucion(cuerpo), yo.id);
  }
}
