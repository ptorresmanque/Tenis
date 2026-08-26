import { Module } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import { ClubPublicoController } from './club-publico.controller';
import { TarifasPublicasController } from './tarifas-publicas.controller';
import { TarifasPublicasService } from './tarifas-publicas.service';
import { AdminCanchasController } from './admin.controller';
import { AdminCanchasService } from './admin.service';
import { DisponibilidadController } from './disponibilidad.controller';
import { DisponibilidadService } from './disponibilidad.service';

@Module({
  // `IdentidadModule` porque `@SoloAdmin()` resuelve `SesionService` en el módulo
  // del controlador que lo usa, no en el que lo declara.
  imports: [IdentidadModule],
  controllers: [
    TarifasPublicasController,
    DisponibilidadController,
    ClubPublicoController,
    AdminCanchasController,
  ],
  providers: [
    TarifasPublicasService,
    DisponibilidadService,
    AdminCanchasService,
  ],
  // `reservas` va a superponer sus reservas sobre estos bloques.
  exports: [DisponibilidadService],
})
export class CatalogoCanchasModule {}
