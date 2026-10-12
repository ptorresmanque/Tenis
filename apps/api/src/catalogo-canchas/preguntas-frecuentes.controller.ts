import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { SoloAdmin } from '../identidad/guards';
import {
  leerCambioDePreguntaFrecuente,
  leerPreguntaFrecuente,
} from './preguntas-frecuentes.dto';
import { PreguntasFrecuentes } from './preguntas-frecuentes.service';

/** Las preguntas frecuentes para cualquiera, en el orden del club (T144). */
@Controller('preguntas-frecuentes')
export class PreguntasFrecuentesPublicasController {
  constructor(private readonly preguntas: PreguntasFrecuentes) {}

  @Get()
  listar() {
    return this.preguntas.listarPublicas();
  }
}

/**
 * Las mismas, para el panel. `@SoloAdmin()` va en la clase entera, como en el resto del
 * panel: alcanza con que a una ruta se le olvide para que cualquiera pueda escribir en
 * el sitio del club.
 */
@Controller('admin/preguntas-frecuentes')
@SoloAdmin()
export class PreguntasFrecuentesAdminController {
  constructor(private readonly preguntas: PreguntasFrecuentes) {}

  @Get()
  listar() {
    return this.preguntas.listar();
  }

  @Post()
  crear(@Body() cuerpo: unknown) {
    return this.preguntas.crear(leerPreguntaFrecuente(cuerpo));
  }

  @Patch(':id')
  editar(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.preguntas.editar(id, leerCambioDePreguntaFrecuente(cuerpo));
  }

  @Delete(':id')
  @HttpCode(204)
  borrar(@Param('id', ParseIntPipe) id: number) {
    return this.preguntas.borrar(id);
  }
}
