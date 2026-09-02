import { BadRequestException } from '@nestjs/common';

/** Cuándo se sacó la foto respecto del torneo. */
export type Momento = 'ANTES' | 'DURANTE' | 'DESPUES';

const MOMENTOS: Momento[] = ['ANTES', 'DURANTE', 'DESPUES'];

export interface FotoPedida {
  momento: Momento;
  /** Nulo en las generales del torneo. */
  partidoId: number | null;
  descripcion: string | null;
}

/**
 * Lo que acompaña a la imagen.
 *
 * **Viene por `multipart`, así que todo llega como texto**: `partidoId` es la cadena
 * `"12"` y no el número 12. Convertirlo acá y no en el servicio es lo que deja al
 * servicio hablando de partidos y no de formularios.
 */
export function leerFoto(cuerpo: unknown): FotoPedida {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const momento = datos.momento === undefined ? 'DURANTE' : datos.momento;

  if (!MOMENTOS.includes(momento as Momento)) {
    throw new BadRequestException(
      'El momento tiene que ser ANTES, DURANTE o DESPUES.',
    );
  }

  return {
    momento: momento as Momento,
    partidoId: leerPartido(datos.partidoId),
    descripcion: leerDescripcion(datos.descripcion),
  };
}

function leerPartido(valor: unknown): number | null {
  if (valor === undefined || valor === null || valor === '') return null;

  const numero = Number(valor);

  // `Number.isInteger` y no `parseInt`: éste último se traga `"12abc"` y devuelve 12,
  // así que un campo mal escrito colgaría la foto de un partido que nadie eligió.
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new BadRequestException('Ese número de partido no es válido.');
  }

  return numero;
}

function leerDescripcion(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;

  if (typeof valor !== 'string') {
    throw new BadRequestException('El pie de foto tiene que ser texto.');
  }

  const limpia = valor.trim();

  if (limpia.length === 0) return null;

  if (limpia.length > 200) {
    throw new BadRequestException(
      'El pie de foto no puede pasar de 200 letras.',
    );
  }

  return limpia;
}
