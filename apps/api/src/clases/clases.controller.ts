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

import { fechaDeCuerpo } from '../catalogo-canchas/admin.dto';
import { AdminO, Yo } from '../identidad/guards';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { Clases } from './clases.service';
import { Inscripciones } from './inscripciones.service';
import { exigirSuya, Pertenencia } from './pertenencia';
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
 * **El admin y el profesor** (T218, `SPEC-clases.md` § El profesor en el panel): el
 * guard dice quién entra, y `Pertenencia` dice sobre qué. Cada endpoint que recibe una
 * clase, una serie o un profesor lo comprueba **antes de hacer nada**: el admin pasa
 * siempre, y el profesor solo con lo suyo.
 *
 * Lo que el visitante ve de las clases es otra pantalla y otro endpoint (T48).
 */
@Controller('admin/clases')
@AdminO('profesor')
export class ClasesController {
  constructor(
    private readonly clases: Clases,
    private readonly inscripciones: Inscripciones,
    private readonly pertenencia: Pertenencia,
  ) {}

  /**
   * Las clases del día. También para el gestor, que las ve en la agenda junto a las
   * reservas sin tocarlas; al profesor le devuelve solo las suyas.
   */
  @Get()
  @AdminO('gestor', 'profesor')
  delDia(@Query('fecha') fecha = '', @Yo() yo: UsuarioActual) {
    return this.clases.delDia(
      fecha,
      yo.esAdmin || yo.esGestor ? null : yo.profesorId,
    );
  }

  /**
   * Los socios que se pueden inscribir: id, nombre y número, nada más. La pantalla de
   * inscritos elegía de `admin/socios`, que trae correos, teléfonos y deudas de todo el
   * club, y el profesor no necesita nada de eso.
   *
   * Antes de `:id` en el archivo, o Nest leería "socios" como un id.
   */
  @Get('socios')
  socios() {
    return this.inscripciones.sociosParaInscribir();
  }

  /**
   * A quién le quitaría la hora, sin escribir nada.
   *
   * Es lo que hace que cancelarle la hora a un socio no sea un descuido: el admin ve
   * la lista antes de confirmar, y ahí decide si mueve la clase o lo llama.
   */
  @Post('simulacion')
  @HttpCode(200)
  async simular(@Body() cuerpo: unknown, @Yo() yo: UsuarioActual) {
    const clase = leerClaseNueva(cuerpo);
    exigirSuya(clase.profesorId, yo);

    return { afectadas: await this.clases.afectadas(clase) };
  }

  @Post()
  agendar(@Body() cuerpo: unknown, @Yo() yo: UsuarioActual) {
    const clase = leerClaseNueva(cuerpo);
    exigirSuya(clase.profesorId, yo);

    return this.clases.agendar(clase, null, { soloLibre: !yo.esAdmin });
  }

  /**
   * Lo que una serie generaría, fecha por fecha: a quién le quitaría la hora y qué otra
   * cosa ya ocupa la cancha (T113). Sin escribir nada, como la simulación de una clase.
   */
  @Post('series/simulacion')
  @HttpCode(200)
  async simularSerie(@Body() cuerpo: unknown, @Yo() yo: UsuarioActual) {
    const serie = leerSerie(cuerpo);
    exigirSuya(serie.profesorId, yo);

    return { fechas: await this.clases.simularSerie(serie) };
  }

  /**
   * Inscribe a un socio o a un alumno de afuera en cada clase que viene de la serie (T116).
   * Si alguna está llena, no inscribe en ninguna y dice cuál.
   */
  @Post('series/:id/inscripciones')
  async inscribirEnLaSerie(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    await this.pertenencia.deLaSerie(id, yo);

    return this.inscripciones.inscribirEnLaSerie(id, leerInscripcion(cuerpo));
  }

  /**
   * Cancela la serie desde un día en adelante (T117): las horas vuelven a la grilla y las
   * clases anteriores quedan como estaban. El motivo es obligatorio, como en la clase suelta.
   */
  @Post('series/:id/cancelacion')
  async cancelarSerieDesde(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    await this.pertenencia.deLaSerie(id, yo);

    const datos = (cuerpo ?? {}) as Record<string, unknown>;
    const desde = fechaDeCuerpo(datos.desde, 'El día desde el que se cancela')
      .toISOString()
      .slice(0, 10);

    return this.clases.cancelarSerieDesde(id, desde, leerCancelacion(cuerpo));
  }

  /** Lo saca de la serie: cancela solo las clases que vienen, no las que ya pasaron. */
  @Post('series/:id/inscripciones/cancelacion')
  async salirDeLaSerie(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    await this.pertenencia.deLaSerie(id, yo);

    return this.inscripciones.salirDeLaSerie(id, leerInscripcion(cuerpo));
  }

  /**
   * Agenda la serie, con la decisión de cada fecha que tiene algo encima: `cancelar` o
   * `saltar` (T114). Una fecha con choque y sin decisión rechaza la serie entera.
   */
  @Post('series')
  agendarSerie(@Body() cuerpo: unknown, @Yo() yo: UsuarioActual) {
    const datos = (cuerpo ?? {}) as Record<string, unknown>;
    const serie = leerSerie(cuerpo);
    exigirSuya(serie.profesorId, yo);

    return this.clases.agendarSerie(serie, leerDecisiones(datos.decisiones), {
      soloLibre: !yo.esAdmin,
    });
  }

  /**
   * La ficha con su lista de inscritos: lo que el profesor lleva a la cancha.
   *
   * Después de `simulacion` en el archivo, o Nest leería "simulacion" como un id.
   */
  @Get(':id')
  async ficha(@Param('id', ParseIntPipe) id: number, @Yo() yo: UsuarioActual) {
    await this.pertenencia.deLaClase(id, yo);

    return this.inscripciones.ficha(id);
  }

  /** Inscribir a un socio o a un alumno de afuera. El cupo lo decide el servidor. */
  @Post(':id/inscripciones')
  async inscribir(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    await this.pertenencia.deLaClase(id, yo);

    return this.inscripciones.inscribir(id, leerInscripcion(cuerpo));
  }

  /** Sacar a alguien de la clase. La fila queda, marcada: libera el cupo, no la historia. */
  @Post(':claseId/inscripciones/:id/cancelacion')
  @HttpCode(200)
  async bajar(
    @Param('claseId', ParseIntPipe) claseId: number,
    @Param('id', ParseIntPipe) id: number,
    @Yo() yo: UsuarioActual,
  ) {
    await this.pertenencia.deLaClase(claseId, yo);

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
  async realizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    await this.pertenencia.deLaClase(id, yo);

    return this.inscripciones.realizar(id, leerAsistencia(cuerpo));
  }

  /** Mover la clase. Conserva su id, su profesor y sus inscritos. */
  @Patch(':id')
  async mover(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    await this.pertenencia.deLaClase(id, yo);

    return this.clases.mover(id, leerMovimiento(cuerpo), {
      soloLibre: !yo.esAdmin,
    });
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
  async cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    await this.pertenencia.deLaClase(id, yo);

    return this.clases.cancelar(id, leerCancelacion(cuerpo));
  }
}
