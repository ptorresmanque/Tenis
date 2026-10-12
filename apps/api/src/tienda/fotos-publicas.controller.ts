import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import type { Response } from 'express';

import { carpetaDeSubidas } from '../comun/imagenes';
import { FotosDeProductos } from './fotos.service';

/**
 * Las fotos de los productos, sin sesión (T158): las pide el panel y, desde T161, el
 * catálogo público. Bajo `tienda/`, así que el interruptor las cubre: con la tienda
 * apagada, tampoco existen.
 *
 * `ponytail: sirve también la foto de un producto en borrador a quien adivine su número.
 * Es la foto de una zapatilla, no un dato de nadie; si alguna vez importa, se filtra por
 * publicado y se le da al panel su propia ruta.`
 */
@Controller('tienda/fotos')
export class FotosPublicasController {
  constructor(private readonly fotos: FotosDeProductos) {}

  @Get(':id/miniatura')
  async miniatura(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.enviar(id, 'miniatura', res);
  }

  @Get(':id/imagen')
  async imagen(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.enviar(id, 'web', res);
  }

  /**
   * Raíz fijada y ruta sacada de la base, como en las fotos de torneos. Un año de caché:
   * el nombre del archivo es un UUID, así que una dirección nunca cambia de contenido.
   */
  private async enviar(id: number, cual: 'web' | 'miniatura', res: Response) {
    const ruta = await this.fotos.rutaDeLaFoto(id, cual);

    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(ruta, { root: carpetaDeSubidas() });
  }
}
