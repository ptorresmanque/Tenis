import { Module } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import { ToursAdminController } from './tours.controller';
import { Tours } from './tours.service';

/**
 * Los tours (`SPEC-tours.md`): ligas con temporadas, niveles y tabla de puntos.
 *
 * **No importa nada de `torneos` ni de `ranking`**: la flecha va de ellos hacia acá.
 * Lo único que lee de `torneo_tour` es cuántas filas hay, por la relación de Prisma, para
 * explicar por qué algo no se puede borrar.
 */
@Module({
  // `IdentidadModule` porque `@SoloAdmin()` resuelve `SesionService` en el módulo
  // del controlador que lo usa, no en el que lo declara.
  imports: [IdentidadModule],
  controllers: [ToursAdminController],
  providers: [Tours],
  exports: [Tours],
})
export class ToursModule {}
