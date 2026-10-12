import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { QuizasYo, SesionOpcional } from '../identidad/guards';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { leerCarrito } from './carrito.dto';
import { CarritoDeLaTienda } from './carrito.service';

/**
 * Cotizar el carrito (T163), con o sin sesión. Con sesión de socio al día, con su
 * descuento. Un POST que no crea nada: el carrito va en el cuerpo y no cabe en una URL.
 */
@Controller('tienda/carrito')
export class CarritoController {
  constructor(private readonly carrito: CarritoDeLaTienda) {}

  @Post('cotizar')
  @HttpCode(200)
  @SesionOpcional()
  cotizar(@Body() cuerpo: unknown, @QuizasYo() yo: UsuarioActual | null) {
    return this.carrito.cotizar(leerCarrito(cuerpo), yo);
  }
}
