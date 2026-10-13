import { BadRequestException } from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';

/** Cancelar un pedido en línea: anularlo en Webpay o, si no deja, devolver por transferencia. */
export interface Cancelacion {
  motivo: string;
  medio: 'WEBPAY' | 'TRANSFERENCIA';
}

/** Devolver una parte de un pedido pagado (T174). Por Webpay no: solo se anula el total. */
export interface DevolucionNueva {
  lineas: { lineaId: number; cantidad: number }[];
  montoClp: number;
  medio: 'TRANSFERENCIA' | 'EFECTIVO';
  reponeStock: boolean;
  motivo: string;
}

/** El ancho de `devolucion.motivo` y de `pedido.motivo_cancelacion`. */
const LARGO_DEL_MOTIVO = 500;
/** Diez millones, como el precio de un producto: atajar un cero de más. */
const MONTO_MAXIMO = 10_000_000;

export function leerCancelacion(cuerpo: unknown): Cancelacion {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    motivo: motivo(datos.motivo),
    medio: deLaLista(
      datos.medio ?? 'WEBPAY',
      ['WEBPAY', 'TRANSFERENCIA'],
      'Se cancela anulando en Webpay o devolviendo por transferencia.',
    ),
  };
}

export function leerDevolucion(cuerpo: unknown): DevolucionNueva {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  if (!Array.isArray(datos.lineas) || datos.lineas.length === 0) {
    throw new BadRequestException('Elige qué unidades se devuelven.');
  }
  const lineas = datos.lineas.map((linea: unknown) => {
    const { lineaId, cantidad } = (linea ?? {}) as Record<string, unknown>;

    return {
      lineaId: entero(lineaId, 'Cada línea', 1),
      cantidad: entero(cantidad, 'Lo que se devuelve de cada línea', 1),
    };
  });
  if (new Set(lineas.map((l) => l.lineaId)).size !== lineas.length) {
    throw new BadRequestException('Una línea está dos veces en la devolución.');
  }
  if (typeof datos.reponeStock !== 'boolean') {
    throw new BadRequestException(
      'Di si lo devuelto vuelve a la venta: un producto fallado no vuelve.',
    );
  }

  return {
    lineas,
    montoClp: entero(datos.montoClp, 'El monto', 1, MONTO_MAXIMO),
    medio: deLaLista(
      datos.medio,
      ['TRANSFERENCIA', 'EFECTIVO'],
      'Una devolución se hace por transferencia o en efectivo. Por Webpay solo se anula el pedido entero.',
    ),
    reponeStock: datos.reponeStock,
    motivo: motivo(datos.motivo),
  };
}

function motivo(valor: unknown): string {
  const limpio = typeof valor === 'string' ? valor.trim() : '';

  if (!limpio) throw new BadRequestException('Escribe el motivo.');
  if (limpio.length > LARGO_DEL_MOTIVO) {
    throw new BadRequestException(
      `Acorta el motivo: tiene más de ${LARGO_DEL_MOTIVO} caracteres.`,
    );
  }

  return limpio;
}

function deLaLista<T extends string>(
  valor: unknown,
  opciones: readonly T[],
  mensaje: string,
): T {
  if ((opciones as readonly unknown[]).includes(valor)) return valor as T;

  throw new BadRequestException(mensaje);
}
