import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { DatosDelClub } from '../club/club.service';
import { DatosEstructurados, lugarDelClub } from './datos-estructurados';

/**
 * T357 (SPEC-seo.md A8). El club como `SportsActivityLocation` para Google, armado con lo mismo
 * que muestra «El club»: si el club corrige su dirección en el panel, el JSON-LD la sigue.
 */
describe('lugarDelClub', () => {
  const CLUB: DatosDelClub = {
    nombre: 'FEDAL Tennis Center',
    direccion: 'Lircay lt 42, Temuco',
    telefono: '56949214622',
    email: 'contacto@fedal.cl',
    latitud: -38.718408,
    longitud: -72.679571,
    instagram: 'https://www.instagram.com/fedaltenniscenter',
    facebook: 'https://www.facebook.com/fedal',
    tiktok: '',
    youtube: '',
    whatsapp: '56949214622',
    elClubTitulo: 'FEDAL Tennis Center',
    elClubBajada: 'Un club de barrio con canchas de primer nivel.',
    elClubCanchas: '',
    tienda: { descripcion: '', horario: '', whatsapp: '', fotos: [] },
    cafeteria: { descripcion: '', horario: '', whatsapp: '', fotos: [] },
    gimnasio: { descripcion: '', horario: '', whatsapp: '', fotos: [], tarifas: [] },
  };
  const HORARIO = [
    { diaSemana: 0, horaApertura: '09:00', horaCierre: '20:00' },
    { diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' },
  ];

  it('**arma el club con su dirección, su teléfono, su ubicación, su horario y sus redes**', () => {
    expect(lugarDelClub(CLUB, HORARIO)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'SportsActivityLocation',
      '@id': 'https://fedal.cl/#club',
      name: 'FEDAL Tennis Center',
      url: 'https://fedal.cl/',
      logo: 'https://fedal.cl/apple-touch-icon.png',
      image: 'https://fedal.cl/og.jpg',
      description: 'Un club de barrio con canchas de primer nivel.',
      telephone: '+56949214622',
      email: 'contacto@fedal.cl',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Lircay lt 42, Temuco',
        addressLocality: 'Temuco',
        addressRegion: 'La Araucanía',
        addressCountry: 'CL',
      },
      geo: { '@type': 'GeoCoordinates', latitude: -38.718408, longitude: -72.679571 },
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: 'https://schema.org/Sunday',
          opens: '09:00',
          closes: '20:00',
        },
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: 'https://schema.org/Monday',
          opens: '08:00',
          closes: '22:00',
        },
      ],
      sameAs: ['https://www.instagram.com/fedaltenniscenter', 'https://www.facebook.com/fedal'],
    });
  });

  // Google exige la dirección para un negocio local: sin ella, un bloque a medias no sirve.
  it('**sin dirección no publica nada**', () => {
    expect(lugarDelClub({ ...CLUB, direccion: '' }, HORARIO)).toBeNull();
  });

  it('sin coordenadas no hay geo', () => {
    expect(lugarDelClub({ ...CLUB, latitud: null }, HORARIO)).not.toHaveProperty('geo');
  });

  it('sin redes no hay sameAs', () => {
    const sinRedes = { ...CLUB, instagram: '', facebook: '' };
    expect(lugarDelClub(sinRedes, HORARIO)).not.toHaveProperty('sameAs');
  });

  it('sin teléfono, correo, bajada ni horario, esos campos no salen', () => {
    const lugar = lugarDelClub({ ...CLUB, telefono: '', email: '', elClubBajada: '' }, []);

    expect(lugar).not.toHaveProperty('telephone');
    expect(lugar).not.toHaveProperty('email');
    expect(lugar).not.toHaveProperty('description');
    expect(lugar).not.toHaveProperty('openingHoursSpecification');
  });
});

describe('DatosEstructurados', () => {
  const bloques = () => document.head.querySelectorAll('script[type="application/ld+json"]');

  afterEach(() => bloques().forEach((bloque) => bloque.remove()));

  it('escribe un solo bloque por nombre y lo reemplaza', () => {
    const datos = TestBed.inject(DatosEstructurados);

    datos.escribir('club', { name: 'Uno' });
    datos.escribir('club', { name: 'Dos' });

    expect(bloques()).toHaveLength(1);
    expect(JSON.parse(bloques()[0].textContent ?? '')).toEqual({ name: 'Dos' });
  });

  it('con null lo quita', () => {
    const datos = TestBed.inject(DatosEstructurados);

    datos.escribir('club', { name: 'Uno' });
    datos.escribir('club', null);

    expect(bloques()).toHaveLength(0);
  });
});
