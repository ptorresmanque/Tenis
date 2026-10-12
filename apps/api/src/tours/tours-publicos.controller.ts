import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import type { Response } from 'express';

import { carpetaDeSubidas } from '../comun/imagenes';
import { ImagenesDelTour } from './imagenes-del-tour.service';

/**
 * Lo público de los tours, sin sesión: por ahora sus imágenes (T190). La lista y la
 * ficha públicas llegan en T194.
 */
@Controller('tours')
export class ToursPublicosController {
  constructor(private readonly imagenes: ImagenesDelTour) {}

  /**
   * La imagen representativa. **Se revalida y no queda un año en caché**, al revés que
   * las fotos: su dirección es la del tour y no cambia al reemplazarla, así que con
   * `immutable` el navegador seguiría mostrando la anterior. `sendFile` pone el `ETag`, y
   * revalidar una que no cambió cuesta un 304.
   */
  @Get(':id/imagen')
  async imagen(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    this.enviar(await this.imagenes.rutaDeImagen(id, 'web'), 'no-cache', res);
  }

  @Get(':id/miniatura')
  async miniatura(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    this.enviar(
      await this.imagenes.rutaDeImagen(id, 'miniatura'),
      'no-cache',
      res,
    );
  }

  /** Una foto de la galería: su dirección es de esa foto y nunca cambia de contenido. */
  @Get('fotos/:id/imagen')
  async foto(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    this.enviar(await this.imagenes.rutaDeFoto(id, 'web'), 'inmutable', res);
  }

  @Get('fotos/:id/miniatura')
  async miniaturaDeFoto(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    this.enviar(
      await this.imagenes.rutaDeFoto(id, 'miniatura'),
      'inmutable',
      res,
    );
  }

  /** La raíz fijada y la ruta sacada de la base, como las fotos de los torneos. */
  private enviar(
    ruta: string,
    cache: 'no-cache' | 'inmutable',
    res: Response,
  ): void {
    res.set(
      'Cache-Control',
      cache === 'inmutable'
        ? 'public, max-age=31536000, immutable'
        : 'public, no-cache',
    );
    res.sendFile(ruta, { root: carpetaDeSubidas() });
  }
}
