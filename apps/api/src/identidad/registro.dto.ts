import { BadRequestException } from '@nestjs/common';

export interface DatosRegistro {
  email: string;
  contrasena: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
}

// Suficiente para descartar lo que claramente no es un correo. Validar el formato
// exacto contra la RFC no sirve de nada: lo que prueba que el correo existe es que
// llegue el enlace de verificación.
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LARGO_MAXIMO = 191; // El ancho de las columnas VARCHAR del schema.

function texto(valor: unknown, campo: string, obligatorio = true): string {
  const limpio = typeof valor === 'string' ? valor.trim() : '';

  if (obligatorio && !limpio) {
    throw new BadRequestException(`Falta ${campo}.`);
  }
  if (limpio.length > LARGO_MAXIMO) {
    throw new BadRequestException(
      `Acorta ${campo}: tiene más de ${LARGO_MAXIMO} caracteres.`,
    );
  }

  return limpio;
}

/** El correo de un cuerpo, en minúsculas y sin espacios, como se guarda. */
export function leerCorreo(cuerpo: unknown): string {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const email = texto(datos.email, 'el correo').toLowerCase();
  if (!FORMATO_EMAIL.test(email)) {
    throw new BadRequestException('El correo no tiene un formato válido.');
  }

  return email;
}

/**
 * Valida y normaliza el cuerpo del registro en el borde. Nada de lo que entra por
 * acá se toca sin pasar por esta función.
 *
 * La contraseña se toma tal cual llega: recortarla o normalizarla cambiaría en
 * silencio lo que la persona escribió y después no podría entrar.
 */
export function leerRegistro(cuerpo: unknown): DatosRegistro {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const email = leerCorreo(datos);

  if (typeof datos.contrasena !== 'string' || !datos.contrasena) {
    throw new BadRequestException('Falta la contraseña.');
  }

  return {
    email,
    contrasena: datos.contrasena,
    nombre: texto(datos.nombre, 'el nombre'),
    apellido: texto(datos.apellido, 'el apellido'),
    telefono: texto(datos.telefono, 'el teléfono', false) || null,
  };
}
