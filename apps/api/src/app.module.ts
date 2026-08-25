import { Module } from '@nestjs/common';

import { ClasesModule } from './clases/clases.module';
import { CuotasModule } from './cuotas/cuotas.module';
import { CatalogoCanchasModule } from './catalogo-canchas/catalogo-canchas.module';
import { IdentidadModule } from './identidad/identidad.module';
import { PagosModule } from './pagos/pagos.module';
import { PrismaModule } from './prisma/prisma.module';
import { RankingModule } from './ranking/ranking.module';
import { ReservasModule } from './reservas/reservas.module';
import { SaludModule } from './salud/salud.module';
import { TorneosModule } from './torneos/torneos.module';

@Module({
  imports: [
    ClasesModule,
    CuotasModule,
    PrismaModule,
    SaludModule,
    IdentidadModule,
    CatalogoCanchasModule,
    PagosModule,
    RankingModule,
    ReservasModule,
    TorneosModule,
  ],
})
export class AppModule {}
