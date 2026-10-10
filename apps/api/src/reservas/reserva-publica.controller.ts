import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';

import { api, web } from '../comun/urls';
import { leerDuracion } from './duracion';
import { ModificacionService } from './modificacion.service';
import {
  ReservaPublica,
  ReservaPublicaService,
} from './reserva-publica.service';
import { destinoDeCuerpo, fechaDeConsulta } from './reservas.dto';
import {
  RetornoDeDiferencia,
  VueltaDeDiferencia,
} from './retorno-diferencia.service';

/**
 * El destino del QR: una reserva, vista por su token.
 *
 * Público a propósito y sin sesión: portería escanea con el teléfono del mesón, que
 * no tiene la cuenta de nadie, y quien reservó sin cuenta tampoco tiene con qué
 * autenticarse. Lo que hace de credencial es el token, y por eso no se dicta ni se
 * muestra fuera del enlace.
 *
 * **Mueve, y no cancela: por decisión** (2026-10-03, T88). Quien pagó en línea cambia
 * desde acá la hora o la duración, y paga la diferencia si la hay. Cancelar no: el
 * enlace se reenvía por WhatsApp, queda en el historial del teléfono del mesón y
 * cualquiera que lo vea de reojo puede usarlo; perder de vista la pantalla un segundo
 * sería perder la hora. Quien reservó sin cuenta cancela llamando al club, y el club lo
 * hace desde la agenda del día. El costo de mover con el enlace está en
 * `SPEC-reservas.md`.
 *
 * Cualquier otra escritura acá tiene que venir con una decisión explícita detrás. El
 * test `no cancela, ni siquiera con el token correcto` está para que ese cambio no
 * pase de contrabando.
 */
@Controller('reservas')
export class ReservaPublicaController {
  constructor(
    private readonly servicio: ReservaPublicaService,
    private readonly modificacion: ModificacionService,
    private readonly retornoDeDiferencia: RetornoDeDiferencia,
  ) {}

  @Get('publica/:token')
  publica(@Param('token') token: string): Promise<ReservaPublica> {
    return this.servicio.porToken(tokenConForma(token));
  }

  /**
   * El no-socio cambia su hora o su duración desde el enlace, sin sesión (T88).
   *
   * **Solo mover.** No hay `DELETE` ni `POST` por esta ruta: cancelar sigue siendo
   * llamando al club, y un test lo vigila.
   */
  @Patch('publica/:token')
  mover(@Param('token') token: string, @Body() cuerpo: unknown) {
    return this.modificacion.modificarPorToken(
      tokenConForma(token),
      destinoDeCuerpo(cuerpo),
    );
  }

  /**
   * Paga la diferencia de un cambio desde el enlace (T89): responde a dónde ir a pagar.
   * La reserva no se mueve hasta la vuelta de Webpay, y el monto lo calcula el servidor.
   */
  @Post('publica/:token/diferencia')
  async pagarDiferencia(
    @Param('token') token: string,
    @Body() cuerpo: unknown,
  ) {
    const pago = await this.modificacion.pagarDiferenciaPorToken(
      tokenConForma(token),
      destinoDeCuerpo(cuerpo),
      `${api()}/reservas/retorno-diferencia`,
    );

    // Lo que necesita el navegador para ir a la pasarela, y nada de los ids internos.
    return {
      montoClp: pago.montoClp,
      urlRedireccion: pago.urlRedireccion,
      tokenPasarela: pago.tokenPasarela,
    };
  }

  /** La vuelta de Webpay del pago de una diferencia: a la página de la reserva. */
  @Get('retorno-diferencia')
  @Redirect()
  async retornoDiferencia(
    @Query('token_ws') tokenWs: string | undefined,
    @Query('TBK_TOKEN') tokenAnulado: string | undefined,
    @Query('TBK_ORDEN_COMPRA') ordenAnulada: string | undefined,
  ) {
    // Solo `token_ws`, sin `TBK_TOKEN`, trae un pago que confirmar: los otros casos
    // están en la vuelta del pago original (`NoSocioController.retorno`).
    const vuelta =
      tokenWs && !tokenAnulado
        ? await this.retornoDeDiferencia.confirmar(tokenWs)
        : {
            ...(await this.retornoDeDiferencia.anular(ordenAnulada ?? '')),
            motivo: tokenAnulado && !tokenWs ? 'anulado' : 'sin_token',
          };

    return { url: destinoDeLaVuelta(vuelta) };
  }

  /** La grilla para mover desde el enlace, sin contar la reserva (T88). */
  @Get('publica/:token/grilla')
  grilla(
    @Param('token') token: string,
    @Query('fecha') fecha: string | undefined,
    @Query('duracion') duracion: string | undefined,
  ) {
    return this.modificacion.grillaParaMoverPorToken(
      tokenConForma(token),
      fechaDeConsulta(fecha),
      leerDuracion(duracion),
    );
  }
}

/**
 * Se filtra por forma antes de ir a la base: un token con otra pinta es un enlace roto o
 * alguien probando, y no hay por qué gastarle una consulta.
 */
function tokenConForma(token: string): string {
  if (!/^[\w-]{16,43}$/.test(token)) {
    throw new BadRequestException('Ese enlace no es válido.');
  }

  return token;
}

/**
 * La página de la reserva, con lo que pasó: `cambio=hecho` o el motivo. Sin reserva
 * conocida, la confirmación de siempre con su error.
 */
function destinoDeLaVuelta(vuelta: VueltaDeDiferencia): string {
  if (vuelta.token === null) {
    return `${web()}/reservas/confirmacion?error=${vuelta.motivo ?? 'sin_token'}`;
  }

  const parametros = new URLSearchParams({
    cambio:
      vuelta.estado === 'CAMBIADA' ? 'hecho' : (vuelta.motivo ?? 'rechazado'),
  });

  // Cuánto se devolvió si la hora se tomó mientras se pagaba (T90): la página lo dice.
  // Cero es que la devolución falló y quedó para revisión.
  if (vuelta.devueltoClp !== undefined) {
    parametros.set('devuelto', String(vuelta.devueltoClp));
  }

  return `${web()}/r/${vuelta.token}?${parametros.toString()}`;
}
