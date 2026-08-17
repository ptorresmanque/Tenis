import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { leerRegistro } from './registro.dto';
import { RegistroService } from './registro.service';

@Controller('auth')
export class RegistroController {
  constructor(private readonly servicio: RegistroService) {}

  @Post('registro')
  async registro(@Body() cuerpo: unknown): Promise<{ mensaje: string }> {
    await this.servicio.registrar(leerRegistro(cuerpo));

    // La misma respuesta exista o no el correo. Un "ese correo ya está registrado"
    // le dice a cualquiera quién es socio del club con solo probar direcciones.
    return {
      mensaje:
        'Listo. Si el correo no estaba registrado, te llega un enlace para verificarlo.',
    };
  }

  @Get('verificar')
  async verificar(
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const verificado = token ? await this.servicio.verificar(token) : false;

    // Redirige a la SPA en vez de responder JSON: este enlace lo abre una persona
    // desde su cliente de correo, no un programa.
    const web = process.env.WEB_ORIGIN ?? 'http://localhost:4200';
    res.redirect(`${web}/registro?verificado=${verificado ? 1 : 0}`);
  }
}
