import { httpResource } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { DestroyRef, effect, inject, Service } from '@angular/core';

import { Club, DatosDelClub } from '../club/club.service';
import { HorarioDelDia } from '../club/tarifas';
import { TorneoPublico } from '../torneos/torneos.service';

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
    address: direccionPostal(club.direccion),
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

/**
 * Los torneos con inscripción abierta como `SportsEvent` (T358, SPEC-seo.md A8): Google puede
 * mostrarlos como eventos en Temuco, con su fecha y lo que cuesta inscribirse en cada categoría.
 * Sin torneos abiertos no hay bloque.
 */
export function eventosDeTorneos(torneos: TorneoPublico[], club: DatosDelClub): object | null {
  const abiertos = torneos.filter((torneo) => torneo.estado === 'INSCRIPCION');
  if (abiertos.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@graph': abiertos.map((torneo) => ({
      '@type': 'SportsEvent',
      name: torneo.nombre,
      sport: 'Tenis',
      startDate: torneo.fechaInicio,
      endDate: torneo.fechaFin,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      url: `${ORIGEN}/torneos`,
      // El afiche, que es la primera foto de antes y la que muestra el cartel del torneo.
      ...(torneo.afiches[0] && { image: `${ORIGEN}${torneo.afiches[0].imagen}` }),
      location: { '@type': 'Place', name: club.nombre, address: direccionPostal(club.direccion) },
      organizer: { '@type': 'Organization', name: club.nombre, url: `${ORIGEN}/` },
      offers: torneo.categorias.map((categoria) => ({
        '@type': 'Offer',
        name: categoria.categoria,
        price: categoria.montoClp,
        priceCurrency: 'CLP',
        availability: `https://schema.org/${categoria.cuposLibres > 0 ? 'InStock' : 'SoldOut'}`,
        validThrough: torneo.cierreInscripcion,
        url: `${ORIGEN}/torneos/${torneo.id}/inscripcion`,
      })),
    })),
  };
}

/**
 * La dirección del club. Sin la calle, al menos la ciudad: es lo que Google pide del lugar de un
 * evento. La localidad va fija porque el club está en Temuco y el panel guarda una línea sola.
 */
function direccionPostal(direccion: string): object {
  return {
    '@type': 'PostalAddress',
    ...(direccion && { streetAddress: direccion }),
    addressLocality: 'Temuco',
    addressRegion: 'La Araucanía',
    addressCountry: 'CL',
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
 * Escribe el bloque mientras la página esté abierta, al día con lo que lea `armar`, y lo quita al
 * salir. Se llama desde el constructor de la página.
 */
export function publicar(nombre: string, armar: () => object | null): void {
  const datos = inject(DatosEstructurados);
  effect(() => datos.escribir(nombre, armar()));
  inject(DestroyRef).onDestroy(() => datos.escribir(nombre, null));
}

/** El club, en la portada y en «El club». */
export function publicarElClub(): void {
  const club = inject(Club).datos;
  // Solo con dirección: sin ella no hay nada que publicar, y no hace falta el horario.
  const horarios = httpResource<{ general: HorarioDelDia[] }>(() =>
    club().direccion ? '/api/horarios' : undefined,
  );

  publicar('club', () => lugarDelClub(club(), horarios.hasValue() ? horarios.value().general : []));
}
