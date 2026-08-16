import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { PrismaClient } from '../generated/prisma/client';

/**
 * MySQL/MariaDB guarda DATETIME sin zona horaria, y el driver serializa las fechas
 * en la zona del proceso. Con el proceso en America/Santiago, un instante UTC se
 * escribe corrido y —peor— los dos "23:30" del domingo en que Chile atrasa el reloj
 * caen en el mismo valor: dos reservas legítimas chocarían en el índice único.
 *
 * Correr el proceso en UTC es lo que hace que la columna guarde UTC de verdad.
 * Se verifica en test/zona-horaria.spec.ts.
 */
function exigirProcesoEnUtc(): void {
  const desfase = new Date().getTimezoneOffset();
  if (desfase !== 0) {
    throw new Error(
      `El proceso no corre en UTC (offset ${desfase} min, TZ=${process.env.TZ ?? 'sin definir'}). ` +
        'Los instantes se guardarían en hora local y colisionarían en el cambio de horario. ' +
        'Arrancá con TZ=UTC (ya está en los scripts de package.json).',
    );
  }
}

function adaptadorDesde(urlCruda: string | undefined): PrismaMariaDb {
  exigirProcesoEnUtc();

  if (!urlCruda) {
    throw new Error(
      'Falta DATABASE_URL. Copiá apps/api/.env.example a apps/api/.env.',
    );
  }

  const url = new URL(urlCruda);

  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 5,
    // El adaptador no hereda los tiempos de espera que Prisma usaba antes de los
    // driver adapters. Sin esto, una base que no responde deja la request colgada.
    connectTimeout: 5_000,
    idleTimeout: 300,
  });
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter: adaptadorDesde(process.env.DATABASE_URL) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
