import { Controller, Get, Req } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';

import { configurarLaIpDelCliente } from '../src/ip-del-cliente';

/** Devuelve la IP que ve la app, la misma que usan los frenos para su llave. */
@Controller()
class IpController {
  @Get('ip')
  ip(@Req() req: Request): { ip: string | undefined } {
    return { ip: req.ip };
  }
}

/**
 * La IP con la que la API frena la fuerza bruta. El login, el registro, la
 * recuperación, el contacto, la inscripción pública a un torneo y el comprobante
 * cuentan los intentos por `req.ip`, y `req.ip` depende de `PROXIES_DE_CONFIANZA`.
 *
 * Se confía por número de saltos y no por subred, y por eso el aviso crítico de
 * proxy-addr (GHSA-jqcg-44mw-7w3h) no nos alcanzaba. Hasta esta prueba, lo que hace
 * ese número se había comprobado solo con un script suelto.
 *
 * Cada petición trae lo que nginx le pasa a la app cuando el cliente manda su propio
 * `X-Forwarded-For`: primero la IP que el cliente inventó y al final la que nginx le
 * vio. Las dos son de las reservadas para documentación (RFC 5737).
 */
describe('configurarLaIpDelCliente', () => {
  const INVENTADA = '203.0.113.66';
  const DEL_PROXY = '198.51.100.7';
  const DE_LA_CONEXION = '127.0.0.1';

  /** La IP que ve una app recién levantada con `PROXIES_DE_CONFIANZA` en `valor`. */
  async function ipQueVe(valor: string | undefined): Promise<string> {
    if (valor === undefined) {
      delete process.env.PROXIES_DE_CONFIANZA;
    } else {
      process.env.PROXIES_DE_CONFIANZA = valor;
    }

    const modulo = await Test.createTestingModule({
      controllers: [IpController],
    }).compile();
    const app = modulo.createNestApplication<NestExpressApplication>();
    configurarLaIpDelCliente(app);
    await app.listen(0, '127.0.0.1');

    try {
      const respuesta = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .get('/ip')
        .set('X-Forwarded-For', `${INVENTADA}, ${DEL_PROXY}`)
        .expect(200);
      return (respuesta.body as { ip: string }).ip;
    } finally {
      await app.close();
    }
  }

  it.each([
    ['sin la variable', undefined],
    ['con 0', '0'],
  ])(
    '%s no le cree a X-Forwarded-For: la IP es la de la conexión',
    async (_, valor) => {
      // Si le creyera, bastaría cambiar el encabezado en cada intento para que el
      // freno viera siempre una IP nueva y no bloqueara nunca.
      expect(await ipQueVe(valor)).toBe(DE_LA_CONEXION);
    },
  );

  it('con 1, la IP es la última de X-Forwarded-For: la que agregó el proxy', async () => {
    // Y no la primera, que la escribió el cliente.
    expect(await ipQueVe('1')).toBe(DEL_PROXY);
  });

  it.each(['abc', '-1', '1.5'])(
    'con %s, que no es un entero positivo, se porta como sin proxy',
    async (valor) => {
      // **1.5 es el que importa.** Express confía en los saltos con `i < 1.5`, o sea
      // en dos: sin la guarda de entero, la IP sería la que inventó el cliente.
      expect(await ipQueVe(valor)).toBe(DE_LA_CONEXION);
    },
  );
});
