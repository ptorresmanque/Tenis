import { Module } from '@nestjs/common';

import { ClasesModule } from './clases/clases.module';
import { CuotasModule } from './cuotas/cuotas.module';
import { CatalogoCanchasModule } from './catalogo-canchas/catalogo-canchas.module';
import { IdentidadModule } from './identidad/identidad.module';
import { PagosModule } from './pagos/pagos.module';
import { PrismaModule } from './prisma/prisma.module';
import { RankingModule } from './ranking/ranking.module';
import { ReportesModule } from './reportes/reportes.module';
import { ReservasModule } from './reservas/reservas.module';
import { SaludModule } from './salud/salud.module';
import { TiendaModule } from './tienda/tienda.module';
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
    ReportesModule,
    ReservasModule,
    TorneosModule,
    // Etapa 2, fuera del trabajo de título: responde 404 sin TIENDA_HABILITADA.
    TiendaModule,
  ],
})
export class AppModule {}
