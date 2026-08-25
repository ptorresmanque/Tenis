import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { SoloAdmin } from '../identidad/guards';
import { Jugadores } from './jugadores.service';
import { Torneos } from './torneos.service';
import {
  leerCambioDeJugador,
  leerCambioDeTorneo,
  leerCategoria,
  leerJugadorNuevo,
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
  editarCategoria(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
  ) {
    const datos = (cuerpo ?? {}) as Record<string, unknown>;

    // Desactivar es lo único que se hace sin tocar el resto: una categoría con
    // torneos jugados no se borra, porque sus puntos ya están repartidos.
    return this.torneos.editarCategoria(
      id,
      datos.activa !== undefined && Object.keys(datos).length === 1
        ? { activa: datos.activa === true }
        : leerCategoria(cuerpo),
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
}
