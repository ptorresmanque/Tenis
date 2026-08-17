import { Module } from '@nestjs/common';

import { DisponibilidadController } from './disponibilidad.controller';
import { DisponibilidadService } from './disponibilidad.service';

@Module({
  controllers: [DisponibilidadController],
  providers: [DisponibilidadService],
  // `reservas` va a superponer sus reservas sobre estos bloques.
  exports: [DisponibilidadService],
})
export class CatalogoCanchasModule {}
