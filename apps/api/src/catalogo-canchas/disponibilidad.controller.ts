import { Controller, Get } from '@nestjs/common';

import { CanchaPublica, DisponibilidadService } from './disponibilidad.service';

/**
 * Público a propósito: un visitante mira las canchas antes de decidir si se registra.
 *
 * `GET /api/disponibilidad` **vive en `reservas`** desde T23: los bloques existen acá
 * pero saber si están tomados es de allá, y este módulo no conoce las reservas. Que
 * la dependencia vaya en ese sentido y no al revés es lo que evita el ciclo.
 */
@Controller()
export class DisponibilidadController {
  constructor(private readonly servicio: DisponibilidadService) {}

  /** Sin esto la grilla no sabe qué columnas dibujar. */
  @Get('canchas')
  canchas(): Promise<CanchaPublica[]> {
    return this.servicio.canchas();
  }
}
