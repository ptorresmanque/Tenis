import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { SoloAdmin } from '../identidad/guards';
import { Clases } from './clases.service';
import { leerCancelacion, leerClaseNueva, leerMovimiento } from './clases.dto';

/**
 * Las clases del club.
 *
 * `@SoloAdmin()` sobre el controlador entero: **el admin agenda las clases**, que es
 * la pregunta 12 del spec. El profesor tiene ficha y aparece en la agenda, pero no
 * entra a tomar horas, así que este módulo no agrega ni un permiso nuevo.
 *
 * Lo que el visitante ve de las clases es otra pantalla y otro endpoint (T48).
 */
@Controller('admin/clases')
@SoloAdmin()
export class ClasesController {
  constructor(private readonly clases: Clases) {}

  @Get()
  delDia(@Query('fecha') fecha = '') {
    return this.clases.delDia(fecha);
  }

  /**
   * A quién le quitaría la hora, sin escribir nada.
   *
   * Es lo que hace que cancelarle la hora a un socio no sea un descuido: el admin ve
   * la lista antes de confirmar, y ahí decide si mueve la clase o lo llama.
   */
  @Post('simulacion')
  @HttpCode(200)
  async simular(@Body() cuerpo: unknown) {
    return { afectadas: await this.clases.afectadas(leerClaseNueva(cuerpo)) };
  }

  @Post()
  agendar(@Body() cuerpo: unknown) {
    return this.clases.agendar(leerClaseNueva(cuerpo));
  }

  /** Mover la clase. Conserva su id, su profesor y sus inscritos. */
  @Patch(':id')
  mover(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.clases.mover(id, leerMovimiento(cuerpo));
  }

  /**
   * Cancelar.
   *
   * Ruta propia y no un campo del `PATCH`: mover y cancelar son decisiones opuestas
   * —una la deja en pie en otra hora, la otra la borra de la agenda—, y aceptarlas en
   * el mismo cuerpo obligaría a elegir una en silencio cuando lleguen las dos.
   */
  @Post(':id/cancelacion')
  @HttpCode(200)
  cancelar(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.clases.cancelar(id, leerCancelacion(cuerpo));
  }
}
