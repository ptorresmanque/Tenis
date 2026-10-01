import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { fechaDelClub } from '../comun/tiempo';
import {
  BloqueConEstado,
  DisponibilidadPublicaService,
  GrillaDeCancha,
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
  ): Promise<BloqueConEstado[] | GrillaDeCancha[]> {
    if (!fecha || !esFechaDelClub(fecha)) {
      // Se valida acá y no se deja fallar adentro: una fecha ilegible es culpa de
      // quien la pidió, y como error del servicio saldría con un 500 que hace creer
      // que la API está rota.
      throw new BadRequestException(
        'La fecha tiene que existir y tener la forma AAAA-MM-DD.',
      );
    }

    // Sin cancha, el día entero. La portada y la grilla lo piden así para no
    // hacer una consulta por cancha; con `cancha`, la respuesta es la de siempre
    // y nada de lo que ya existe cambia.
    if (cancha === undefined) return this.servicio.delDia(fecha);

    const canchaId = Number(cancha);
    if (!cancha || !Number.isInteger(canchaId) || canchaId <= 0) {
      throw new BadRequestException('El número de cancha no es un número.');
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
