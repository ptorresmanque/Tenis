import { Module } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import { CuotasController } from './cuotas.controller';
import { EmisionDeCuotas } from './emision.service';

/**
 * La cuota mensual y la de incorporación.
 *
 * `IdentidadModule` porque `@SoloAdmin()` resuelve `SesionService` en el módulo del
 * controlador que lo usa, no en el que lo declara.
 */
@Module({
  imports: [IdentidadModule],
  controllers: [CuotasController],
  providers: [EmisionDeCuotas],
  exports: [EmisionDeCuotas],
})
export class CuotasModule {}
