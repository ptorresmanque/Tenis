import { describe, expect, it } from 'vitest';

import { enlacesDelMapa } from './mapa';

/**
 * T101. El mapa de "El club" es de OpenStreetMap y no de Google: cargarlo no le pasa a
 * nadie la IP de quien mira (lo mismo que se hizo con las fuentes en #30). Google Maps
 * y Waze quedan como enlaces que la persona elige abrir.
 */
describe('enlacesDelMapa', () => {
  const FEDAL = { latitud: -33.4372, longitud: -70.6506 };

  it('sin ubicación no hay mapa', () => {
    expect(enlacesDelMapa({ latitud: null, longitud: null })).toBeNull();
  });

  it('el mapa es el de OpenStreetMap, con el marcador en el club', () => {
    const mapa = enlacesDelMapa(FEDAL)!;

    expect(mapa.incrustado).toMatch(/^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/);
    expect(mapa.incrustado).toContain('marker=-33.437200,-70.650600');
    expect(mapa.incrustado).not.toContain('google');
  });

  it('la vista rodea al club: unos cuatrocientos metros a cada lado', () => {
    const bbox = new URL(enlacesDelMapa(FEDAL)!.incrustado).searchParams.get('bbox');

    expect(bbox).toBe('-70.654600,-33.441200,-70.646600,-33.433200');
  });

  it('cómo llegar, en Google Maps y en Waze, con el destino en el club', () => {
    const mapa = enlacesDelMapa(FEDAL)!;

    expect(mapa.googleMaps).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-33.437200,-70.650600',
    );
    expect(mapa.waze).toBe('https://waze.com/ul?ll=-33.437200,-70.650600&navigate=yes');
  });
});
