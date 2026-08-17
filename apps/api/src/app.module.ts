import { Module } from '@nestjs/common';

import { IdentidadModule } from './identidad/identidad.module';
import { PrismaModule } from './prisma/prisma.module';
import { SaludModule } from './salud/salud.module';

@Module({
  imports: [PrismaModule, SaludModule, IdentidadModule],
})
export class AppModule {}
