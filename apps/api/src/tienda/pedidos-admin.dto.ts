import { BadRequestException } from '@nestjs/common';

import { CanalPedido, EstadoPedido } from '../generated/prisma/client';
import type { FiltroDePedidos } from './pedidos-admin.service';

/** El filtro como llega en la URL. */
export function leerFiltroDePedidos(
  estado?: string,
  canal?: string,
): FiltroDePedidos {
  return {
    estado: deLaLista(estado, Object.values(EstadoPedido), 'El estado'),
    canal: deLaLista(canal, Object.values(CanalPedido), 'El canal'),
  };
}

/** El número de Starken: texto sin espacios de más, obligatorio y corto. */
export function leerSeguimiento(cuerpo: unknown): string {
  const { numeroSeguimiento } = (cuerpo ?? {}) as Record<string, unknown>;
  const limpio =
    typeof numeroSeguimiento === 'string' ? numeroSeguimiento.trim() : '';

  if (!limpio)
    throw new BadRequestException('Falta el número de seguimiento de Starken.');
  if (limpio.length > 60) {
    throw new BadRequestException(
      'El número de seguimiento tiene más de 60 caracteres.',
    );
  }

  return limpio;
}

function deLaLista<T extends string>(
  valor: string | undefined,
  opciones: readonly T[],
  campo: string,
): T | null {
  if (valor === undefined || valor === '') return null;
  if ((opciones as readonly string[]).includes(valor)) return valor as T;

  throw new BadRequestException(`${campo} es uno de: ${opciones.join(', ')}.`);
}
