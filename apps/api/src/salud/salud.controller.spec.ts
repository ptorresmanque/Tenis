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

  await app.listen(0, '127.0.0.1');
  return app;
}

/**
 * La ruta pública devuelve solo `estado`: desde T27, el detalle del motor vive en
 * `/api/salud/detalle`, tras `@SoloAdmin()`, y se prueba en `test/salud-detalle.spec.ts`.
 */
async function pedirSalud(
  app: INestApplication,
  estadoHttpEsperado: number,
): Promise<Pick<EstadoSalud, 'estado'>> {
  const respuesta = await request(app.getHttpServer() as Server)
    .get('/api/salud')
    .expect(estadoHttpEsperado);

  return respuesta.body as Pick<EstadoSalud, 'estado'>;
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

    it('responde 200 y dice que el sistema está sano', async () => {
      const cuerpo = await pedirSalud(app, 200);

      expect(cuerpo.estado).toBe('ok');
    });

    it('no cuenta con qué motor corre el club', async () => {
      const respuesta = await request(app.getHttpServer() as Server)
        .get('/api/salud')
        .expect(200);

      expect(JSON.stringify(respuesta.body)).not.toMatch(/MariaDB/i);
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

    it('se reporta degradado, sin obligar a quien monitorea a leer el detalle', async () => {
      const cuerpo = await pedirSalud(app, 503);

      expect(cuerpo.estado).toBe('degradado');
    });
  });
});
