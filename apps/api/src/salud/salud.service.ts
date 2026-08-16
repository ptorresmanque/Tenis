import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface EstadoSalud {
  estado: 'ok' | 'degradado';
  baseDatos: {
    conectado: boolean;
    versionMotor: string | null;
  };
}

@Injectable()
export class SaludService {
  private readonly logger = new Logger(SaludService.name);

  constructor(private readonly prisma: PrismaService) {}

  async estado(): Promise<EstadoSalud> {
    try {
      const filas = await this.prisma.$queryRaw<
        { version: string }[]
      >`SELECT VERSION() AS version`;

      return {
        estado: 'ok',
        baseDatos: { conectado: true, versionMotor: filas[0].version },
      };
    } catch (error) {
      this.logger.error('La base de datos no respondió', error);

      return {
        estado: 'degradado',
        baseDatos: { conectado: false, versionMotor: null },
      };
    }
  }
}
