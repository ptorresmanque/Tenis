import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { fechaDelClub } from '../comun/tiempo';
import {
  BloqueDisponible,
  CanchaPublica,
  DisponibilidadService,
} from './disponibilidad.service';

/**
 * Público a propósito: un visitante mira los horarios y el precio antes de decidir
 * si se registra. Es de solo lectura y no dice nada de quién reservó.
 */
@Controller()
export class DisponibilidadController {
  constructor(private readonly servicio: DisponibilidadService) {}

  /** Sin esto la grilla no sabe qué columnas dibujar. */
  @Get('canchas')
  canchas(): Promise<CanchaPublica[]> {
    return this.servicio.canchas();
  }

  @Get('disponibilidad')
  disponibilidad(
    @Query('cancha') cancha: string | undefined,
    @Query('fecha') fecha: string | undefined,
  ): Promise<BloqueDisponible[]> {
    const canchaId = Number(cancha);
    if (!cancha || !Number.isInteger(canchaId) || canchaId <= 0) {
      throw new BadRequestException(
        'Falta el número de cancha, o no es un número.',
      );
    }

    if (!fecha || !esFechaDelClub(fecha)) {
      // Se valida acá y no se deja fallar adentro: una fecha ilegible es culpa de
      // quien la pidió, y como error del servicio saldría con un 500 que hace
      // creer que la API está rota.
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
