import { BadRequestException } from '@nestjs/common';

import { ReservaDeNoSocio } from './reserva-no-socio.service';

/**
 * Lo que el visitante manda para reservar: qué hora quiere y cómo ubicarlo.
 *
 * **No hay ningún campo de monto, ni de estado, ni de folio.** El precio lo calcula el
 * servidor con la tarifa vigente; si el cliente manda uno, ni se lee (`SPEC.md` §
 * Boundaries). Es el guardia que T16 dejó anotado para el borde que recién existe acá.
 */
export function reservaDeNoSocioDeCuerpo(cuerpo: unknown): ReservaDeNoSocio {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    canchaId: entero(datos.canchaId),
    inicio: instante(datos.inicio),
    nombre: texto(datos.nombre, 'El nombre', 80),
    email: correo(datos.email),
    telefono: texto(datos.telefono, 'El teléfono', 20),
  };
}

function entero(valor: unknown): number {
  const numero = Number(valor);

  if (!Number.isInteger(numero) || numero <= 0) {
    throw new BadRequestException('La cancha no es válida.');
  }

  return numero;
}

function instante(valor: unknown): Date {
  const fecha = new Date(String(valor ?? ''));

  if (Number.isNaN(fecha.getTime())) {
    throw new BadRequestException('La hora de inicio no es válida.');
  }

  return fecha;
}

function texto(valor: unknown, campo: string, maximo: number): string {
  const limpio = String(valor ?? '').trim();

  if (limpio === '') {
    throw new BadRequestException(`${campo} es obligatorio.`);
  }

  if (limpio.length > maximo) {
    // Se rechaza en vez de recortar, como el detalle del bloqueo en T14: perder el
    // final sin avisar es peor que no guardarlo.
    throw new BadRequestException(
      `${campo} no puede tener más de ${maximo} caracteres.`,
    );
  }

  return limpio;
}

function correo(valor: unknown): string {
  const limpio = texto(valor, 'El correo', 100);

  // Deliberadamente flojo: validar correos con una expresión regular estricta rechaza
  // direcciones válidas y no atrapa las falsas. Lo que importa es que tenga forma de
  // correo para escribirle la confirmación.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
    throw new BadRequestException('El correo no parece un correo.');
  }

  return limpio;
}
