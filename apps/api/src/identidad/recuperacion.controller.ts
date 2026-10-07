import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { IntentosFallidos, VENTANA_MS } from './intentos';
import { RecuperacionService } from './recuperacion.service';
import { leerCorreo } from './registro.dto';

@Controller('auth')
export class RecuperacionController {
  constructor(
    private readonly servicio: RecuperacionService,
    /**
     * Cuenta cada pedido, como el reenvío de la verificación: lo que hay que acotar
     * es cuántos correos salen. La llave junta correo e IP, como en el login.
     */
    private readonly pedidos: IntentosFallidos,
  ) {}

  @Post('recuperar')
  async recuperar(
    @Body() cuerpo: unknown,
    @Req() req: Request,
  ): Promise<{ mensaje: string }> {
    const email = leerCorreo(cuerpo);
    const llave = `recuperacion|${email}|${req.ip ?? 'sin-ip'}`;

    // Se cuenta exista o no la cuenta: si solo contaran los que mandan un correo,
    // el 429 llegaría antes justo a los correos que tienen cuenta.
    this.pedidos.contarPedido(
      llave,
      `Ya pediste varios enlaces. Espera ${VENTANA_MS / 60_000} minutos y revisa ` +
        'tu correo, también la carpeta de spam.',
    );

    await this.servicio.pedir(email);

    // La misma respuesta exista o no la cuenta.
    return {
      mensaje:
        'Listo. Si ese correo tiene una cuenta, te llega un enlace para elegir una ' +
        'contraseña nueva. Vence en una hora.',
    };
  }

  /**
   * Sin freno propio: el token son 256 bits de azar, y probarlos a ciegas no termina
   * nunca. La contraseña se toma tal cual llega, como en el registro.
   */
  @Post('restablecer')
  @HttpCode(204)
  async restablecer(@Body() cuerpo: unknown): Promise<void> {
    const datos = (cuerpo ?? {}) as Record<string, unknown>;
    const token = typeof datos.token === 'string' ? datos.token : '';
    const contrasena =
      typeof datos.contrasena === 'string' ? datos.contrasena : '';

    if (!token || !(await this.servicio.restablecer(token, contrasena))) {
      throw new BadRequestException(
        'Ese enlace no sirve: puede haber vencido o ya haberse usado. Pide uno nuevo.',
      );
    }
  }
}
