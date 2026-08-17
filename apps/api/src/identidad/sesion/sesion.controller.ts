import {
  Body,
  Controller,
  Get,
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

  /**
   * Quién está mirando. Devuelve lo mínimo para que la SPA sepa si hay sesión;
   * T8 lo reemplaza por `GET /api/yo` con el contrato `UsuarioActual` completo.
   */
  @Get('sesion')
  async sesion(
    @Req() req: Request,
  ): Promise<{ id: number; nombre: string; email: string }> {
    const token = tokenDeSesion(req);
    const usuario = token ? await this.servicio.usuarioDe(token) : null;

    if (!usuario) {
      throw new UnauthorizedException('No hay sesión abierta.');
    }

    return { id: usuario.id, nombre: usuario.nombre, email: usuario.email };
  }
}
