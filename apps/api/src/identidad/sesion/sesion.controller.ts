import {
  Body,
  Controller,
  HttpCode,
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
  constructor(private readonly servicio: SesionService) {}

  @Post('login')
  @HttpCode(204)
  async login(
    @Body() cuerpo: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { email, contrasena } = credenciales(cuerpo);
    const token = await this.servicio.iniciar(email, contrasena);

    if (!token) {
      // Un solo mensaje para credenciales malas y correo inexistente. Cualquier
      // diferencia acá es una lista de socios servida a quien quiera probar.
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

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
