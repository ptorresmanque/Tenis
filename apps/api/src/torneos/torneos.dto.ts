import { BadRequestException } from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';
import { fechaDelClub } from '../comun/tiempo';
import { Superficie } from '../generated/prisma/client';

/** Un jugador nuevo: el socio por su ficha, o alguien de afuera por su nombre. */
export interface JugadorNuevo {
  socioId: number | null;
  nombre: string;
  apellido: string;
  telefono: string | null;
}

/** Lo que se le puede cambiar a un jugador, incluido enlazarlo a una ficha. */
export interface CambioDeJugador {
  nombre?: string;
  apellido?: string;
  telefono?: string | null;
  socioId?: number;
  activo?: boolean;
}

export interface CategoriaNueva {
  nombre: string;
  puntosCampeon: number;
}

export interface TorneoNuevo {
  nombre: string;
  categoriaId: number;
  superficie: Superficie | null;
  fechaInicio: Date;
  fechaFin: Date;
  cierreInscripcion: Date;
  cupo: number;
}

/**
 * Lee el alta de un jugador.
 *
 * Con `socioId` no se piden nombre ni apellido: salen de su ficha y se copian al
 * crear, porque el jugador tiene que poder existir aunque la ficha se dé de baja. Sin
 * `socioId` es alguien de afuera y el nombre es obligatorio: es todo lo que lo
 * identifica en una tabla que ordena personas.
 */
export function leerJugadorNuevo(
  cuerpo: unknown,
): JugadorNuevo | { socioId: number } {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  if (datos.socioId !== undefined && datos.socioId !== null) {
    return { socioId: entero(datos.socioId, 'El socio', 1) };
  }

  return {
    socioId: null,
    nombre: exigirTexto(datos.nombre, 'nombre'),
    apellido: exigirTexto(datos.apellido, 'apellido'),
    telefono: texto(datos.telefono, 40) || null,
  };
}

export function leerCambioDeJugador(cuerpo: unknown): CambioDeJugador {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambio: CambioDeJugador = {};

  if (datos.nombre !== undefined) {
    cambio.nombre = exigirTexto(datos.nombre, 'nombre');
  }
  if (datos.apellido !== undefined) {
    cambio.apellido = exigirTexto(datos.apellido, 'apellido');
  }
  if (datos.telefono !== undefined) {
    cambio.telefono = texto(datos.telefono, 40) || null;
  }
  if (datos.socioId !== undefined && datos.socioId !== null) {
    cambio.socioId = entero(datos.socioId, 'El socio', 1);
  }
  if (datos.activo !== undefined) {
    cambio.activo = datos.activo === true;
  }

  return cambio;
}

/** Lee una categoría. Los puntos del campeón son su razón de ser. */
export function leerCategoria(cuerpo: unknown): CategoriaNueva {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    nombre: exigirTexto(datos.nombre, 'nombre de la categoría', 80),
    // De acá salen los de cada ronda, así que un cero deja un torneo que no reparte
    // nada y una tabla que no se mueve.
    puntosCampeon: entero(
      datos.puntosCampeon,
      'Los puntos del campeón',
      1,
      10000,
    ),
  };
}

/**
 * Lee un torneo.
 *
 * **Las tres fechas se comprueban entre sí**: un torneo que termina antes de empezar
 * no se puede jugar, y una inscripción que cierra después del comienzo es aceptar
 * gente para un cuadro que ya se está jugando.
 */
export function leerTorneo(cuerpo: unknown): TorneoNuevo {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const fechaInicio = fecha(datos.fechaInicio, 'de inicio');
  const fechaFin = fecha(datos.fechaFin, 'de término');
  const cierreInscripcion = fecha(
    datos.cierreInscripcion,
    'de cierre de inscripción',
  );

  if (fechaFin < fechaInicio) {
    throw new BadRequestException(
      'El torneo no puede terminar antes de empezar.',
    );
  }

  if (cierreInscripcion > fechaInicio) {
    throw new BadRequestException(
      'La inscripción tiene que cerrar antes de que el torneo empiece.',
    );
  }

  const superficies = Object.values(Superficie) as string[];
  const superficie =
    typeof datos.superficie === 'string' &&
    superficies.includes(datos.superficie)
      ? (datos.superficie as Superficie)
      : null;

  return {
    nombre: exigirTexto(datos.nombre, 'nombre del torneo', 120),
    categoriaId: entero(datos.categoriaId, 'La categoría', 1),
    superficie,
    fechaInicio,
    fechaFin,
    cierreInscripcion,
    // Sin tope de potencia de dos: el cuadro se redondea hacia arriba con byes, y
    // exigirlo obligaría al club a saber de potencias de dos para inscribir.
    cupo: entero(datos.cupo, 'El cupo', 2, 256),
  };
}

/** Los cambios de un torneo son los mismos campos, todos opcionales. */
export function leerCambioDeTorneo(cuerpo: unknown): Partial<TorneoNuevo> {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambio: Partial<TorneoNuevo> = {};

  if (datos.nombre !== undefined) {
    cambio.nombre = exigirTexto(datos.nombre, 'nombre del torneo', 120);
  }
  if (datos.cupo !== undefined) {
    cambio.cupo = entero(datos.cupo, 'El cupo', 2, 256);
  }
  if (datos.categoriaId !== undefined) {
    cambio.categoriaId = entero(datos.categoriaId, 'La categoría', 1);
  }

  // Las fechas se cambian juntas o no se cambian: comprobarlas de a una contra las
  // que ya están guardadas es la forma de dejar un torneo que termina antes de
  // empezar en dos pasos que por separado se ven bien.
  if (
    datos.fechaInicio !== undefined ||
    datos.fechaFin !== undefined ||
    datos.cierreInscripcion !== undefined
  ) {
    const completo = leerTorneo({
      ...datos,
      nombre: datos.nombre ?? 'x',
      categoriaId: datos.categoriaId ?? 1,
      cupo: datos.cupo ?? 2,
    });

    cambio.fechaInicio = completo.fechaInicio;
    cambio.fechaFin = completo.fechaFin;
    cambio.cierreInscripcion = completo.cierreInscripcion;
    cambio.superficie = completo.superficie;
  }

  return cambio;
}

function fecha(valor: unknown, campo: string): Date {
  try {
    return fechaDelClub(typeof valor === 'string' ? valor : '');
  } catch {
    throw new BadRequestException(
      `La fecha ${campo} se espera con forma AAAA-MM-DD y tiene que existir.`,
    );
  }
}

function exigirTexto(valor: unknown, campo: string, largo = 80): string {
  const limpio = texto(valor, largo);

  if (limpio === '') throw new BadRequestException(`Falta el ${campo}.`);

  return limpio;
}

function texto(valor: unknown, largo: number): string {
  return typeof valor === 'string' ? valor.trim().slice(0, largo) : '';
}
