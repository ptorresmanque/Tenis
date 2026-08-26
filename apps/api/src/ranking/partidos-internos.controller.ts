import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';

import { EstadoPartidoInterno } from '../generated/prisma/client';
import { Autenticado, SoloAdmin, SoloSocio, Yo } from '../identidad/guards';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { leerPartidoInterno, leerResolucion } from './partidos-internos.dto';
import { PartidosInternos } from './partidos-internos.service';

/**
 * Los partidos amistosos, para los socios.
 *
 * **Quien carga sale de la sesión y nunca del cuerpo.** Es lo que impide cargar
 * partidos a nombre de otro, que sería la forma más simple de romper la confirmación.
 */
@Controller('partidos-internos')
export class PartidosInternosController {
  constructor(private readonly partidos: PartidosInternos) {}

  /**
   * `@Autenticado()` y no `@SoloSocio()`: quien todavía no tiene ficha recibe una
   * lista vacía, que es la verdad, y no un 403 que se lee como que el sistema está
   * roto. Es el mismo criterio que `GET /api/cuotas/mias`.
   */
  @Get('mios')
  @Autenticado()
  mios(@Yo() yo: UsuarioActual) {
    return this.partidos.mios(yo);
  }

  /** Contra quién puedo cargar un partido: nombre y número de socio, nada más. */
  @Get('rivales')
  @Autenticado()
  rivales(@Yo() yo: UsuarioActual) {
    return this.partidos.rivales(yo);
  }

  /** Acá sí `@SoloSocio()`: cargar un partido sin ficha no es una lista vacía. */
  @Post()
  @SoloSocio()
  cargar(@Yo() yo: UsuarioActual, @Body() cuerpo: unknown) {
    return this.partidos.cargar(yo, leerPartidoInterno(cuerpo));
  }

  @Post(':id/confirmacion')
  @HttpCode(200)
  @SoloSocio()
  confirmar(@Yo() yo: UsuarioActual, @Param('id', ParseIntPipe) id: number) {
    return this.partidos.confirmar(yo, id);
  }

  @Post(':id/rechazo')
  @HttpCode(200)
  @SoloSocio()
  rechazar(@Yo() yo: UsuarioActual, @Param('id', ParseIntPipe) id: number) {
    return this.partidos.rechazar(yo, id);
  }
}

/** La salida de emergencia: el club resuelve lo que dos socios no arreglaron. */
@Controller('admin/partidos-internos')
export class PartidosInternosDelAdminController {
  constructor(private readonly partidos: PartidosInternos) {}

  @Get()
  @SoloAdmin()
  lista(@Query('estado') estado?: string) {
    const pedido = Object.values(EstadoPartidoInterno).find(
      (valor) => valor === estado,
    );

    return this.partidos.paraElClub(pedido);
  }

  @Post(':id/resolucion')
  @HttpCode(200)
  @SoloAdmin()
  resolver(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: unknown) {
    return this.partidos.resolver(id, leerResolucion(cuerpo));
  }
}
