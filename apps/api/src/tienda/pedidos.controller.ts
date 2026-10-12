import { Body, Controller, Post } from '@nestjs/common';

import { QuizasYo, SesionOpcional } from '../identidad/guards';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { leerPedido } from './pedidos.dto';
import { PedidosDeLaTienda } from './pedidos.service';

/**
 * Crear un pedido (T164), con o sin sesión: se compra sin cuenta. Con sesión de socio al
 * día, con su descuento. Pagarlo con Webpay llega en T165.
 */
@Controller('tienda/pedidos')
export class PedidosController {
  constructor(private readonly pedidos: PedidosDeLaTienda) {}

  @Post()
  @SesionOpcional()
  crear(@Body() cuerpo: unknown, @QuizasYo() yo: UsuarioActual | null) {
    return this.pedidos.crear(leerPedido(cuerpo), yo);
  }
}
