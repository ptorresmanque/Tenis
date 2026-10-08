/** Lo que hace falta para mostrar dónde está el club y cómo llegar (T101). */
export interface EnlacesDelMapa {
  /** El mapa de OpenStreetMap con el marcador, para el `<iframe>`. */
  incrustado: string;
  googleMaps: string;
  waze: string;
}

/** Unos 400 metros a cada lado del club: se ve la cuadra y las calles para llegar. */
const MARGEN = 0.004;

/**
 * Los enlaces del mapa, o nulo si el club no cargó su ubicación (T100).
 *
 * **El mapa es de OpenStreetMap y no de Google**: un Google Maps incrustado le pasaría
 * a Google la IP de cada visita a "El club", que es justo lo que se sacó con las
 * fuentes (#30). Google Maps y Waze quedan como enlaces: los abre quien quiere.
 *
 * Solo recibe números, así que las URL no pueden llevar nada que no sean coordenadas:
 * por eso `ElClub` puede marcar como confiable el `src` del `<iframe>`.
 */
export function enlacesDelMapa(ubicacion: {
  latitud: number | null;
  longitud: number | null;
}): EnlacesDelMapa | null {
  const { latitud, longitud } = ubicacion;
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return null;

  const [lat, lng] = [latitud as number, longitud as number];
  const n = (valor: number) => valor.toFixed(6);
  const bbox = [lng - MARGEN, lat - MARGEN, lng + MARGEN, lat + MARGEN].map(n).join(',');
  const punto = `${n(lat)},${n(lng)}`;

  return {
    incrustado:
      'https://www.openstreetmap.org/export/embed.html' +
      `?bbox=${bbox}&layer=mapnik&marker=${punto}`,
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${punto}`,
    waze: `https://waze.com/ul?ll=${punto}&navigate=yes`,
  };
}
