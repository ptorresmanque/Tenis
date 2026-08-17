import { Module } from '@nestjs/common';

import { CatalogoCanchasModule } from './catalogo-canchas/catalogo-canchas.module';
import { IdentidadModule } from './identidad/identidad.module';
import { PrismaModule } from './prisma/prisma.module';
import { SaludModule } from './salud/salud.module';

@Module({
  imports: [PrismaModule, SaludModule, IdentidadModule, CatalogoCanchasModule],
})
export class AppModule {}
