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
import { Inscripciones } from './inscripciones.service';
import {
  leerAsistencia,
  leerCancelacion,
  leerClaseNueva,
  leerInscripcion,
  leerDecisiones,
  leerMovimiento,
  leerSerie,
} from './clases.dto';

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
  constructor(
    private readonly clases: Clases,
    private readonly inscripciones: Inscripciones,
  ) {}

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

  /**
   * Lo que una serie generaría, fecha por fecha: a quién le quitaría la hora y qué otra
   * cosa ya ocupa la cancha (T113). Sin escribir nada, como la simulación de una clase.
   */
  @Post('series/simulacion')
  @HttpCode(200)
  async simularSerie(@Body() cuerpo: unknown) {
    return { fechas: await this.clases.simularSerie(leerSerie(cuerpo)) };
  }

  /**
   * Inscribe a un socio o a un alumno de afuera en cada clase que viene de la serie (T116).
   * Si alguna está llena, no inscribe en ninguna y dice cuál.
   */
  @Post('series/:id/inscripciones')
  inscribirEnLaSerie(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.inscripciones.inscribirEnLaSerie(id, leerInscripcion(cuerpo));
  }

  /** Lo saca de la serie: cancela solo las clases que vienen, no las que ya pasaron. */
  @Post('series/:id/inscripciones/cancelacion')
  salirDeLaSerie(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.inscripciones.salirDeLaSerie(id, leerInscripcion(cuerpo));
  }

  /**
   * Agenda la serie, con la decisión de cada fecha que tiene algo encima: `cancelar` o
   * `saltar` (T114). Una fecha con choque y sin decisión rechaza la serie entera.
   */
  @Post('series')
  agendarSerie(@Body() cuerpo: unknown) {
    const datos = (cuerpo ?? {}) as Record<string, unknown>;

    return this.clases.agendarSerie(
      leerSerie(cuerpo),
      leerDecisiones(datos.decisiones),
    );
  }

  /**
   * La ficha con su lista de inscritos: lo que el profesor lleva a la cancha.
   *
   * Después de `simulacion` en el archivo, o Nest leería "simulacion" como un id.
   */
  @Get(':id')
  ficha(@Param('id', ParseIntPipe) id: number) {
    return this.inscripciones.ficha(id);
  }

  /** Inscribir a un socio o a un alumno de afuera. El cupo lo decide el servidor. */
  @Post(':id/inscripciones')
  inscribir(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.inscripciones.inscribir(id, leerInscripcion(cuerpo));
  }

  /** Sacar a alguien de la clase. La fila queda, marcada: libera el cupo, no la historia. */
  @Post(':claseId/inscripciones/:id/cancelacion')
  @HttpCode(200)
  bajar(
    @Param('claseId', ParseIntPipe) claseId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inscripciones.cancelar(claseId, id);
  }

  /**
   * Cerrar la clase, con o sin lista.
   *
   * Sin `asistieron` en el cuerpo, la clase queda realizada y nadie cambia de estado:
   * pasar lista es un dato que el club lleva si quiere, no un trámite.
   */
  @Post(':id/realizacion')
  @HttpCode(200)
  realizar(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.inscripciones.realizar(id, leerAsistencia(cuerpo));
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
