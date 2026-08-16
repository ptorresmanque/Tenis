import { Module } from '@nestjs/common';

import { PrismaModule } from './prisma/prisma.module';
import { SaludModule } from './salud/salud.module';

@Module({
  imports: [PrismaModule, SaludModule],
})
export class AppModule {}
