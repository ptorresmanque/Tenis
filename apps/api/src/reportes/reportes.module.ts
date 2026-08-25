import { Module } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import { IngresoDelClub } from './ingreso.service';
import { ReportesController } from './reportes.controller';

/**
 * Los reportes del club.
 *
 * **No tiene tablas propias. Ni una.** Consulta las de los otros módulos y agrega. Un
 * almacén de métricas habría que poblarlo desde cada camino que produce un dato, y el
 * día que uno se olvide el reporte miente sin que nada falle — peor acá que en el
 * ranking, porque un reporte de ingresos equivocado se usa para decidir una inversión.
 *
 * **Es la punta del grafo: no expone nada a nadie.** Lee de `reservas`, `pagos`,
 * `cuotas` y `catalogo-canchas`, y ninguno de los cuatro lo conoce. Esa asimetría es lo
 * que permite agregarle un reporte nuevo sin tocar una línea de los otros.
 *
 * `IdentidadModule` porque `@SoloAdmin()` resuelve `SesionService` en el módulo del
 * controlador que lo usa.
 */
@Module({
  imports: [IdentidadModule],
  controllers: [ReportesController],
  providers: [IngresoDelClub],
})
export class ReportesModule {}
