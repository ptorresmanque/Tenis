import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';

import { api, web } from '../comun/urls';
import { Autenticado, QuizasYo, SesionOpcional, Yo } from '../identidad/guards';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { PagoDePedido } from './pago-pedido.service';
import { leerPedido } from './pedidos.dto';
import { PedidosDeLaTienda } from './pedidos.service';

/**
 * Crear un pedido (T164) y pagarlo con Webpay (T165), con o sin sesión: se compra sin
 * cuenta. Con sesión de socio al día, con su descuento.
 */
@Controller('tienda/pedidos')
export class PedidosController {
  constructor(
    private readonly pedidos: PedidosDeLaTienda,
    private readonly pago: PagoDePedido,
  ) {}

  @Post()
  @SesionOpcional()
  crear(@Body() cuerpo: unknown, @QuizasYo() yo: UsuarioActual | null) {
    return this.pedidos.crear(leerPedido(cuerpo), yo);
  }

  /** "Mis pedidos" (T166). Antes de `:token`: si no, "mios" sería el token de un pedido. */
  @Get('mios')
  @Autenticado()
  mios(@Yo() yo: UsuarioActual) {
    return this.pedidos.mios(yo.id);
  }

  /** Sin sesión: el token del pedido, que solo conoce quien lo creó, hace de llave. */
  @Post(':token/pagar')
  pagar(@Param('token') token: string) {
    return this.pago.iniciar(token, `${api()}/tienda/pedidos/retorno`);
  }

  /**
   * La vuelta desde Webpay. Sin guardia, como el retorno de la cuota: quien vuelve es el
   * navegador traído por Webpay, y la cookie puede no viajar. Redirige: del otro lado hay
   * alguien mirando su pantalla. Lo que no se pagó vuelve al carrito, que sigue intacto
   * en el navegador.
   */
  @Get('retorno')
  @Redirect()
  async retorno(
    @Query('token_ws') tokenWs: string | undefined,
    @Query('TBK_TOKEN') tokenAnulado: string | undefined,
    @Query('TBK_ORDEN_COMPRA') ordenAnulada: string | undefined,
  ) {
    const vuelta = await this.pago.volver(tokenWs, tokenAnulado, ordenAnulada);

    return {
      url:
        vuelta.resultado === 'listo'
          ? `${web()}/tienda/pedido/${vuelta.pedidoToken}?pago=listo`
          : `${web()}/tienda/carrito?pago=${vuelta.resultado}`,
    };
  }

  /**
   * La confirmación y el seguimiento (T166). Después de `retorno`, por lo mismo que `mios`.
   */
  @Get(':token')
  porToken(@Param('token') token: string) {
    return this.pedidos.porToken(token);
  }
}
