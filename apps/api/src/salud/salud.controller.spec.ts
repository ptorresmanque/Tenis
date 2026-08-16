import type { Server } from 'node:http';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { PrismaService } from '../prisma/prisma.service';
import { SaludModule } from './salud.module';
import type { EstadoSalud } from './salud.service';

async function levantar(
  sobrescribirPrisma?: Partial<PrismaService>,
): Promise<INestApplication> {
  const constructor = Test.createTestingModule({ imports: [SaludModule] });

  if (sobrescribirPrisma) {
    constructor.overrideProvider(PrismaService).useValue(sobrescribirPrisma);
  }

  const app = (await constructor.compile()).createNestApplication();
  app.setGlobalPrefix('api');

  if (sobrescribirPrisma) {
    // El caso de base caída registra el error a propósito. Sin esto, la suite pasa
    // escupiendo stack traces y el próximo que la corra cree que algo se rompió.
    app.useLogger(false);
  }

  await app.init();
  return app;
}

async function pedirSalud(
  app: INestApplication,
  estadoHttpEsperado: number,
): Promise<EstadoSalud> {
  const respuesta = await request(app.getHttpServer() as Server)
    .get('/api/salud')
    .expect(estadoHttpEsperado);

  return respuesta.body as EstadoSalud;
}

describe('GET /api/salud', () => {
  describe('con la base de datos disponible', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await levantar();
    });

    afterAll(async () => {
      await app.close();
    });

    it('responde 200 e informa que la base está conectada', async () => {
      const cuerpo = await pedirSalud(app, 200);

      expect(cuerpo.baseDatos.conectado).toBe(true);
    });

    it('reporta la versión que informa el motor, no una constante del código', async () => {
      const cuerpo = await pedirSalud(app, 200);

      // El dato viene de SELECT VERSION() en MariaDB. Si alguien reemplaza la consulta
      // por un literal, este formato deja de coincidir con lo que el motor devuelve.
      expect(cuerpo.baseDatos.versionMotor).toMatch(/^\d+\.\d+\.\d+.*MariaDB/i);
    });
  });

  describe('con la base de datos caída', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await levantar({
        $queryRaw: () => Promise.reject(new Error('conexión rechazada')),
      } as unknown as Partial<PrismaService>);
    });

    afterAll(async () => {
      await app.close();
    });

    it('responde 503 en vez de fingir que todo está bien', async () => {
      await pedirSalud(app, 503);
    });

    it('reporta la base como desconectada y sin versión', async () => {
      const cuerpo = await pedirSalud(app, 503);

      expect(cuerpo.baseDatos.conectado).toBe(false);
      expect(cuerpo.baseDatos.versionMotor).toBeNull();
    });
  });
});
