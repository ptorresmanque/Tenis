import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { fechaDelClub } from '../comun/tiempo';
import {
  BloqueConEstado,
  DisponibilidadPublicaService,
} from './disponibilidad-publica.service';

/**
 * La grilla que ve todo el mundo, ya con las reservas superpuestas.
 *
 * Sigue siendo pública y de solo lectura: un visitante mira horarios y precios antes
 * de decidir si se registra, y no se dice quién reservó cada bloque.
 */
@Controller()
export class DisponibilidadPublicaController {
  constructor(private readonly servicio: DisponibilidadPublicaService) {}

  @Get('disponibilidad')
  disponibilidad(
    @Query('cancha') cancha: string | undefined,
    @Query('fecha') fecha: string | undefined,
  ): Promise<BloqueConEstado[]> {
    const canchaId = Number(cancha);
    if (!cancha || !Number.isInteger(canchaId) || canchaId <= 0) {
      throw new BadRequestException(
        'Falta el número de cancha, o no es un número.',
      );
    }

    if (!fecha || !esFechaDelClub(fecha)) {
      // Se valida acá y no se deja fallar adentro: una fecha ilegible es culpa de
      // quien la pidió, y como error del servicio saldría con un 500 que hace creer
      // que la API está rota.
      throw new BadRequestException(
        'La fecha tiene que existir y tener la forma AAAA-MM-DD.',
      );
    }

    return this.servicio.de(canchaId, fecha);
  }
}

function esFechaDelClub(fecha: string): boolean {
  try {
    fechaDelClub(fecha);
    return true;
  } catch {
    return false;
  }
}
