import { Module } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import {
  PartidosInternosController,
  PartidosInternosDelAdminController,
} from './partidos-internos.controller';
import { PartidosInternos } from './partidos-internos.service';
import { RankingInterno } from './ranking-interno.service';
import { RankingController } from './ranking.controller';
import { RankingDeTorneos } from './ranking-torneos.service';

/**
 * Las tablas que ordenan personas.
 *
 * **`ranking` no escribe en ningún otro módulo.** Es de solo lectura sobre `torneos` y
 * dueño de `PartidoInterno` y nada más; ésa es la razón por la que puede recalcularse
 * entero sin coordinarse con nadie. No importa `TorneosModule` porque lee sus tablas
 * por Prisma, no sus servicios.
 *
 * `IdentidadModule` sí, porque `@SoloSocio()` y `@Yo()` resuelven `SesionService` en
 * el módulo del controlador que los usa.
 */
@Module({
  imports: [IdentidadModule],
  controllers: [
    RankingController,
    PartidosInternosController,
    PartidosInternosDelAdminController,
  ],
  providers: [RankingDeTorneos, RankingInterno, PartidosInternos],
})
export class RankingModule {}
