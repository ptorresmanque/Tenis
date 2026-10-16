import { describe, expect, it } from 'vitest';

import { aceptaInscripciones, TorneoPublico } from './torneos.service';

/**
 * T321. Si un torneo acepta inscripciones, con la regla de la API (`inscripciones.service.ts`):
 * en estado de inscripción y sin que haya pasado su último día en el club. La usan la portada,
 * Torneos y la página de la inscripción, para que ninguna ofrezca lo que el servidor rechaza.
 */
describe('aceptaInscripciones', () => {
  const TORNEO = {
    estado: 'INSCRIPCION',
    cierreInscripcion: '2026-10-15',
  } as TorneoPublico;

  it('**el último día cuenta entero**, hasta la medianoche del club', () => {
    expect(aceptaInscripciones(TORNEO, new Date('2026-10-15T23:30:00-03:00'))).toBe(true);
  });

  it('**al día siguiente ya no**, aunque el estado siga en inscripción', () => {
    expect(aceptaInscripciones(TORNEO, new Date('2026-10-16T00:30:00-03:00'))).toBe(false);
  });

  it('con el cuadro armado, tampoco', () => {
    const armado = { ...TORNEO, estado: 'CUADRO_ARMADO' } as TorneoPublico;
    expect(aceptaInscripciones(armado, new Date('2026-10-01T12:00:00-03:00'))).toBe(false);
  });
});
