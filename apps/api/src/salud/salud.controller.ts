import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';

import { SoloAdmin } from '../identidad/guards';
import { EstadoSalud, SaludService } from './salud.service';

@Controller('salud')
export class SaludController {
  constructor(private readonly servicio: SaludService) {}

  /**
   * Público a propósito: un healthcheck de despliegue no tiene sesión, y esta ruta
   * es la que decide si la instancia sigue en el balanceador.
   *
   * Devuelve **si el club está sano y nada más**. Con qué motor corre y en qué
   * versión no le sirve a quien mira desde afuera, y sí a quien busca un motor sin
   * parchar: eso se fue a `/detalle`.
   */
  @Get()
  async salud(
    @Res({ passthrough: true }) res: Response,
  ): Promise<Pick<EstadoSalud, 'estado'>> {
    const { estado } = await this.responder(res);

    return { estado };
  }

  /** Lo que muestra la pantalla de estado, que es del admin. */
  @Get('detalle')
  @SoloAdmin()
  detalle(@Res({ passthrough: true }) res: Response): Promise<EstadoSalud> {
    return this.responder(res);
  }

  private async responder(res: Response): Promise<EstadoSalud> {
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
