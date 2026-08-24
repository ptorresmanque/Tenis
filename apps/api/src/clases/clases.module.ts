import { Module } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import { ProfesoresController } from './profesores.controller';
import { Profesores } from './profesores.service';

/**
 * Las clases con profesor que da el club.
 *
 * Por ahora, quiénes las dan. `IdentidadModule` porque `@SoloAdmin()` resuelve
 * `SesionService` en el módulo del controlador que lo usa, no en el que lo declara.
 */
@Module({
  imports: [IdentidadModule],
  controllers: [ProfesoresController],
  providers: [Profesores],
})
export class ClasesModule {}
