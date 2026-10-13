import { Controller, Get } from '@nestjs/common';

import { SoloAdmin } from '../identidad/guards';
import { PrismaService } from '../prisma/prisma.service';
import { excesosDeLuz } from './tope-de-luz';

/**
 * Las horas ya tomadas que superan el tope de canchas con luz (T208).
 *
 * Encender el tope, bajarlo o adelantar su hora no cancela nada: el panel de Reglas
 * muestra esta lista debajo del tope, y el club llama a esas personas.
 */
@Controller('admin/tope-de-luz')
@SoloAdmin()
export class TopeDeLuzController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('excesos')
  excesos() {
    return excesosDeLuz(this.prisma);
  }
}
