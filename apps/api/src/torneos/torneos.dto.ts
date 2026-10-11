import { BadRequestException } from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';
import { leerTelefono } from '../comun/telefono';
import { fechaDelClub } from '../comun/tiempo';
import { leerCorreo } from '../identidad/registro.dto';
import { MedioPagoInscripcion, Superficie } from '../generated/prisma/client';

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

// La categoría de **juego** —el nivel del jugador, 5ª … Honor— se lee en
// `categorias-juego.dto.ts`. Está aparte a propósito: sus dos lectores tienen forma
// casi idéntica a `leerCategoria` y `leerCambioDeCategoria` de acá abajo, que leen otra
// cosa, y juntos son cuatro funciones parecidas entre las que es fácil equivocarse.

export interface TorneoNuevo {
  nombre: string;
  superficie: Superficie | null;
  fechaInicio: Date;
  fechaFin: Date;
  cierreInscripcion: Date;
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
    telefono: leerTelefono(datos.telefono, { obligatorio: false }),
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
    cambio.telefono = leerTelefono(datos.telefono, { obligatorio: false });
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
      'El puntaje del campeón',
      1,
      10000,
    ),
  };
}

/**
 * Lee un torneo.
 *
 * **Sin `cupo` desde T62**: el cupo es de cada cuadro y se define al agregarle su
 * categoría, porque Honor cierra con 8 y la 4ª con 32.
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
    superficie: leerSuperficie(datos.superficie),
    fechaInicio,
    fechaFin,
    cierreInscripcion,
  };
}

/** Los cambios de un torneo son los mismos campos, todos opcionales. */
export function leerCambioDeTorneo(cuerpo: unknown): Partial<TorneoNuevo> {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambio: Partial<TorneoNuevo> = {};

  if (datos.nombre !== undefined) {
    cambio.nombre = exigirTexto(datos.nombre, 'nombre del torneo', 120);
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
      'El puntaje del campeón',
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

/**
 * Recorta y exige. Exportada porque `categorias-juego.dto.ts` la usa.
 *
 * Se comparte en vez de copiarse: el repo ya arrastra seis `texto` privados casi
 * iguales en otros tantos DTOs, y una séptima copia normaliza esa deriva en vez de
 * frenarla. Unificar las seis es otra tarea, no esta.
 */
export function exigirTexto(valor: unknown, campo: string, largo = 80): string {
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
 *
 * **El correo se pide pero no se exige** (T127): el que se anota en el mesón puede no
 * tener uno. Si viene, se valida como el de la inscripción pública.
 */
export function leerInscripcionATorneo(cuerpo: unknown): {
  jugadorId?: number;
  socioId?: number;
  email: string | null;
} {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const sinCorreo =
    datos.email === undefined ||
    datos.email === null ||
    (typeof datos.email === 'string' && datos.email.trim() === '');
  const email = sinCorreo ? null : leerCorreo(datos);

  if (datos.jugadorId !== undefined && datos.jugadorId !== null) {
    return { jugadorId: entero(datos.jugadorId, 'El jugador', 1), email };
  }

  if (datos.socioId !== undefined && datos.socioId !== null) {
    return { socioId: entero(datos.socioId, 'El socio', 1), email };
  }

  throw new BadRequestException(
    'Dinos a quién se inscribe: un jugador o un socio del club.',
  );
}

/**
 * Lee la siembra. `null` es quitarla.
 *
 * El tope es el mismo del cupo: sembrar al 300 de un torneo de 16 es un dato mal
 * escrito, y el cuadro no tendría dónde ponerlo.
 */
export function leerSiembra(cuerpo: unknown): number | null {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  if (datos.siembra === null || datos.siembra === undefined) return null;

  return entero(datos.siembra, 'La siembra', 1, 256);
}

/**
 * Lee un resultado.
 *
 * El marcador es texto libre y puede faltar: en un walkover no hay marcador que
 * escribir, y obligar a inventar uno es pedirle al club que mienta en el cuadro.
 */
export function leerResultado(cuerpo: unknown): {
  ganadorId: number;
  marcador: string | null;
  walkover: boolean;
} {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    ganadorId: entero(datos.ganadorId, 'El ganador', 1),
    marcador: texto(datos.marcador, 60) || null,
    walkover: datos.walkover === true,
  };
}

/**
 * Cómo dice el club que se pagó una inscripción, al aprobarla.
 *
 * **Opcional**: aprobar el comprobante de una transferencia que la persona ya declaró
 * no tiene por qué repetir el medio, y sobreescribirlo con un valor por omisión sería
 * perder el dato. Lo que no se acepta es un valor inventado — la caja del club se
 * cuadra con esta columna.
 */
export function leerMedioDePago(cuerpo: unknown): MedioPagoInscripcion | null {
  const valor = ((cuerpo ?? {}) as Record<string, unknown>).medioPago;

  if (valor === undefined || valor === null || valor === '') return null;

  const medios = Object.values(MedioPagoInscripcion) as string[];

  if (typeof valor !== 'string' || !medios.includes(valor)) {
    throw new BadRequestException(
      `El medio de pago tiene que ser uno de: ${medios.join(', ')}.`,
    );
  }

  return valor as MedioPagoInscripcion;
}
