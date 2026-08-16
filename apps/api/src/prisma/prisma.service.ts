import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { PrismaClient } from '../generated/prisma/client';

function adaptadorDesde(urlCruda: string | undefined): PrismaMariaDb {
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
