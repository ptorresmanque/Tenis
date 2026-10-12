import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { tiendaHabilitada } from '../comun/tienda';

/**
 * Con la tienda apagada, toda ruta suya responde 404 (T156).
 *
 * **404 y no 403**: para afuera, la tienda no existe. Un 403 contaría que hay algo
 * detrás, y respondería distinto a un admin que a un visitante. El cuerpo es el mismo
 * que Nest da a una ruta que no existe, por la misma razón.
 *
 * **Un middleware por prefijo y no un guard en cada controlador.** Con un guard, el
 * controlador que se olvide de llevarlo deja la tienda abierta en producción sin que
 * nada falle; el prefijo cubre a los que todavía no se escribieron. Por eso toda ruta de
 * la tienda vive bajo `tienda/` o `admin/tienda/`, y ninguna fuera.
 */
@Injectable()
export class InterruptorDeLaTienda implements NestMiddleware {
  use(peticion: Request, _respuesta: Response, seguir: NextFunction): void {
    if (!tiendaHabilitada()) {
      throw new NotFoundException(
        `Cannot ${peticion.method} ${peticion.originalUrl}`,
      );
    }

    seguir();
  }
}

/**
 * Lo que cubre el interruptor: la tienda pública y su panel, con y sin algo detrás.
 *
 * Cada prefijo va dos veces, pelado y con el comodín, para no depender de si el comodín
 * de `path-to-regexp` cubre también la forma sin `/` al final.
 */
export const RUTAS_DE_LA_TIENDA = [
  'tienda',
  'tienda/{*resto}',
  'admin/tienda',
  'admin/tienda/{*resto}',
];
