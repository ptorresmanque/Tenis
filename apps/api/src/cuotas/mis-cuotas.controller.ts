import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';

import { api, web } from '../comun/urls';
import { Autenticado, Yo } from '../identidad/guards';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { PagoEnLineaDeCuota } from './pago-en-linea.service';

/**
 * Lo que el socio ve y paga de lo suyo.
 *
 * `@Autenticado()` y no `@SoloSocio()`: quien todavía no tiene ficha recibe una cuenta
 * vacía, que es la verdad, y no un 403 que se lee como que el sistema está roto. Es el
 * mismo criterio que `GET /api/reservas/mias`.
 */
@Controller('cuotas')
export class MisCuotasController {
  constructor(private readonly pagos: PagoEnLineaDeCuota) {}

  @Get('mias')
  @Autenticado()
  mias(@Yo() yo: UsuarioActual) {
    return this.pagos.mias(yo);
  }

  @Post(':id/pagar')
  @Autenticado()
  pagar(@Param('id', ParseIntPipe) id: number, @Yo() yo: UsuarioActual) {
    return this.pagos.iniciar(id, yo, `${api()}/cuotas/retorno`);
  }

  /**
   * La vuelta desde la pasarela.
   *
   * Sin guardia, como el retorno de la reserva: quien vuelve es el navegador de la
   * persona traído por Webpay, y la cookie puede no viajar en esa redirección. Lo que
   * hace de credencial es el token, que solo conoce quien pagó.
   *
   * Redirige en vez de responder JSON: del otro lado hay alguien mirando su pantalla.
   */
  @Get('retorno')
  @Redirect()
  async retorno(@Query('token_ws') tokenWs: string | undefined) {
    if (!tokenWs) {
      // Vuelve quien apretó "anular" en Webpay. No hay nada que confirmar y la cuota
      // sigue pendiente; la transacción la barre la expiración de T19.
      return { url: `${web()}/mi-cuenta?pago=anulado` };
    }

    const resultado = await this.pagos.confirmar(tokenWs);

    return {
      url: `${web()}/mi-cuenta?pago=${resultado.estado === 'AUTORIZADA' ? 'listo' : 'rechazado'}`,
    };
  }
}
