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
import { CuadroDelTorneo } from './cuadro.service';
import { InscripcionesATorneo } from './inscripciones.service';
import { ResultadosDelCuadro } from './resultados.service';
import { Jugadores } from './jugadores.service';
import { Torneos } from './torneos.service';
import {
  leerCambioDeCategoria,
  leerCambioDeJugador,
  leerCambioDeTorneo,
  leerCategoria,
  leerInscripcionATorneo,
  leerJugadorNuevo,
  leerResultado,
  leerSiembra,
  leerTorneo,
} from './torneos.dto';

/**
 * Los torneos del club: quiénes juegan, con qué categorías y qué torneos hay.
 *
 * `@SoloAdmin()`: el club arma los torneos. Lo que el visitante ve de ellos —el cuadro
 * y los resultados— es otra pantalla y otro endpoint.
 */
@Controller('admin')
@SoloAdmin()
export class TorneosController {
  constructor(
    private readonly jugadores: Jugadores,
    private readonly torneos: Torneos,
    private readonly inscripciones: InscripcionesATorneo,
    private readonly cuadro: CuadroDelTorneo,
    private readonly resultados: ResultadosDelCuadro,
  ) {}

  @Get('jugadores')
  listarJugadores(@Query('activos') activos = '') {
    return this.jugadores.listar(activos === '1');
  }

  /**
   * Anota a un jugador.
   *
   * Con `socioId` **reutiliza** el suyo si ya existe: el mismo socio en dos torneos es
   * un solo jugador, o el ranking sumaría sus puntos en dos filas.
   */
  @Post('jugadores')
  crearJugador(@Body() cuerpo: unknown) {
    const datos = leerJugadorNuevo(cuerpo);

    return 'nombre' in datos
      ? this.jugadores.crear(datos)
      : this.jugadores.deSocio(datos.socioId);
  }

  /** Editar, desactivar, o enlazar a una ficha de socio. */
  @Patch('jugadores/:id')
  editarJugador(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.jugadores.editar(id, leerCambioDeJugador(cuerpo));
  }

  @Get('categorias-torneo')
  listarCategorias(@Query('activas') activas = '') {
    return this.torneos.categorias(activas === '1');
  }

  @Post('categorias-torneo')
  crearCategoria(@Body() cuerpo: unknown) {
    return this.torneos.crearCategoria(leerCategoria(cuerpo));
  }

  @Patch('categorias-torneo/:id')
  /**
   * Editar o desactivar.
   *
   * Una categoría con torneos jugados **no se borra**: sus puntos ya están repartidos
   * y la tabla del ranking los sigue contando.
   */
  editarCategoria(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.torneos.editarCategoria(id, leerCambioDeCategoria(cuerpo));
  }

  @Get('torneos')
  listarTorneos() {
    return this.torneos.listar();
  }

  @Post('torneos')
  crearTorneo(@Body() cuerpo: unknown) {
    return this.torneos.crear(leerTorneo(cuerpo));
  }

  @Patch('torneos/:id')
  editarTorneo(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.torneos.editar(id, leerCambioDeTorneo(cuerpo));
  }

  /** Quién juega el torneo, en tres grupos: en el cuadro, esperando y retirados. */
  @Get('torneos/:id/inscripciones')
  lista(@Param('id', ParseIntPipe) id: number) {
    return this.inscripciones.lista(id);
  }

  /** Pasado el cupo, el servidor deja al jugador en espera en vez de rechazarlo. */
  @Post('torneos/:id/inscripciones')
  inscribir(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.inscripciones.inscribir(id, leerInscripcionATorneo(cuerpo));
  }

  /** Bajar a alguien. El primero de la espera **no** entra solo: ver `promover`. */
  @Post('torneos/:torneoId/inscripciones/:id/retiro')
  @HttpCode(200)
  retirar(
    @Param('torneoId', ParseIntPipe) torneoId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inscripciones.retirar(torneoId, id);
  }

  /** La siembra la pone el admin, no el ranking: es lo que hace hoy. */
  @Patch('torneos/:torneoId/inscripciones/:id/siembra')
  sembrar(
    @Param('torneoId', ParseIntPipe) torneoId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.inscripciones.sembrar(torneoId, id, leerSiembra(cuerpo));
  }

  /** El cuadro entero, con todos los partidos de todas las rondas. */
  @Get('torneos/:id/cuadro')
  verCuadro(@Param('id', ParseIntPipe) id: number) {
    return this.cuadro.leer(id);
  }

  /** Armar cierra la inscripción y sortea a los no sembrados con semilla guardada. */
  @Post('torneos/:id/cuadro')
  armarCuadro(@Param('id', ParseIntPipe) id: number) {
    return this.cuadro.armar(id);
  }

  /**
   * Deshacer el cuadro y volver a inscripción.
   *
   * Solo mientras no haya resultados: rearmar con partidos jugados es rehacer la
   * historia de alguien que ganó de verdad.
   */
  @Post('torneos/:id/cuadro/deshacer')
  @HttpCode(200)
  deshacerCuadro(@Param('id', ParseIntPipe) id: number) {
    return this.cuadro.deshacer(id);
  }

  /**
   * Cuántos partidos se deshacen si se corrige este resultado.
   *
   * Se consulta **antes** de corregir: cambiar al ganador de semifinales borra la
   * final que ya se jugó, y eso el admin tiene que verlo escrito antes de apretar.
   */
  @Get('torneos/:torneoId/partidos/:id/consecuencias')
  consecuencias(
    @Param('torneoId', ParseIntPipe) torneoId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.resultados.consecuencias(torneoId, id);
  }

  /** Cargar el resultado avanza al ganador al partido y al lado que le tocan. */
  @Post('torneos/:torneoId/partidos/:id/resultado')
  @HttpCode(200)
  cargarResultado(
    @Param('torneoId', ParseIntPipe) torneoId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.resultados.cargar(torneoId, id, leerResultado(cuerpo));
  }

  /**
   * Meter en el cuadro al que estaba esperando.
   *
   * Es manual a propósito: el club llama por teléfono antes, porque quien quedó fuera
   * hace dos semanas ya hizo otros planes.
   */
  @Post('torneos/:torneoId/inscripciones/:id/promocion')
  @HttpCode(200)
  promover(
    @Param('torneoId', ParseIntPipe) torneoId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inscripciones.promover(torneoId, id);
  }
}
