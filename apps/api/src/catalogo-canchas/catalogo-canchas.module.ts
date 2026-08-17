import { Module } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import { AdminCanchasController } from './admin.controller';
import { AdminCanchasService } from './admin.service';
import { DisponibilidadController } from './disponibilidad.controller';
import { DisponibilidadService } from './disponibilidad.service';

@Module({
  // `IdentidadModule` porque `@SoloAdmin()` resuelve `SesionService` en el módulo
  // del controlador que lo usa, no en el que lo declara.
  imports: [IdentidadModule],
  controllers: [DisponibilidadController, AdminCanchasController],
  providers: [DisponibilidadService, AdminCanchasService],
  // `reservas` va a superponer sus reservas sobre estos bloques.
  exports: [DisponibilidadService],
})
export class CatalogoCanchasModule {}
