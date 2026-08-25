import { Module } from '@nestjs/common';

import { RankingController } from './ranking.controller';
import { RankingDeTorneos } from './ranking-torneos.service';

/**
 * Las tablas que ordenan personas.
 *
 * **`ranking` no escribe en ningún otro módulo**: es de solo lectura sobre `torneos`.
 * Esa es la razón por la que puede recalcularse entero sin coordinarse con nadie, y
 * por la que no importa `TorneosModule`: lee las mismas tablas por Prisma, no sus
 * servicios.
 */
@Module({
  controllers: [RankingController],
  providers: [RankingDeTorneos],
})
export class RankingModule {}
