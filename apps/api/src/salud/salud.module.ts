import { Module } from '@nestjs/common';

import { IdentidadModule } from '../identidad/identidad.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SaludController } from './salud.controller';
import { SaludService } from './salud.service';

@Module({
  // `IdentidadModule` porque el detalle va tras `@SoloAdmin()`: el guard se
  // instancia en el módulo del controlador y ahí tiene que resolver `SesionService`.
  imports: [PrismaModule, IdentidadModule],
  controllers: [SaludController],
  providers: [SaludService],
})
export class SaludModule {}
