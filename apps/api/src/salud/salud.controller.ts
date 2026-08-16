import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';

import { EstadoSalud, SaludService } from './salud.service';

@Controller('salud')
export class SaludController {
  constructor(private readonly servicio: SaludService) {}

  @Get()
  async salud(@Res({ passthrough: true }) res: Response): Promise<EstadoSalud> {
    const estado = await this.servicio.estado();

    // 503 y no 200: un chequeo de salud que responde OK con la base caída no sirve
    // para nada, porque nadie se entera hasta que un usuario ve el error.
    res.status(
      estado.baseDatos.conectado
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return estado;
  }
}
