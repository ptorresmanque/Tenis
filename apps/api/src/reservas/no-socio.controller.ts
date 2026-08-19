import { Body, Controller, Get, Post, Query, Redirect } from '@nestjs/common';

import { reservaDeNoSocioDeCuerpo } from './no-socio.dto';
import {
  PagoDeReservaIniciado,
  ReservaNoSocioService,
} from './reserva-no-socio.service';

/** Dónde vuelve la persona después de pagar. */
const web = () => process.env.WEB_ORIGIN ?? 'http://localhost:4200';
const api = () =>
  process.env.API_PUBLIC_URL ??
  `http://localhost:${process.env.PORT ?? 3001}/api`;

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
        url: destino(
          anulada.estado,
          anulada.folio,
          tokenAnulado ? 'anulado' : 'sin_token',
        ),
      };
    }

    const resultado = await this.reservas.confirmarDesdeRetorno(tokenWs);

    return {
      url: destino(resultado.estado, resultado.folio, resultado.motivo),
    };
  }
}

function destino(
  estado: string,
  folio: string | null,
  motivo: string | null,
): string {
  const parametros = new URLSearchParams();
  if (folio) parametros.set('folio', folio);
  if (estado !== 'CONFIRMADA')
    parametros.set('error', motivo ?? estado.toLowerCase());

  return `${web()}/reservas/confirmacion?${parametros.toString()}`;
}
