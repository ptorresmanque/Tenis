import { httpResource } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { DestroyRef, effect, inject, Service } from '@angular/core';

import { Club, DatosDelClub } from '../club/club.service';
import { HorarioDelDia } from '../club/tarifas';

const ORIGEN = 'https://fedal.cl';

/** `diaSemana` como lo guarda la API: 0 es domingo. */
const DIAS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * El club como `SportsActivityLocation` (T357, SPEC-seo.md A8): un negocio local de schema.org,
 * para que Google lo muestre con su dirección, su horario y su teléfono.
 *
 * Sale de lo mismo que muestra «El club», así una corrección en el panel llega sola. **Sin
 * dirección no hay nada:** Google la exige, y un bloque a medias no sirve. Los campos que el club
 * dejó vacíos no salen.
 */
export function lugarDelClub(club: DatosDelClub, horario: HorarioDelDia[]): object | null {
  if (!club.direccion) return null;

  const redes = [club.instagram, club.facebook, club.tiktok, club.youtube].filter(Boolean);

  return {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    '@id': `${ORIGEN}/#club`,
    name: club.nombre,
    url: `${ORIGEN}/`,
    logo: `${ORIGEN}/apple-touch-icon.png`,
    image: `${ORIGEN}/og.jpg`,
    ...(club.elClubBajada && { description: club.elClubBajada }),
    // La API guarda `56` y los 9 dígitos; schema.org lo pide con el `+`.
    ...(club.telefono && { telephone: `+${club.telefono}` }),
    ...(club.email && { email: club.email }),
    address: {
      '@type': 'PostalAddress',
      streetAddress: club.direccion,
      addressLocality: 'Temuco',
      addressRegion: 'La Araucanía',
      addressCountry: 'CL',
    },
    ...(club.latitud !== null &&
      club.longitud !== null && {
        geo: { '@type': 'GeoCoordinates', latitude: club.latitud, longitude: club.longitud },
      }),
    ...(horario.length > 0 && {
      openingHoursSpecification: horario.map((dia) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${DIAS[dia.diaSemana]}`,
        opens: dia.horaApertura,
        closes: dia.horaCierre,
      })),
    }),
    ...(redes.length > 0 && { sameAs: redes }),
  };
}

/** Los bloques JSON-LD del `<head>`, uno por nombre. */
@Service()
export class DatosEstructurados {
  private readonly documento = inject(DOCUMENT);

  /** Escribe el bloque, o lo reemplaza; con `null`, lo quita. */
  escribir(nombre: string, datos: object | null): void {
    const id = `datos-estructurados-${nombre}`;
    this.documento.getElementById(id)?.remove();
    if (datos === null) return;

    const bloque = this.documento.createElement('script');
    bloque.id = id;
    bloque.type = 'application/ld+json';
    bloque.textContent = JSON.stringify(datos);
    this.documento.head.appendChild(bloque);
  }
}

/**
 * Publica el club en el `<head>` mientras la página esté abierta, y lo quita al salir. La llaman
 * la portada y «El club», desde su constructor.
 */
export function publicarElClub(): void {
  const club = inject(Club).datos;
  const datos = inject(DatosEstructurados);
  // Solo con dirección: sin ella no hay nada que publicar, y no hace falta el horario.
  const horarios = httpResource<{ general: HorarioDelDia[] }>(() =>
    club().direccion ? '/api/horarios' : undefined,
  );

  effect(() =>
    datos.escribir(
      'club',
      lugarDelClub(club(), horarios.hasValue() ? horarios.value().general : []),
    ),
  );
  inject(DestroyRef).onDestroy(() => datos.escribir('club', null));
}
