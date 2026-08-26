import { Controller, Get } from '@nestjs/common';

import { TarifasPublicasService } from './tarifas-publicas.service';

/**
 * La lista de precios y el horario, sin cuenta.
 *
 * Rutas en la raíz y no bajo `/club`: son dos preguntas distintas —cuánto sale y
 * cuándo abren— y quien las consulta no está mirando la ficha del club.
 */
@Controller()
export class TarifasPublicasController {
  constructor(private readonly servicio: TarifasPublicasService) {}

  @Get('tarifas')
  tarifas() {
    return this.servicio.tarifas();
  }

  @Get('horarios')
  horarios() {
    return this.servicio.horarios();
  }
}
