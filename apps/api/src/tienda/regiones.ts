/**
 * Las 16 regiones de Chile, para el despacho (T164). **Una lista fija y no texto libre**:
 * Starken cotiza y entrega por región, y "RM", "Stgo" y "Región Metropolitana" son la
 * misma para una persona pero tres para un filtro.
 */
export const REGIONES = [
  'Arica y Parinacota',
  'Tarapacá',
  'Antofagasta',
  'Atacama',
  'Coquimbo',
  'Valparaíso',
  'Metropolitana de Santiago',
  "Libertador General Bernardo O'Higgins",
  'Maule',
  'Ñuble',
  'Biobío',
  'La Araucanía',
  'Los Ríos',
  'Los Lagos',
  'Aysén del General Carlos Ibáñez del Campo',
  'Magallanes y de la Antártica Chilena',
] as const;
