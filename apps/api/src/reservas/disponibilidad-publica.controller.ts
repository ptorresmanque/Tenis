import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import {
  BloqueConEstado,
  DisponibilidadPublicaService,
  GrillaDeCancha,
} from './disponibilidad-publica.service';
import { leerDuracion } from './duracion';
import { fechaDeConsulta } from './reservas.dto';

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
    @Query('fecha') fechaPedida: string | undefined,
    @Query('duracion') duracion: string | undefined,
  ): Promise<BloqueConEstado[] | GrillaDeCancha[]> {
    const fecha = fechaDeConsulta(fechaPedida);
    // 1 hora o 1 hora y media (T82). Se valida antes de ramificar: una duración
    // ilegible es un 400 pida o no una cancha.
    const duracionMin = leerDuracion(duracion);

    // Sin cancha, el día entero. La portada y la grilla lo piden así para no
    // hacer una consulta por cancha; con `cancha`, la respuesta es la de siempre
    // y nada de lo que ya existe cambia.
    if (cancha === undefined) return this.servicio.delDia(fecha, duracionMin);

    const canchaId = Number(cancha);
    if (!cancha || !Number.isInteger(canchaId) || canchaId <= 0) {
      throw new BadRequestException('El número de cancha no es un número.');
    }

    return this.servicio.de(canchaId, fecha, duracionMin);
  }
}
