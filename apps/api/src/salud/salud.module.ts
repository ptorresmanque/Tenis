import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SaludController } from './salud.controller';
import { SaludService } from './salud.service';

@Module({
  imports: [PrismaModule],
  controllers: [SaludController],
  providers: [SaludService],
})
export class SaludModule {}
