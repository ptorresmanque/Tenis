import { Module } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import { PagosModule } from '../pagos/pagos.module';
import { AjustesDeCuota } from './ajustes.service';
import { CuotasController } from './cuotas.controller';
import { MisCuotasController } from './mis-cuotas.controller';
import { PagoEnLineaDeCuota } from './pago-en-linea.service';
import { EmisionDeCuotas } from './emision.service';
import { PagoManualDeCuota } from './pago-manual.service';
import { RecordatoriosDeCuota } from './recordatorios';

/**
 * La cuota mensual y la de incorporación.
 *
 * `IdentidadModule` porque `@SoloAdmin()` resuelve `SesionService` en el módulo del
 * controlador que lo usa, no en el que lo declara.
 */
@Module({
  imports: [IdentidadModule, PagosModule],
  controllers: [CuotasController, MisCuotasController],
  providers: [
    EmisionDeCuotas,
    PagoManualDeCuota,
    PagoEnLineaDeCuota,
    AjustesDeCuota,
    RecordatoriosDeCuota,
  ],
  // `RecordatoriosDeCuota` sale para el script del cron (T112), que levanta el contexto
  // de Nest sin servidor HTTP.
  exports: [EmisionDeCuotas, RecordatoriosDeCuota],
})
export class CuotasModule {}
