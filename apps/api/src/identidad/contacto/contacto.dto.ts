import { BadRequestException } from '@nestjs/common';

import { EstadoSolicitud, TipoSolicitud } from '../../generated/prisma/client';
import type { SolicitudNueva } from './contacto.service';

// El mismo criterio que el resto del proyecto: suficiente para descartar lo que
// claramente no es un correo. Lo que prueba que existe es que alguien conteste.
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lo que llega del formulario público.
 *
 * **Es la única entrada sin sesión de este módulo**, así que valida más que las
 * otras: lo que entre acá lo escribió alguien de quien no sabemos nada.
 */
export function leerSolicitud(cuerpo: unknown): SolicitudNueva {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const tipos = Object.values(TipoSolicitud) as string[];
  if (typeof datos.tipo !== 'string' || !tipos.includes(datos.tipo)) {
    throw new BadRequestException('Elige de qué se trata tu consulta.');
  }

  const nombre = texto(datos.nombre, 120);
  if (nombre === '') {
    throw new BadRequestException('Escribe tu nombre.');
  }

  const email = texto(datos.email, 160).toLowerCase();
  const telefono = texto(datos.telefono, 40);

  // **Uno de los dos, obligatorio.** Una solicitud sin forma de contestar ocupa la
  // bandeja del club como si se pudiera atender, y a la persona la deja esperando una
  // respuesta que no tiene por dónde llegar.
  if (email === '' && telefono === '') {
    throw new BadRequestException(
      'Deja un correo o un teléfono, o el club no va a poder contestarte.',
    );
  }

  if (email !== '' && !FORMATO_EMAIL.test(email)) {
    throw new BadRequestException('Ese correo no se ve bien escrito.');
  }

  const mensaje = texto(datos.mensaje, 1000);

  return {
    tipo: datos.tipo as TipoSolicitud,
    nombre,
    email,
    telefono,
    mensaje: mensaje || null,
  };
}

/** Cómo se resuelve una solicitud desde la bandeja. */
export function leerResolucion(cuerpo: unknown): {
  estado: EstadoSolicitud;
  nota: string | null;
} {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const estados = Object.values(EstadoSolicitud) as string[];
  if (typeof datos.estado !== 'string' || !estados.includes(datos.estado)) {
    throw new BadRequestException(
      `El estado tiene que ser uno de: ${estados.join(', ')}.`,
    );
  }

  return {
    estado: datos.estado as EstadoSolicitud,
    nota: texto(datos.nota, 500) || null,
  };
}

/** Los filtros de la bandeja. Lo que no venga, no filtra. */
export function leerFiltros(consulta: { estado?: string; tipo?: string }): {
  estado?: EstadoSolicitud;
  tipo?: TipoSolicitud;
} {
  const estados = Object.values(EstadoSolicitud) as string[];
  const tipos = Object.values(TipoSolicitud) as string[];

  return {
    estado:
      consulta.estado && estados.includes(consulta.estado)
        ? (consulta.estado as EstadoSolicitud)
        : undefined,
    tipo:
      consulta.tipo && tipos.includes(consulta.tipo)
        ? (consulta.tipo as TipoSolicitud)
        : undefined,
  };
}

/**
 * El campo como texto recortado, o vacío.
 *
 * Se recorta y no se rechaza por largo, al revés que el resto de los DTO del
 * proyecto: acá escribe alguien de afuera que no va a volver a intentarlo si le
 * decimos que su mensaje es muy largo. Lo que no cabe en la columna se pierde; lo que
 * importa —quién es y cómo contestarle— entra sobrado.
 */
function texto(valor: unknown, largo: number): string {
  return typeof valor === 'string' ? valor.trim().slice(0, largo) : '';
}
