// Node carga el .env de forma nativa; no hace falta dotenv ni @nestjs/config.
process.loadEnvFile(`${__dirname}/../.env`);

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { configurarLaIpDelCliente } from './ip-del-cliente';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:4200',
    credentials: true,
  });

  configurarLaIpDelCliente(app);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
