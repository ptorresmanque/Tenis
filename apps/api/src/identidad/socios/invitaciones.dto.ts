import { BadRequestException } from '@nestjs/common';

import { DatosInvitacion } from './invitaciones.service';

// El mismo criterio que `registro.dto.ts`: suficiente para descartar lo que
// claramente no es un correo. Lo que prueba que existe es que llegue el enlace.
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LARGO_MAXIMO = 191; // El ancho de las columnas VARCHAR del schema.

/** "AAAA-MM-DD" a fecha civil, medianoche UTC, como `@db.Date`. */
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function leerInvitacion(cuerpo: unknown): DatosInvitacion {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const email = typeof datos.email === 'string' ? datos.email.trim() : '';
  if (!FORMATO_EMAIL.test(email) || email.length > LARGO_MAXIMO) {
    throw new BadRequestException('Escribe un correo válido.');
  }

  const numeroSocio =
    typeof datos.numeroSocio === 'string' ? datos.numeroSocio.trim() : '';
  if (numeroSocio.length > LARGO_MAXIMO) {
    throw new BadRequestException('El número de socio es demasiado largo.');
  }

  return {
    email,
    // Vacío es "que lo ponga el club": el formulario manda el campo aunque nadie
    // lo haya llenado.
    numeroSocio: numeroSocio || undefined,
    alDiaHasta: leerFecha(datos.alDiaHasta),
  };
}

function leerFecha(valor: unknown): Date | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;

  if (typeof valor !== 'string' || !FORMATO_FECHA.test(valor)) {
    throw new BadRequestException(
      'La fecha al día tiene que tener la forma AAAA-MM-DD.',
    );
  }

  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime())) {
    throw new BadRequestException('Esa fecha no existe.');
  }

  return fecha;
}
