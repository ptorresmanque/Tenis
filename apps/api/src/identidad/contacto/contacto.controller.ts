import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { SoloAdmin, Yo } from '../guards';
import { IntentosFallidos, VENTANA_MS } from '../intentos';
import type { UsuarioActual } from '../usuario-actual';
import { leerFiltros, leerResolucion, leerSolicitud } from './contacto.dto';
import { ContactoService } from './contacto.service';

/**
 * El formulario del sitio: la única puerta de entrada sin cuenta de este módulo.
 *
 * Pedir registro para preguntar cómo asociarse es justo la barrera que la
 * problemática 2.5 describe. Por eso no lleva guardia — y por eso lleva freno.
 */
@Controller('contacto')
export class ContactoPublicoController {
  constructor(
    private readonly servicio: ContactoService,
    /**
     * El mismo contador que frena el login, con una diferencia que conviene decir:
     * allá se anotan **fallos** y acá se anota **cada envío**, porque en un formulario
     * público no hay envío fallido —todos "funcionan"— y lo que hay que acotar es el
     * volumen. Cinco en quince minutos desde la misma IP es holgado para una persona
     * que se equivocó de tipo y estrecho para un script.
     */
    private readonly envios: IntentosFallidos,
  ) {}

  @Post()
  recibir(@Body() cuerpo: unknown, @Req() req: Request) {
    const llave = `contacto|${req.ip ?? 'sin-ip'}`;

    this.envios.contarPedido(
      llave,
      `Recibimos varias consultas tuyas. Espera ${VENTANA_MS / 60_000} minutos ` +
        'antes de mandar otra, o llámanos al club.',
    );

    return this.servicio.recibir(leerSolicitud(cuerpo));
  }
}

/**
 * La bandeja del club.
 *
 * `@SoloAdmin()` sobre el controlador entero: lo que hay acá son datos de contacto de
 * terceros que le escribieron al club, no un directorio público.
 */
@Controller('admin/solicitudes')
@SoloAdmin()
export class SolicitudesController {
  constructor(private readonly servicio: ContactoService) {}

  @Get()
  bandeja(@Query('estado') estado?: string, @Query('tipo') tipo?: string) {
    return this.servicio.bandeja(leerFiltros({ estado, tipo }));
  }

  @Patch(':id')
  resolver(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    const { estado, nota } = leerResolucion(cuerpo);

    return this.servicio.resolver(id, estado, nota, yo.id);
  }

  /** Convierte la solicitud en un alta de socio, y deja las dos filas enlazadas. */
  @Post(':id/invitacion')
  invitar(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ) {
    const datos = (cuerpo ?? {}) as Record<string, unknown>;
    const numeroSocio =
      typeof datos.numeroSocio === 'string' && datos.numeroSocio.trim() !== ''
        ? datos.numeroSocio.trim()
        : undefined;

    return this.servicio.invitar(id, numeroSocio, yo.id);
  }
}
