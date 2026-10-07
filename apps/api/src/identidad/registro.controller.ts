import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { IntentosFallidos, VENTANA_MS } from './intentos';
import { leerCorreo, leerRegistro } from './registro.dto';
import { RegistroService } from './registro.service';

@Controller('auth')
export class RegistroController {
  constructor(
    private readonly servicio: RegistroService,
    /**
     * El contador del login, contando **cada pedido** y no fallos, como el formulario
     * de contacto: acá todos los pedidos "funcionan" y lo que hay que acotar es
     * cuántos correos salen. La llave junta correo e IP, igual que en el login.
     */
    private readonly pedidos: IntentosFallidos,
  ) {}

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

  @Post('reenviar-verificacion')
  async reenviarVerificacion(
    @Body() cuerpo: unknown,
    @Req() req: Request,
  ): Promise<{ mensaje: string }> {
    const email = leerCorreo(cuerpo);
    const llave = `verificacion|${email}|${req.ip ?? 'sin-ip'}`;

    // Se cuenta exista o no la cuenta: si solo contaran los pedidos que mandan un
    // correo, el 429 llegaría antes justo a los correos que tienen cuenta.
    if (this.pedidos.bloqueado(llave)) {
      throw new HttpException(
        `Ya pediste varios enlaces. Espera ${VENTANA_MS / 60_000} minutos y revisa ` +
          'tu correo, también la carpeta de spam.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.pedidos.anotarFallo(llave);

    await this.servicio.pedirEnlaceNuevo(email);

    // La misma respuesta exista o no la cuenta, por lo mismo que en el registro.
    return {
      mensaje:
        'Listo. Si ese correo tiene una cuenta sin verificar, te llega un enlace ' +
        'nuevo. El anterior deja de servir.',
    };
  }

  @Get('verificar')
  async verificar(
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const verificado = token ? await this.servicio.verificar(token) : false;

    // Redirige a la SPA en vez de responder JSON: este enlace lo abre una persona
    // desde su cliente de correo, no un programa. A /verificar-correo y no a
    // /registro, que es solo para quien no tiene sesión: entrar no exige el correo
    // verificado, así que quien abre el enlace puede haber entrado antes.
    const web = process.env.WEB_ORIGIN ?? 'http://localhost:4200';
    res.redirect(`${web}/verificar-correo?verificado=${verificado ? 1 : 0}`);
  }
}
