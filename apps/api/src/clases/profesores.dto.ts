import { BadRequestException } from '@nestjs/common';

/** La ficha completa, como llega del formulario de alta. */
export interface FichaNueva {
  nombreVisible: string;
  telefono: string;
  especialidad: string;
  tarifaHoraClp: number | null;
}

/** Un cambio parcial: lo que no venga, no se toca. */
export type CambioDeFicha = Partial<FichaNueva> & { activo?: boolean };

/**
 * Lee el alta.
 *
 * Los tres textos son obligatorios porque son para lo que la ficha existe: el nombre
 * es cómo se anuncia, el teléfono es por dónde lo llaman cuando una clase se mueve, y
 * la especialidad es lo que el apoderado lee antes de preguntar.
 */
export function leerFichaNueva(cuerpo: unknown): FichaNueva {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    nombreVisible: exigirTexto(
      datos.nombreVisible,
      'nombre con que se anuncia',
    ),
    telefono: exigirTexto(datos.telefono, 'teléfono'),
    especialidad: exigirTexto(datos.especialidad, 'especialidad'),
    tarifaHoraClp: leerTarifa(datos.tarifaHoraClp),
  };
}

/** Lee la edición. Un campo ausente no es un campo vacío: se deja como estaba. */
export function leerCambio(cuerpo: unknown): CambioDeFicha {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambio: CambioDeFicha = {};

  if (datos.nombreVisible !== undefined) {
    cambio.nombreVisible = exigirTexto(
      datos.nombreVisible,
      'nombre con que se anuncia',
    );
  }
  if (datos.telefono !== undefined) {
    cambio.telefono = exigirTexto(datos.telefono, 'teléfono');
  }
  if (datos.especialidad !== undefined) {
    cambio.especialidad = exigirTexto(datos.especialidad, 'especialidad');
  }
  if (datos.tarifaHoraClp !== undefined) {
    cambio.tarifaHoraClp = leerTarifa(datos.tarifaHoraClp);
  }
  if (datos.activo !== undefined) {
    cambio.activo = datos.activo === true;
  }

  return cambio;
}

function exigirTexto(valor: unknown, campo: string): string {
  const texto = typeof valor === 'string' ? valor.trim().slice(0, 120) : '';

  if (texto === '') {
    throw new BadRequestException(`Falta el ${campo}.`);
  }

  return texto;
}

/**
 * La tarifa, o nada.
 *
 * Opcional a propósito: no todos los tratos del club son por hora, y una tarifa
 * inventada en cero se lee después como que se le paga cero.
 */
function leerTarifa(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;

  const tarifa = Number(valor);
  if (!Number.isInteger(tarifa) || tarifa < 0) {
    throw new BadRequestException(
      'La tarifa va en pesos, como un número entero.',
    );
  }

  return tarifa;
}
