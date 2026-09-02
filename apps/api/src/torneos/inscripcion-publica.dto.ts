import { BadRequestException } from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';
import { type Franja, leerFranjas } from './restricciones';
import { normalizarTelefono } from './telefono';

/**
 * Cómo dice que va a pagar.
 *
 * No es un enum de Prisma porque no se guarda: decide qué exige el servidor en este
 * envío —una imagen adjunta o nada— y a dónde va la persona después. Lo que queda
 * escrito es el `estadoPago` de la inscripción y su `comprobanteRuta`.
 */
export type MedioPago = 'WEBPAY' | 'TRANSFERENCIA';

const MEDIOS: MedioPago[] = ['WEBPAY', 'TRANSFERENCIA'];

/** Lo que escribe quien se inscribe solo, ya validado y normalizado. */
export interface InscripcionPublica {
  nombre: string;
  apellido: string;
  telefono: string;
  procedencia: string;
  categoriaJuegoId: number;
  /**
   * Cómo va a pagar, o nada si el cuadro es gratis.
   *
   * **Se lee acá pero se exige en el servicio**, que es el único que sabe cuánto cobra
   * ese cuadro. Un DTO que lo exigiera siempre rechazaría el torneo de aniversario que
   * el club regala.
   */
  medioPago: MedioPago | null;
  /** Cuándo **no** puede jugar. Vacío es válido: no todos tienen restricciones. */
  restricciones: Franja[];
}

/**
 * Lee el formulario público de inscripción.
 *
 * **Todo lo que llega acá es dato hostil hasta que se valide.** Es un endpoint sin
 * sesión: lo llena un desconocido, y la validación del navegador es una cortesía para
 * quien usa un navegador. Lo que no se compruebe en este archivo no se comprueba.
 *
 * Lo que **no** está acá y es deliberado: el estado del torneo, su fecha de cierre y si
 * la categoría es una de las que corre. Esos tres se leen de la base y nunca del
 * cuerpo, en `InscripcionesATorneo`; un lector de DTO que los aceptara del cliente
 * sería el agujero, no la defensa.
 */
export function leerInscripcionPublica(cuerpo: unknown): InscripcionPublica {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const telefono = normalizarTelefono(datos.telefono);

  if (telefono === null) {
    // El mensaje dice qué se espera y no solo que está mal: quien se equivoca acá es
    // alguien que quiere jugar el torneo, no un atacante.
    throw new BadRequestException(
      'Escribe un teléfono con el que el club te pueda llamar, como +56 9 8765 4321.',
    );
  }

  return {
    nombre: exigir(datos.nombre, 'nombre', 80),
    apellido: exigir(datos.apellido, 'apellido', 80),
    telefono,
    procedencia: exigir(datos.procedencia, 'club o lugar de dónde vienes', 120),
    categoriaJuegoId: entero(numero(datos.categoriaJuegoId), 'La categoría', 1),
    medioPago: leerMedioPago(datos.medioPago),
    restricciones: leerFranjas(comoLista(datos.restricciones)),
  };
}

/**
 * El formulario llega en dos formas y esta función es la costura.
 *
 * Cuando trae el comprobante adjunto viaja como `multipart/form-data`, y ahí **todo
 * campo es texto**: el `7` del selector de categoría llega como `"7"` y las franjas
 * como una cadena JSON. Sin esto, elegir transferencia rechazaría la categoría por no
 * ser un número, que es un mensaje que no le dice nada a quien se está inscribiendo.
 */
function numero(valor: unknown): unknown {
  return typeof valor === 'string' && valor.trim() !== ''
    ? Number(valor)
    : valor;
}

/** Igual que `numero`, para la lista de franjas. Un JSON ilegible es una lista vacía. */
function comoLista(valor: unknown): unknown {
  if (typeof valor !== 'string') return valor;

  try {
    return JSON.parse(valor);
  } catch {
    throw new BadRequestException(
      'No se entendieron los horarios en que no puedes jugar.',
    );
  }
}

/** Nada es válido —el cuadro puede ser gratis—; un valor inventado no. */
function leerMedioPago(valor: unknown): MedioPago | null {
  if (valor === undefined || valor === null || valor === '') return null;

  if (!MEDIOS.includes(valor as MedioPago)) {
    throw new BadRequestException(
      'Elige cómo vas a pagar: con Webpay o transfiriendo.',
    );
  }

  return valor as MedioPago;
}

/**
 * Texto obligatorio, recortado y con un mínimo de dos caracteres.
 *
 * El mínimo importa: sin él, un espacio o una letra suelta pasan como nombre y el club
 * termina con una lista de inscritos que no puede leer ni llamar.
 */
function exigir(valor: unknown, campo: string, largo: number): string {
  const limpio = typeof valor === 'string' ? valor.trim().slice(0, largo) : '';

  if (limpio.length < 2) {
    throw new BadRequestException(`Falta tu ${campo}.`);
  }

  return limpio;
}
