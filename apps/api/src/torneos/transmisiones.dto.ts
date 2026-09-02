import { BadRequestException } from '@nestjs/common';

import { entero } from '../catalogo-canchas/admin.dto';
import { esFechaDelClub, instanteEnElClub } from '../comun/tiempo';
import { idDeYoutube } from './youtube';

/** Un live anunciado, ya validado. */
export interface TransmisionPedida {
  canchaId: number;
  youtubeVideoId: string;
  inicio: Date;
  fin: Date;
  titulo: string | null;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Lee lo que el admin pegó.
 *
 * **Del enlace solo sobrevive el id.** Ese valor termina dentro del `src` de un
 * `iframe`; guardar el texto completo sería dejar que un campo de formulario decida qué
 * sitio se carga dentro del nuestro. Ver `youtube.ts`.
 */
export function leerTransmision(cuerpo: unknown): TransmisionPedida {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const youtubeVideoId = idDeYoutube(datos.enlace);

  if (youtubeVideoId === null) {
    // El mensaje dice qué se esperaba: quien se equivoca acá es el club pegando un
    // enlace, no un atacante.
    throw new BadRequestException(
      'Pega el enlace del video de YouTube, como https://youtu.be/dQw4w9WgXcQ.',
    );
  }

  const fecha = typeof datos.fecha === 'string' ? datos.fecha : '';

  if (!esFechaDelClub(fecha)) {
    throw new BadRequestException(
      'La fecha se espera con forma AAAA-MM-DD y tiene que existir.',
    );
  }

  const horaDesde = hora(datos.horaDesde);
  const horaHasta = hora(datos.horaHasta);

  if (horaDesde >= horaHasta) {
    throw new BadRequestException('La transmisión termina antes de empezar.');
  }

  return {
    canchaId: entero(datos.canchaId, 'La cancha', 1),
    youtubeVideoId,
    // Los instantes los calcula el servidor con la zona del club, como la programación
    // de un partido: un instante que manda el navegador trae la zona de quien lo mandó.
    inicio: instanteEnElClub(fecha, horaDesde),
    fin: instanteEnElClub(fecha, horaHasta),
    titulo:
      typeof datos.titulo === 'string' && datos.titulo.trim()
        ? datos.titulo.trim().slice(0, 120)
        : null,
  };
}

function hora(valor: unknown): string {
  if (typeof valor !== 'string' || !HORA.test(valor)) {
    throw new BadRequestException(
      'Las horas se escriben como HH:MM, entre 00:00 y 23:59.',
    );
  }

  return valor;
}
