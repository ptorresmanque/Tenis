import { Module } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import { PagosDelClubController } from './pagos-del-club.controller';
import { PagosDelClubService } from './pagos-del-club.service';

/**
 * Finanzas › Pagos (T396–T397): los pagos por Webpay y los cobros del mesón, uno por uno. Lee
 * `transaccion`, `cuota`, `inscripcion_torneo` y `reserva` sin depender de sus módulos: la lista
 * solo mira, y devolver (T397) pasa por `AnulacionService` de `pagos`.
 */
@Module({
  // `@SoloAdmin()` resuelve `SesionService` en el módulo del controlador.
  imports: [IdentidadModule],
  controllers: [PagosDelClubController],
  providers: [PagosDelClubService],
  exports: [PagosDelClubService],
})
export class FinanzasModule {}
