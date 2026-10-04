import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';

import { leerDuracion } from './duracion';
import { ModificacionService } from './modificacion.service';
import {
  ReservaPublica,
  ReservaPublicaService,
} from './reserva-publica.service';
import { destinoDeCuerpo, fechaDeConsulta } from './reservas.dto';

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
  constructor(
    private readonly servicio: ReservaPublicaService,
    private readonly modificacion: ModificacionService,
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
