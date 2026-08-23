import { BadRequestException, Controller, Get, Param } from '@nestjs/common';

import {
  ReservaPublica,
  ReservaPublicaService,
} from './reserva-publica.service';

/**
 * El destino del QR: una reserva, vista por su token.
 *
 * Público a propósito y sin sesión: portería escanea con el teléfono del mesón, que
 * no tiene la cuenta de nadie, y quien reservó sin cuenta tampoco tiene con qué
 * autenticarse. Lo que hace de credencial es el token, y por eso no se dicta ni se
 * muestra fuera del enlace.
 *
 * **Solo lectura, y no por ahora: por decisión.** El token no cancela. Es un enlace
 * que se reenvía por WhatsApp, que queda en el historial del teléfono del mesón y
 * que cualquiera que lo vea de reojo puede usar; con poder de cancelación, perder de
 * vista la pantalla un segundo sería perder la hora. Quien reservó sin cuenta cancela
 * llamando al club, y el club lo hace desde la agenda del día.
 *
 * Si alguna vez se agrega escritura acá, tiene que ser con una decisión explícita
 * detrás. El test `no acepta escritura, ni siquiera con el token correcto` está para
 * que ese cambio no pase de contrabando.
 */
@Controller('reservas')
export class ReservaPublicaController {
  constructor(private readonly servicio: ReservaPublicaService) {}

  @Get('publica/:token')
  publica(@Param('token') token: string): Promise<ReservaPublica> {
    // Se filtra por forma antes de ir a la base: un token con otra pinta es un
    // enlace roto o alguien probando, y no hay por qué gastarle una consulta.
    if (!/^[\w-]{16,43}$/.test(token)) {
      throw new BadRequestException('Ese enlace no es válido.');
    }

    return this.servicio.porToken(token);
  }
}
