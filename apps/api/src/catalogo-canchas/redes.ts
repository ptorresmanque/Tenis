import { BadRequestException } from '@nestjs/common';

import { normalizarTelefono } from '../comun/telefono';

/**
 * Las redes sociales del club (T140): una lista fija, un campo cada una, y vacío es "el
 * club no tiene esa red". WhatsApp va aparte porque es un número y no un enlace.
 */
export const REDES = ['instagram', 'facebook', 'tiktok', 'youtube'] as const;
export type Red = (typeof REDES)[number];

/** Lo que `GET /api/club` publica de las redes, además de los datos de contacto. */
export type RedesDelClub = Record<Red | 'whatsapp', string>;

/** El largo de la columna. */
const LARGO_MAXIMO = 200;

const NOMBRE: Record<Red, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

/**
 * De qué dominios puede ser el enlace de cada red, con sus subdominios (`www.`, `m.`).
 *
 * **Se valida el dominio y no solo que sea un enlace.** El pie de todas las páginas lo
 * publica: un error de tipeo, o una cuenta de admin en malas manos, mandaría a cada
 * visitante a otra parte, y un `javascript:` sería código en el sitio del club.
 */
const DOMINIOS: Record<Red, string[]> = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'],
};

/** El perfil de `@usuario`. Facebook no tiene arrobas: pide el enlace. */
const PERFIL: Partial<Record<Red, (usuario: string) => string>> = {
  instagram: (usuario) => `https://www.instagram.com/${usuario}`,
  tiktok: (usuario) => `https://www.tiktok.com/@${usuario}`,
  youtube: (usuario) => `https://www.youtube.com/@${usuario}`,
};

/** Lo que admiten los nombres de usuario de las tres: letras, números, `.`, `_` y `-`. */
const USUARIO = /^@([\w.-]{1,30})$/;

/**
 * El enlace de una red a partir de lo que el admin pegó: el enlace del perfil, con o sin
 * `https://`, o `@usuario`. Vacío borra la red.
 */
export function leerRed(red: Red, valor: unknown): string {
  if (typeof valor !== 'string') {
    throw new BadRequestException(
      `El enlace de ${NOMBRE[red]} tiene que ser texto.`,
    );
  }

  const limpio = valor.trim();
  if (!limpio) return '';

  const usuario = USUARIO.exec(limpio);
  const perfil = PERFIL[red];
  if (usuario && perfil) return perfil(usuario[1]);

  // `hostname` ya viene en minúscula y en punycode: un dominio parecido no pasa.
  const enlace = aEnlace(limpio);
  const dominio = enlace?.hostname ?? '';

  if (
    !enlace ||
    !DOMINIOS[red].some((d) => dominio === d || dominio.endsWith(`.${d}`))
  ) {
    throw new BadRequestException(
      `El enlace de ${NOMBRE[red]} tiene que ser de ${DOMINIOS[red][0]}, por ejemplo ` +
        (perfil
          ? `${perfil('fedaltennis')} o @fedaltennis.`
          : `https://www.${DOMINIOS[red][0]}/fedaltennis.`),
    );
  }

  if (enlace.pathname.length <= 1) {
    throw new BadRequestException(
      `Pega el enlace del perfil del club en ${NOMBRE[red]}, no solo ${dominio}.`,
    );
  }

  // `http` y `https` de la misma red llevan al mismo perfil: se guarda el seguro.
  enlace.protocol = 'https:';

  if (enlace.href.length > LARGO_MAXIMO) {
    throw new BadRequestException(
      `El enlace de ${NOMBRE[red]} es demasiado largo: pega el del perfil, sin lo que ` +
        'viene después del signo ?.',
    );
  }

  return enlace.href;
}

/**
 * Un enlace `http` o `https`, o nulo. Sin esquema, se le pone `https://`: es como lo
 * copia la barra del navegador del teléfono.
 */
function aEnlace(texto: string): URL | null {
  const conEsquema = /^[a-z][a-z\d+.-]*:/i.test(texto)
    ? texto
    : `https://${texto}`;

  try {
    const enlace = new URL(conEsquema);
    return enlace.protocol === 'https:' || enlace.protocol === 'http:'
      ? enlace
      : null;
  } catch {
    return null;
  }
}

/**
 * El WhatsApp del club: un número con la regla del teléfono (T120), que el sitio enlaza a
 * `wa.me`. Vacío lo borra. El error dice "WhatsApp": el formulario lo muestra arriba del
 * botón y "el teléfono" mandaría a corregir el campo equivocado.
 */
export function leerWhatsapp(valor: unknown): string {
  if (typeof valor !== 'string') {
    throw new BadRequestException('El WhatsApp tiene que ser texto.');
  }

  if (!valor.trim()) return '';

  const numero = normalizarTelefono(valor);

  if (numero === null) {
    throw new BadRequestException(
      'El WhatsApp tiene que tener 9 dígitos, sin contar el +56.',
    );
  }

  return numero;
}
