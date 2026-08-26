import { describe, expect, it } from 'vitest';

import { comoIcs } from './calendario';

/**
 * El `.ics` lo lee un programa, no una persona: si el formato se desvía, el
 * calendario descarta el archivo entero sin decir por qué. Estos son los cuatro
 * detalles que lo rompen.
 */
describe('El archivo de calendario', () => {
  const RESERVA = {
    titulo: 'Cancha 3 · FEDAL Tennis Center',
    descripcion: 'Folio FEDAL-2026-004182',
    inicio: '2026-08-21T22:00:00.000Z',
    fin: '2026-08-21T23:00:00.000Z',
    folio: 'FEDAL-2026-004182',
  };

  it('escribe las horas en UTC compacto', () => {
    const ics = comoIcs(RESERVA);

    expect(ics).toContain('DTSTART:20260821T220000Z');
    expect(ics).toContain('DTEND:20260821T230000Z');
  });

  it('separa las líneas con CRLF', () => {
    // Outlook descarta el archivo si vienen con salto simple.
    expect(comoIcs(RESERVA)).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0');
  });

  it('escapa las comas del título', () => {
    // Sin esto, "Cancha 3, techada" entra al calendario partida en dos campos y
    // el evento aparece con el nombre cortado.
    const ics = comoIcs({ ...RESERVA, titulo: 'Cancha 3, techada' });

    expect(ics).toContain('SUMMARY:Cancha 3\\, techada');
  });

  it('el folio hace de identificador del evento', () => {
    // Con un UID estable, volver a descargarlo actualiza el mismo evento en vez
    // de dejar dos horas iguales en el calendario.
    expect(comoIcs(RESERVA)).toContain('UID:FEDAL-2026-004182@fedaltenis.cl');
  });
});
