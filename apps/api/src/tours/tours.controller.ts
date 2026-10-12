import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { SoloAdmin } from '../identidad/guards';
import {
  leerCambioDeNivel,
  leerCambioDeTemporada,
  leerCambioDeTour,
  leerNivelNuevo,
  leerTemporadaNueva,
  leerTourNuevo,
} from './tours.dto';
import { Tours } from './tours.service';

/**
 * Los tours y sus temporadas, para el panel (T188).
 *
 * `@SoloAdmin()` en la clase entera, como el resto del panel: alcanza con que a una ruta
 * se le olvide para que cualquiera pueda cambiar cuánto vale ganar un torneo.
 *
 * **Las temporadas se editan por su propio id** (`temporadas/:id`) y no colgadas del
 * tour: un `tours/:tourId/temporadas/:id` obligaría a comprobar el par, y un parámetro
 * que no se comprueba puede mentir. Se crean, eso sí, colgadas de su tour.
 */
@Controller('admin')
@SoloAdmin()
export class ToursAdminController {
  constructor(private readonly tours: Tours) {}

  @Get('tours')
  listar() {
    return this.tours.listar();
  }

  @Post('tours')
  crear(@Body() cuerpo: unknown) {
    return this.tours.crear(leerTourNuevo(cuerpo));
  }

  @Get('tours/:id')
  ficha(@Param('id', ParseIntPipe) id: number) {
    return this.tours.ficha(id);
  }

  @Patch('tours/:id')
  editar(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.tours.editar(id, leerCambioDeTour(cuerpo));
  }

  @Delete('tours/:id')
  borrar(@Param('id', ParseIntPipe) id: number) {
    return this.tours.borrar(id);
  }

  @Post('tours/:id/temporadas')
  crearTemporada(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.tours.crearTemporada(id, leerTemporadaNueva(cuerpo));
  }

  @Patch('temporadas/:id')
  editarTemporada(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.tours.editarTemporada(id, leerCambioDeTemporada(cuerpo));
  }

  @Delete('temporadas/:id')
  borrarTemporada(@Param('id', ParseIntPipe) id: number) {
    return this.tours.borrarTemporada(id);
  }

  // ── Los niveles de una temporada (T189) ─────────────────────────────────────
  // Como las temporadas: se crean colgados de la suya y se editan por su propio id.

  @Post('temporadas/:id/niveles')
  crearNivel(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.tours.crearNivel(id, leerNivelNuevo(cuerpo));
  }

  @Patch('niveles/:id')
  editarNivel(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.tours.editarNivel(id, leerCambioDeNivel(cuerpo));
  }

  @Delete('niveles/:id')
  borrarNivel(@Param('id', ParseIntPipe) id: number) {
    return this.tours.borrarNivel(id);
  }
}
