import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { DatosDelClub } from '../club/club.service';
import { TorneoPublico } from '../torneos/torneos.service';
import { DatosEstructurados, eventosDeTorneos, lugarDelClub } from './datos-estructurados';

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

/**
 * T358 (SPEC-seo.md A8). Los torneos con inscripción abierta como `SportsEvent`: Google puede
 * mostrarlos como eventos en Temuco, con su fecha y lo que cuesta inscribirse.
 */
describe('eventosDeTorneos', () => {
  const CLUB = {
    nombre: 'FEDAL Tennis Center',
    direccion: 'Lircay lt 42, Temuco',
  } as DatosDelClub;

  const torneo = (id: number, estado: TorneoPublico['estado']): TorneoPublico => ({
    id,
    nombre: `Campeonato ${id}`,
    superficie: 'CEMENTO',
    fechaInicio: '2026-10-28',
    fechaFin: '2026-11-01',
    cierreInscripcion: '2026-10-26',
    estado,
    categorias: [
      {
        id: 1,
        categoriaJuegoId: 5,
        categoria: '4ª',
        montoClp: 20000,
        cupo: 64,
        cuposLibres: 63,
        armado: false,
      },
      {
        id: 2,
        categoriaJuegoId: 9,
        categoria: 'Honor',
        montoClp: 0,
        cupo: 8,
        cuposLibres: 0,
        armado: false,
      },
    ],
    tours: [],
    afiches: [
      {
        id: 7,
        partidoId: null,
        momento: 'ANTES',
        descripcion: 'Afiche',
        miniatura: '/api/torneos/fotos/7/miniatura',
        imagen: '/api/torneos/fotos/7/imagen',
      },
    ],
  });

  const eventos = (torneos: TorneoPublico[], club = CLUB) =>
    (eventosDeTorneos(torneos, club) as { '@graph': Record<string, unknown>[] } | null)?.['@graph'];

  it('**con dos torneos abiertos y uno cerrado salen dos eventos**', () => {
    const lista = eventos([
      torneo(1, 'INSCRIPCION'),
      torneo(2, 'FINALIZADO'),
      torneo(3, 'INSCRIPCION'),
    ]);

    expect(lista?.map((evento) => evento['name'])).toEqual(['Campeonato 1', 'Campeonato 3']);
  });

  it('**el evento dice cuándo, dónde, el afiche y cuánto cuesta cada categoría**', () => {
    expect(eventos([torneo(1, 'INSCRIPCION')])?.[0]).toEqual({
      '@type': 'SportsEvent',
      name: 'Campeonato 1',
      sport: 'Tenis',
      startDate: '2026-10-28',
      endDate: '2026-11-01',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      url: 'https://fedal.cl/torneos',
      image: 'https://fedal.cl/api/torneos/fotos/7/imagen',
      location: {
        '@type': 'Place',
        name: 'FEDAL Tennis Center',
        address: {
          '@type': 'PostalAddress',
          streetAddress: 'Lircay lt 42, Temuco',
          addressLocality: 'Temuco',
          addressRegion: 'La Araucanía',
          addressCountry: 'CL',
        },
      },
      organizer: { '@type': 'Organization', name: 'FEDAL Tennis Center', url: 'https://fedal.cl/' },
      offers: [
        {
          '@type': 'Offer',
          name: '4ª',
          price: 20000,
          priceCurrency: 'CLP',
          availability: 'https://schema.org/InStock',
          validThrough: '2026-10-26',
          url: 'https://fedal.cl/torneos/1/inscripcion',
        },
        {
          '@type': 'Offer',
          name: 'Honor',
          price: 0,
          priceCurrency: 'CLP',
          availability: 'https://schema.org/SoldOut',
          validThrough: '2026-10-26',
          url: 'https://fedal.cl/torneos/1/inscripcion',
        },
      ],
    });
  });

  it('sin afiche no hay imagen', () => {
    const sinAfiche = { ...torneo(1, 'INSCRIPCION'), afiches: [] };
    expect(eventos([sinAfiche])?.[0]).not.toHaveProperty('image');
  });

  // Google pide la dirección del lugar: sin la calle, al menos la ciudad.
  it('sin la dirección del club, el lugar dice la ciudad', () => {
    const lugar = eventos([torneo(1, 'INSCRIPCION')], { ...CLUB, direccion: '' })?.[0]['location'];

    expect(lugar).toEqual({
      '@type': 'Place',
      name: 'FEDAL Tennis Center',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Temuco',
        addressRegion: 'La Araucanía',
        addressCountry: 'CL',
      },
    });
  });

  it('sin torneos abiertos no publica nada', () => {
    expect(eventosDeTorneos([torneo(1, 'EN_CURSO')], CLUB)).toBeNull();
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
