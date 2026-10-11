import { BadRequestException } from '@nestjs/common';

import type { DuracionMin } from '../catalogo-canchas/bloques';
import { fechaDelClub } from '../comun/tiempo';
import { AcompananteDeclarado } from './cupo';
import { leerDuracion } from './duracion';
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
    duracionMin: leerDuracion(datos.duracionMin),
    acompanantes: leerAcompanantes(datos.acompanantes),
  };
}

/** A dónde se mueve una reserva. Mismos dos campos, misma validación. */
export function destinoDeCuerpo(cuerpo: unknown): {
  canchaId: number;
  inicio: Date;
  /** Sin ella, mover conserva la que la reserva ya tiene (T87). */
  duracionMin?: DuracionMin;
} {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    canchaId: entero(datos.canchaId, 'La cancha'),
    inicio: instante(datos.inicio),
    // Ausente o nula es "la misma": `leerDuracion` diría 60, y quien solo cambia de cancha
    // una reserva de 1 hora y media la vería acortada.
    duracionMin:
      datos.duracionMin == null ? undefined : leerDuracion(datos.duracionMin),
  };
}

/**
 * La fecha de una consulta de la grilla, "AAAA-MM-DD".
 *
 * Se valida al entrar y no se deja fallar adentro: una fecha ilegible es culpa de quien
 * la pidió, y como error del servicio saldría con un 500 que hace creer que la API está
 * rota. La usan la grilla pública y la de mover (T87).
 */
export function fechaDeConsulta(valor: unknown): string {
  try {
    if (typeof valor !== 'string') throw new Error();
    fechaDelClub(valor);
    return valor;
  } catch {
    throw new BadRequestException(
      'La fecha tiene que existir y tener la forma AAAA-MM-DD.',
    );
  }
}

function entero(valor: unknown, campo: string): number {
  const numero = Number(valor);

  if (!Number.isInteger(numero) || numero <= 0) {
    throw new BadRequestException(`${campo} no es válida.`);
  }

  return numero;
}

function instante(valor: unknown): Date {
  // Solo `string`: convertir con `String()` acepta objetos y arreglos, que llegan como
  // "[object Object]" y hay que descartar igual, pero por un camino menos claro.
  const fecha = new Date(typeof valor === 'string' ? valor : NaN);

  if (Number.isNaN(fecha.getTime())) {
    // Sin este guardia, una fecha inválida sale como 500 y parece que la API está
    // rota; es el mismo arreglo que necesitó la disponibilidad en T12.
    throw new BadRequestException('La hora de inicio no es válida.');
  }

  return fecha;
}

/** En una cancha juegan hasta cuatro: el titular y tres más (T105). */
export const MAXIMO_ACOMPANANTES = 3;

/**
 * Con quién juega el socio, o el titular que anota el mesón: de 0 a 3, cada uno socio
 * o invitado. Que haya al menos uno lo exige el cupo del socio (`SIN_ACOMPANANTE`), no
 * este borde: el mesón puede anotar una hora sin acompañantes (A6 del plan).
 */
export function leerAcompanantes(valor: unknown): AcompananteDeclarado[] {
  if (valor === undefined || valor === null) return [];

  if (!Array.isArray(valor)) {
    throw new BadRequestException(
      'Los acompañantes tienen que venir en una lista.',
    );
  }

  if (valor.length > MAXIMO_ACOMPANANTES) {
    throw new BadRequestException(
      `Puedes declarar hasta ${MAXIMO_ACOMPANANTES} personas.`,
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
