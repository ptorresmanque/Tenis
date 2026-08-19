import { BadRequestException } from '@nestjs/common';

import { AcompananteDeclarado } from './cupo';
import { ReservaDeSocio } from './reservas.service';

/**
 * Validación del borde, a mano y sin `class-validator` — la misma decisión que T5 y
 * T13 para tres campos.
 *
 * **No hay ningún campo de precio, ni de estado, ni de socio.** Lo que el cliente
 * manda es qué hora quiere y con quién juega; todo lo demás lo pone el servidor
 * (`SPEC.md` § Boundaries: nunca confiar en un precio o un id de socio del cliente).
 */
export function reservaDeSocioDeCuerpo(cuerpo: unknown): ReservaDeSocio {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    canchaId: entero(datos.canchaId, 'La cancha'),
    inicio: instante(datos.inicio),
    acompanantes: acompanantes(datos.acompanantes),
  };
}

function entero(valor: unknown, campo: string): number {
  const numero = Number(valor);

  if (!Number.isInteger(numero) || numero <= 0) {
    throw new BadRequestException(`${campo} no es válida.`);
  }

  return numero;
}

function instante(valor: unknown): Date {
  const fecha = new Date(String(valor ?? ''));

  if (Number.isNaN(fecha.getTime())) {
    // Sin este guardia, una fecha inválida sale como 500 y parece que la API está
    // rota; es el mismo arreglo que necesitó la disponibilidad en T12.
    throw new BadRequestException('La hora de inicio no es válida.');
  }

  return fecha;
}

function acompanantes(valor: unknown): AcompananteDeclarado[] {
  if (valor === undefined || valor === null) return [];

  if (!Array.isArray(valor)) {
    throw new BadRequestException(
      'Los acompañantes tienen que venir en una lista.',
    );
  }

  return valor.map((crudo) => {
    const item = (crudo ?? {}) as Record<string, unknown>;
    // `numeroSocio` es lo que la persona conoce y lo que el spec dice que se elige;
    // el id interno no lo sabe nadie fuera de la base. Lo resuelve el servicio.
    const numeroSocio =
      typeof item.numeroSocio === 'string' && item.numeroSocio.trim() !== ''
        ? item.numeroSocio.trim()
        : null;
    const socioId =
      item.socioId != null ? entero(item.socioId, 'El socio') : null;
    const nombre =
      typeof item.nombre === 'string' && item.nombre.trim() !== ''
        ? item.nombre.trim()
        : null;

    if (numeroSocio !== null) {
      if (nombre !== null || socioId !== null) {
        throw new BadRequestException(
          'Cada acompañante es un socio del club o un invitado, no las dos cosas.',
        );
      }

      return { numeroSocio };
    }

    if ((socioId === null) === (nombre === null)) {
      // La regla que MariaDB no deja poner en un CHECK sobre una columna con foreign
      // key (T21). El repositorio la vuelve a exigir; acá se atrapa antes para que el
      // mensaje sea del borde y no un error interno.
      throw new BadRequestException(
        'Cada acompañante es un socio del club o un invitado, no las dos cosas ni ninguna.',
      );
    }

    return { socioId, nombre };
  });
}
