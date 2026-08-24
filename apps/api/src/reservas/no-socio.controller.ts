import { Body, Controller, Get, Post, Query, Redirect } from '@nestjs/common';

import { api, web } from '../comun/urls';
import { reservaDeNoSocioDeCuerpo } from './no-socio.dto';
import {
  PagoDeReservaIniciado,
  ReservaNoSocioService,
  RetornoDePago,
} from './reserva-no-socio.service';

@Controller('reservas')
export class NoSocioController {
  constructor(private readonly reservas: ReservaNoSocioService) {}

  /** Sin sesión a propósito: pedir cuenta antes de dejar pagar espanta al visitante. */
  @Post('no-socio')
  reservar(@Body() cuerpo: unknown): Promise<PagoDeReservaIniciado> {
    return this.reservas.iniciar(
      reservaDeNoSocioDeCuerpo(cuerpo),
      `${api()}/reservas/retorno`,
    );
  }

  /**
   * La vuelta desde la pasarela.
   *
   * **Por `GET` y con el token en la query**, que es como Webpay vuelve de verdad —
   * verificado contra el ambiente de integración en T17, donde esperar un POST hizo
   * que Transbank abortara la transacción con la tarjeta ya tecleada. Se aceptan las
   * dos formas por si el comercio queda configurado al revés.
   *
   * Redirige en vez de responder JSON: del otro lado hay una persona con su navegador,
   * no un programa.
   */
  @Get('retorno')
  @Redirect()
  async retorno(
    @Query('token_ws') tokenWs: string | undefined,
    @Query('TBK_TOKEN') tokenAnulado: string | undefined,
    @Query('TBK_ORDEN_COMPRA') ordenAnulada: string | undefined,
  ) {
    if (!tokenWs) {
      // Sin `token_ws` vuelve quien apretó "anular compra" en Webpay.
      const anulada = await this.reservas.anularDesdeRetorno(
        ordenAnulada ?? '',
      );
      return {
        url: destino({
          ...anulada,
          motivo: tokenAnulado ? 'anulado' : 'sin_token',
        }),
      };
    }

    return { url: destino(await this.reservas.confirmarDesdeRetorno(tokenWs)) };
  }
}

/**
 * A dónde vuelve el navegador después de la pasarela.
 *
 * El token viaja **solo cuando la reserva quedó confirmada**: es la llave de la
 * página pública, y mandarlo en una vuelta rechazada sería entregar el enlace de
 * una hora que ya no existe.
 */
function destino(retorno: RetornoDePago): string {
  const parametros = new URLSearchParams();

  if (retorno.folio) parametros.set('folio', retorno.folio);

  if (retorno.estado === 'CONFIRMADA') {
    if (retorno.token) parametros.set('t', retorno.token);
  } else {
    parametros.set('error', retorno.motivo ?? retorno.estado.toLowerCase());
  }

  return `${web()}/reservas/confirmacion?${parametros.toString()}`;
}
