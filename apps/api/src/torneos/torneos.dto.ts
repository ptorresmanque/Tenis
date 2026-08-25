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

  const { fechaInicio, fechaFin, cierreInscripcion } = leerFechas(datos);

  return {
    nombre: exigirTexto(datos.nombre, 'nombre del torneo', 120),
    categoriaId: entero(datos.categoriaId, 'La categoría', 1),
    superficie: leerSuperficie(datos.superficie),
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
  if (datos.superficie !== undefined) {
    cambio.superficie = leerSuperficie(datos.superficie);
  }

  // **Las tres fechas se cambian juntas o no se cambian.** Comprobar una contra las
  // que ya están guardadas deja llegar a un torneo que termina antes de empezar en
  // dos pasos que por separado se ven bien.
  if (
    datos.fechaInicio !== undefined ||
    datos.fechaFin !== undefined ||
    datos.cierreInscripcion !== undefined
  ) {
    Object.assign(cambio, leerFechas(datos));
  }

  return cambio;
}

/** Lee una categoría por cambiar. Desactivarla no obliga a repetir sus puntos. */
export function leerCambioDeCategoria(
  cuerpo: unknown,
): Partial<CategoriaNueva> & { activa?: boolean } {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambio: Partial<CategoriaNueva> & { activa?: boolean } = {};

  if (datos.nombre !== undefined) {
    cambio.nombre = exigirTexto(datos.nombre, 'nombre de la categoría', 80);
  }
  if (datos.puntosCampeon !== undefined) {
    cambio.puntosCampeon = entero(
      datos.puntosCampeon,
      'Los puntos del campeón',
      1,
      10000,
    );
  }
  if (datos.activa !== undefined) {
    cambio.activa = datos.activa === true;
  }

  return cambio;
}

/**
 * Las tres fechas de un torneo, comprobadas entre sí.
 *
 * Sale acá y no dentro de `leerTorneo` porque la edición necesita la misma
 * comprobación: reusar el lector completo obligaba a inventarle un nombre y una
 * categoría al cuerpo para pasar por validaciones que no eran las suyas.
 */
function leerFechas(datos: Record<string, unknown>): {
  fechaInicio: Date;
  fechaFin: Date;
  cierreInscripcion: Date;
} {
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

  return { fechaInicio, fechaFin, cierreInscripcion };
}

/** La superficie del cuerpo, o nada: es informativa y el club puede no saberla. */
function leerSuperficie(valor: unknown): Superficie | null {
  const superficies = Object.values(Superficie) as string[];

  return typeof valor === 'string' && superficies.includes(valor)
    ? (valor as Superficie)
    : null;
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

/**
 * Lee a quién se inscribe: un jugador que ya existe, o un socio por su ficha.
 *
 * Con el socio, el servidor le crea o le reutiliza su jugador. Es la comodidad que
 * evita que el club tenga que pasar por la pantalla de jugadores para inscribir a
 * alguien que ya está en el padrón.
 */
export function leerInscripcionATorneo(cuerpo: unknown): {
  jugadorId?: number;
  socioId?: number;
} {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  if (datos.jugadorId !== undefined && datos.jugadorId !== null) {
    return { jugadorId: entero(datos.jugadorId, 'El jugador', 1) };
  }

  if (datos.socioId !== undefined && datos.socioId !== null) {
    return { socioId: entero(datos.socioId, 'El socio', 1) };
  }

  throw new BadRequestException(
    'Dinos a quién se inscribe: un jugador o un socio del club.',
  );
}
