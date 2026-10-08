import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';

import { esFechaDelClub } from '../comun/tiempo';
import { SoloAdmin } from '../identidad/guards';
import { leerDuracion } from './duracion';
import { leerAcompanantes } from './reservas.dto';
import {
  CupoDelSocio,
  ReservaDelAdminService,
} from './reserva-del-admin.service';
import { ReservaCreada } from './reservas.service';

/**
 * La reserva que toma el club: por teléfono, o con alguien parado en el mesón.
 *
 * Va aparte de `AgendaController` porque escribe y aquella solo lee, pero comparte
 * su regla: `@SoloAdmin()` sobre el controlador entero. Acá se crea a nombre de
 * terceros, que es exactamente lo que no puede quedar abierto.
 */
@Controller('admin/reservas')
@SoloAdmin()
export class ReservaDelAdminController {
  constructor(private readonly servicio: ReservaDelAdminService) {}

  /**
   * Cuánto le queda al socio ese día.
   *
   * Se consulta antes de crear porque el club decide con esto en la mano: "hoy ya
   * jugaste" dicho por teléfono es una conversación; dicho por un error después de
   * apretar el botón, es una llamada de vuelta.
   */
  @Get('cupo/:socioId')
  cupo(
    @Param('socioId', ParseIntPipe) socioId: number,
    @Query('fecha') fecha: string | undefined,
  ): Promise<CupoDelSocio> {
    if (!fecha || !esFechaDelClub(fecha)) {
      throw new BadRequestException(
        'La fecha tiene que existir y tener la forma AAAA-MM-DD.',
      );
    }

    return this.servicio.cupoDe(socioId, fecha);
  }

  @Post()
  crear(@Body() cuerpo: unknown): Promise<ReservaCreada> {
    return this.servicio.crear(reservaDelAdminDeCuerpo(cuerpo));
  }
}

/**
 * Valida el cuerpo acá y no con un pipe global: la API no usa `class-validator` en
 * ningún otro endpoint, y traerlo por uno solo agregaría una forma distinta de
 * validar que hay que aprender aparte.
 */
/**
 * El campo como texto, o vacío si no vino como texto.
 *
 * `String(valor)` no sirve: un `{ "email": {} }` se convierte en
 * "[object Object]", que no está vacío y pasa las comprobaciones de abajo como
 * si la persona hubiera escrito algo.
 */
function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

function reservaDelAdminDeCuerpo(cuerpo: unknown) {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const canchaId = Number(datos.canchaId);
  if (!Number.isInteger(canchaId) || canchaId <= 0) {
    throw new BadRequestException('Falta la cancha.');
  }

  const inicio = new Date(texto(datos.inicio));
  if (Number.isNaN(inicio.getTime())) {
    throw new BadRequestException('Falta la hora de inicio, o no se entiende.');
  }

  const socioId = datos.socioId == null ? null : Number(datos.socioId);
  if (socioId !== null && (!Number.isInteger(socioId) || socioId <= 0)) {
    throw new BadRequestException('Ese socio no es válido.');
  }

  // Sin socio es una reserva de visitante, y de esas el club necesita a quién
  // llamar: es la hora que se cobra en el mesón y que alguien puede no venir a usar.
  const nombre = texto(datos.nombre);
  if (socioId === null && nombre === '') {
    throw new BadRequestException(
      'Escribe a nombre de quién queda la hora, o elige un socio.',
    );
  }

  return {
    canchaId,
    inicio,
    duracionMin: leerDuracion(datos.duracionMin),
    socioId,
    nombre,
    email: texto(datos.email),
    telefono: texto(datos.telefono),
    // El mismo borde que la reserva del socio: hasta 3, cada uno socio o invitado (T105).
    acompanantes: leerAcompanantes(datos.acompanantes),
  };
}
