import { BadRequestException } from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';
import { fechaDelClub, hoyEnElClub } from '../comun/tiempo';
import { EstadoPartidoInterno } from '../generated/prisma/client';

/** Lo que un socio carga de un partido amistoso. */
export interface PartidoInternoNuevo {
  rivalSocioId: number;
  ganadorSocioId: number;
  marcador: string | null;
  jugadoEn: Date;
}

/**
 * Lee el alta de un partido.
 *
 * **No lleva `socioA`**: ese es quien manda la petición y sale de la sesión. Si
 * viniera en el cuerpo, cualquiera podría cargar partidos a nombre de otro, y todo el
 * mecanismo de la confirmación se caería por ahí.
 */
export function leerPartidoInterno(cuerpo: unknown): PartidoInternoNuevo {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const jugadoEn = leerFecha(datos.jugadoEn);

  // **Un partido del futuro no se jugó.** Cargarlo adelantaría puntos de algo que no
  // pasó, y en una tabla que el Elo recorre por fecha además desordena el cálculo.
  if (jugadoEn.getTime() > hoyEnElClub().getTime()) {
    throw new BadRequestException(
      'Ese partido todavía no se juega: la fecha es posterior a hoy.',
    );
  }

  return {
    rivalSocioId: entero(datos.rivalSocioId, 'El rival', 1),
    ganadorSocioId: entero(datos.ganadorSocioId, 'El ganador', 1),
    marcador:
      typeof datos.marcador === 'string' && datos.marcador.trim() !== ''
        ? datos.marcador.trim().slice(0, 60)
        : null,
    jugadoEn,
  };
}

/**
 * Lee cómo resuelve el admin una disputa.
 *
 * Solo cerrado: `CONFIRMADO` o `RECHAZADO`. **Devolverlo a `PENDIENTE` no es
 * resolver**, es dejarlo esperando una respuesta que el rival ya dio.
 */
export function leerResolucion(cuerpo: unknown): EstadoPartidoInterno {
  const estado = (cuerpo as Record<string, unknown> | null)?.estado;

  if (
    estado !== EstadoPartidoInterno.CONFIRMADO &&
    estado !== EstadoPartidoInterno.RECHAZADO
  ) {
    throw new BadRequestException(
      'Resolver un partido es dejarlo CONFIRMADO o RECHAZADO.',
    );
  }

  return estado;
}

function leerFecha(valor: unknown): Date {
  try {
    return fechaDelClub(typeof valor === 'string' ? valor : '');
  } catch {
    throw new BadRequestException(
      'La fecha en que se jugó se espera con forma AAAA-MM-DD y tiene que existir.',
    );
  }
}
