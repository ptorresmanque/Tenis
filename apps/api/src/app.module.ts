import { Module } from '@nestjs/common';

import { CuotasModule } from './cuotas/cuotas.module';
import { CatalogoCanchasModule } from './catalogo-canchas/catalogo-canchas.module';
import { IdentidadModule } from './identidad/identidad.module';
import { PagosModule } from './pagos/pagos.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReservasModule } from './reservas/reservas.module';
import { SaludModule } from './salud/salud.module';

@Module({
  imports: [
    CuotasModule,
    PrismaModule,
    SaludModule,
    IdentidadModule,
    CatalogoCanchasModule,
    PagosModule,
    ReservasModule,
  ],
})
export class AppModule {}
