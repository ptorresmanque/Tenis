import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  borrarCookieDeSesion,
  ponerCookieDeSesion,
  tokenDeSesion,
} from './cookie';
import { IntentosFallidos } from '../intentos';
import { SesionService } from './sesion.service';

/** Lo que el cliente manda como credenciales, sin confiar en su forma. */
function credenciales(cuerpo: unknown): { email: string; contrasena: string } {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    email:
      typeof datos.email === 'string' ? datos.email.trim().toLowerCase() : '',
    contrasena: typeof datos.contrasena === 'string' ? datos.contrasena : '',
  };
}

@Controller('auth')
export class SesionController {
  constructor(
    private readonly servicio: SesionService,
    /**
     * El freno se aplica en el controlador porque necesita la IP, que es cosa del
     * transporte: `SesionService` sigue sin saber que existe HTTP. Y se inyecta en vez
     * de instanciarse acá para que su estado no dependa de que Nest mantenga este
     * controlador como singleton, y para poder compartirlo el día que el registro
     * también lo necesite.
     */
    private readonly intentos: IntentosFallidos,
  ) {}

  @Post('login')
  @HttpCode(204)
  async login(
    @Body() cuerpo: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { email, contrasena } = credenciales(cuerpo);
    const llave = `${email}|${req.ip ?? 'sin-ip'}`;

    if (this.intentos.bloqueado(llave)) {
      // 429 y no 401: quien se equivocó de verdad tiene que poder distinguir "me
      // equivoqué" de "espera un rato", o va a seguir intentando y alargando el
      // bloqueo. El mensaje dice cuánto esperar.
      throw new HttpException(
        'Demasiados intentos con esa cuenta. Espera quince minutos y vuelve a ' +
          'probar, o pide ayuda en el club.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const token = await this.servicio.iniciar(email, contrasena);

    if (!token) {
      this.intentos.anotarFallo(llave);

      // Un solo mensaje para credenciales malas y correo inexistente. Cualquier
      // diferencia acá es una lista de socios servida a quien quiera probar.
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    this.intentos.perdonar(llave);
    ponerCookieDeSesion(res, token);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = tokenDeSesion(req);
    if (token) {
      await this.servicio.cerrar(token);
    }

    borrarCookieDeSesion(res);
  }
}
