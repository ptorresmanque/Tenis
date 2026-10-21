import { describe, expect, it } from 'vitest';

import {
  duracionCorta,
  etiquetaDeLaDuracion,
  etiquetaDelFiltro,
  filtroCorto,
} from './controles-del-dia';

/** Los nombres de la línea de lo elegido (T348, N4): cortos a la vista y completos para el lector. */
describe('los nombres cortos de lo elegido', () => {
  it.each([
    ['todas', 'Todas', 'Todas'],
    ['techadas', 'Techadas', 'Techadas'],
    ['iluminacion', 'Con luz', 'Con iluminación'],
    ['aire-libre', 'Aire libre', 'Al aire libre'],
  ])('el filtro «%s» se ve «%s» y se lee «%s»', (valor, corto, completo) => {
    expect(filtroCorto(valor)).toBe(corto);
    expect(etiquetaDelFiltro(valor)).toBe(completo);
  });

  it.each([
    [60, '1 hora', '1 hora'],
    [90, '1 h y media', '1 hora y media'],
  ] as const)('la duración de %i minutos se ve «%s» y se lee «%s»', (minutos, corta, completa) => {
    expect(duracionCorta(minutos)).toBe(corta);
    expect(etiquetaDeLaDuracion(minutos)).toBe(completa);
  });
});
