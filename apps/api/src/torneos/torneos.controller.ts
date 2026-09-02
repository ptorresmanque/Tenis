import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import type { Response } from 'express';

import { carpetaDeSubidas, MAXIMO_BYTES } from '../comun/imagenes';
import { SoloAdmin } from '../identidad/guards';
import { ComprobantesDeInscripcion } from './comprobantes.service';
import { leerFoto } from './fotos.dto';
import { FotosDelTorneo } from './fotos.service';
import { leerProgramacion } from './programacion.dto';
import { ProgramacionDePartidos } from './programacion.service';
import { leerTransmision } from './transmisiones.dto';
import { Transmisiones } from './transmisiones.service';
import {
  leerCambioDeCuadro,
  leerCuadroNuevo,
} from './categorias-del-torneo.dto';
import { CategoriasDelTorneo } from './categorias-del-torneo.service';
import {
  leerCambioDeCategoriaDeJuego,
  leerCategoriaDeJuego,
} from './categorias-juego.dto';
import { CategoriasDeJuego } from './categorias-juego.service';
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
    private readonly categoriasDeJuego: CategoriasDeJuego,
    private readonly cuadrosDelTorneo: CategoriasDelTorneo,
    private readonly inscripciones: InscripcionesATorneo,
    private readonly cuadro: CuadroDelTorneo,
    private readonly resultados: ResultadosDelCuadro,
    private readonly comprobantes: ComprobantesDeInscripcion,
    private readonly programacion: ProgramacionDePartidos,
    private readonly transmisiones: Transmisiones,
    private readonly fotos: FotosDelTorneo,
  ) {}

  // ── Los pagos de inscripción que esperan que alguien los mire ──────────────

  /** La bandeja: quién pagó y el club todavía no confirmó. */
  @Get('inscripciones/pendientes')
  pagosPendientes() {
    return this.comprobantes.pendientes();
  }

  /**
   * El comprobante de transferencia, servido.
   *
   * **Detrás del guard de admin**, al revés que las fotos del torneo: lleva el nombre,
   * el banco y el número de cuenta de una persona. Dos carpetas con dos reglas, no una
   * carpeta con una excepción.
   */
  @Get('inscripciones/:id/comprobante')
  async verComprobante(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const ruta = await this.comprobantes.rutaDelComprobante(id);

    // `sendFile` con la raíz fijada: la ruta viene de la base y no del cliente, pero
    // acotar la raíz es lo que hace que un valor mal escrito no pueda leer fuera de la
    // carpeta de subidas.
    res.sendFile(ruta, { root: carpetaDeSubidas() });
  }

  @Post('inscripciones/:id/aprobar')
  @HttpCode(200)
  aprobarPago(@Param('id', ParseIntPipe) id: number) {
    return this.comprobantes.aprobar(id);
  }

  /** Rechazar libera el cupo: ver el servicio. El motivo lo lee quien llama. */
  @Post('inscripciones/:id/rechazar')
  @HttpCode(200)
  rechazarPago(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    const datos = (cuerpo ?? {}) as Record<string, unknown>;
    const motivo =
      typeof datos.motivo === 'string' ? datos.motivo.trim().slice(0, 200) : '';

    if (motivo.length < 3) {
      throw new BadRequestException(
        'Escribe por qué lo rechazas: es lo que el club le va a decir por teléfono.',
      );
    }

    return this.comprobantes.rechazar(id, motivo);
  }

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

  /**
   * Las categorías con que juega el club: 5ª, 4ª, … Honor.
   *
   * **Otra ruta y otro servicio que `categorias-torneo`**, que está justo arriba y es
   * el nivel del torneo del que salen los puntos del ranking. Ver `SPEC-torneos.md`
   * § Las dos categorías que no son la misma.
   */
  @Get('categorias-juego')
  listarCategoriasDeJuego(@Query('activas') activas = '') {
    return this.categoriasDeJuego.listar(activas === '1');
  }

  @Post('categorias-juego')
  crearCategoriaDeJuego(@Body() cuerpo: unknown) {
    return this.categoriasDeJuego.crear(leerCategoriaDeJuego(cuerpo));
  }

  /** Renombrar, reordenar o desactivar. Desactivar **no** borra: ver el servicio. */
  @Patch('categorias-juego/:id')
  editarCategoriaDeJuego(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.categoriasDeJuego.editar(
      id,
      leerCambioDeCategoriaDeJuego(cuerpo),
    );
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

  /**
   * Qué categorías corre este torneo, de la más baja a la más alta.
   *
   * **Distinto de `categorias-juego`**, que es el catálogo del club. Esto es qué
   * cuadros arma **este** torneo y con cuántos jugadores cada uno.
   */
  @Get('torneos/:id/categorias')
  listarCuadros(@Param('id', ParseIntPipe) id: number) {
    return this.cuadrosDelTorneo.listar(id);
  }

  @Post('torneos/:id/categorias')
  agregarCuadro(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.cuadrosDelTorneo.agregar(id, leerCuadroNuevo(cuerpo));
  }

  /** El cupo y el monto. **La categoría no se cambia**: ver el lector del cambio. */
  @Patch('torneos/:torneoId/categorias/:id')
  editarCuadro(
    @Param('torneoId', ParseIntPipe) torneoId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.cuadrosDelTorneo.editar(
      torneoId,
      id,
      leerCambioDeCuadro(cuerpo),
    );
  }

  /** Solo si no hay nadie inscrito ni ningún partido: ver el servicio. */
  @Delete('torneos/:torneoId/categorias/:id')
  quitarCuadro(
    @Param('torneoId', ParseIntPipe) torneoId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.cuadrosDelTorneo.quitar(torneoId, id);
  }

  // ── Todo lo que sigue cuelga de un cuadro y no del torneo ──────────────────
  //
  // **Las rutas cambiaron de eje en T62 y no es cosmético.** "Los inscritos del
  // torneo" y "el cuadro del torneo" dejaron de significar algo: un torneo corre 4ª,
  // 3ª y Honor a la vez, cada uno con su cupo, su lista de espera y su sorteo.
  //
  // **La ruta es `cuadros/:id` y no `torneos/:torneoId/categorias/:id`.** La segunda
  // se lee mejor —el torneo queda a la vista, que es como piensa el club— pero el
  // servidor no usaría ese `torneoId` para nada, y un parámetro que no se valida es un
  // parámetro que puede mentir: `torneos/5/categorias/9` actuaría sobre el cuadro 9
  // aunque sea del torneo 7. O se comprueba el par, o no se pide. Donde sí se pide
  // —`torneos/:id/categorias`, más arriba— el par se comprueba de verdad.

  /** Quién juega **este cuadro**, en tres grupos: dentro, esperando y retirados. */
  @Get('cuadros/:id/inscripciones')
  lista(@Param('id', ParseIntPipe) id: number) {
    return this.inscripciones.lista(id);
  }

  /** Pasado el cupo, el servidor deja al jugador en espera en vez de rechazarlo. */
  @Post('cuadros/:id/inscripciones')
  inscribir(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.inscripciones.inscribir(id, leerInscripcionATorneo(cuerpo));
  }

  /** Bajar a alguien. El primero de la espera **no** entra solo: ver `promover`. */
  @Post('cuadros/:cuadroId/inscripciones/:id/retiro')
  @HttpCode(200)
  retirar(
    @Param('cuadroId', ParseIntPipe) cuadroId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inscripciones.retirar(cuadroId, id);
  }

  /**
   * La siembra la pone el admin, no el ranking: es lo que hace hoy.
   *
   * **Es por cuadro**: hay un sembrado 1 de 4ª y un sembrado 1 de Honor.
   */
  @Patch('cuadros/:cuadroId/inscripciones/:id/siembra')
  sembrar(
    @Param('cuadroId', ParseIntPipe) cuadroId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.inscripciones.sembrar(cuadroId, id, leerSiembra(cuerpo));
  }

  /** Meter en el cuadro al que estaba esperando. Manual a propósito. */
  @Post('cuadros/:cuadroId/inscripciones/:id/promocion')
  @HttpCode(200)
  promover(
    @Param('cuadroId', ParseIntPipe) cuadroId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.inscripciones.promover(cuadroId, id);
  }

  /** El cuadro entero de una categoría, con todos sus partidos. */
  @Get('cuadros/:id')
  verCuadro(@Param('id', ParseIntPipe) id: number) {
    return this.cuadro.leer(id);
  }

  /** Armar **este** cuadro. Armar Honor no toca la 4ª: cada uno con su semilla. */
  @Post('cuadros/:id/armar')
  armarCuadro(@Param('id', ParseIntPipe) id: number) {
    return this.cuadro.armar(id);
  }

  /**
   * Deshacer **este** cuadro y devolverlo a inscripción.
   *
   * Solo mientras no haya resultados: rearmar con partidos jugados es rehacer la
   * historia de alguien que ganó de verdad. Los otros cuadros no se tocan.
   */
  @Post('cuadros/:id/deshacer')
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

  /**
   * Programa un partido en una cancha y a una hora.
   *
   * **Escribe un `Bloqueo` con motivo `TORNEO`**, así que la cancha desaparece sola de
   * la disponibilidad: `torneos` no le habla a `reservas`. Rechaza por cuatro razones
   * y el mensaje dice cuál — ver `programacion.service.ts`.
   */
  @Post('torneos/:torneoId/partidos/:id/programacion')
  @HttpCode(200)
  programar(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.programacion.programar(id, leerProgramacion(cuerpo));
  }

  /** Le quita la hora y **libera la cancha**. */
  @Delete('torneos/:torneoId/partidos/:id/programacion')
  desprogramar(@Param('id', ParseIntPipe) id: number) {
    return this.programacion.desprogramar(id);
  }

  // ── Las transmisiones del torneo ──────────────────────────────────────────

  @Get('torneos/:id/transmisiones')
  listarTransmisiones(@Param('id', ParseIntPipe) id: number) {
    return this.transmisiones.listar(id);
  }

  /**
   * Anuncia un live de una cancha durante una jornada.
   *
   * **Del enlace que pega el admin solo sobrevive el id**, y la URL del reproductor la
   * arma el servidor: ese valor termina dentro del `src` de un `iframe`.
   */
  @Post('torneos/:id/transmisiones')
  crearTransmision(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    return this.transmisiones.crear(id, leerTransmision(cuerpo));
  }

  @Delete('torneos/:torneoId/transmisiones/:id')
  quitarTransmision(
    @Param('torneoId', ParseIntPipe) torneoId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.transmisiones.quitar(torneoId, id);
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

  // ── Las fotos del torneo ────────────────────────────────────────────────────

  /**
   * Sube una foto al torneo.
   *
   * Los tres usos que pidió el club —general de antes, general de durante, y la de un
   * partido— son este único endpoint con dos campos. La imagen se reencodifica y **se
   * le quitan los metadatos** antes de tocar el disco: una foto de celular lleva las
   * coordenadas de dónde se tomó.
   */
  @Post('torneos/:id/fotos')
  @UseInterceptors(
    FileInterceptor('foto', { limits: { fileSize: MAXIMO_BYTES } }),
  )
  subirFoto(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @UploadedFile() archivo?: { buffer: Buffer },
  ) {
    if (!archivo) throw new BadRequestException('Adjunta la foto.');

    return this.fotos.subir(id, leerFoto(cuerpo), archivo.buffer);
  }

  @Delete('torneos/:torneoId/fotos/:id')
  quitarFoto(
    @Param('torneoId', ParseIntPipe) torneoId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.fotos.quitar(torneoId, id);
  }
}
