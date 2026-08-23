import { describe, expect, it } from 'vitest';

import {
  diaEnPalabras,
  enPesos,
  fechaEnElClub,
  horaEnElClub,
  hoyEnElClub,
  proximosDias,
} from './reloj-del-club';

/**
 * La grilla llega en UTC y se muestra en la hora del club. Formatearla con la
 * zona del navegador haría que el mismo bloque se lea distinto según dónde esté
 * el socio, y con un desfase fijo se leería mal medio año.
 */
describe('reloj del club', () => {
  it('muestra la hora de Santiago, no la del navegador', () => {
    // 12:00Z en agosto son las 08:00 en el club.
    expect(horaEnElClub('2026-08-17T12:00:00.000Z')).toBe('08:00');
  });

  it('en verano el mismo instante es otra hora', () => {
    // En enero Chile está en UTC-3: las 12:00Z son las 09:00.
    expect(horaEnElClub('2026-01-15T12:00:00.000Z')).toBe('09:00');
  });

  it('el domingo que Chile cambia la hora muestra la del club', () => {
    // 5 de abril, ya en UTC-4: las 13:00Z son las 09:00.
    expect(horaEnElClub('2026-04-05T13:00:00.000Z')).toBe('09:00');
    // 6 de septiembre, ya en UTC-3: las 13:00Z son las 10:00.
    expect(horaEnElClub('2026-09-06T13:00:00.000Z')).toBe('10:00');
  });

  it('hoy es el día del club, aunque en UTC ya sea mañana', () => {
    // Las 22:00 del 17 en Santiago son las 02:00 del 18 en UTC. Sin la zona, la
    // grilla saltaría al día siguiente cada noche a las nueve.
    expect(hoyEnElClub(new Date('2026-08-18T02:00:00.000Z'))).toBe('2026-08-17');
  });

  it('fecha un instante en el día del club, no en el de UTC', () => {
    // Las 22:00 de un lunes en Santiago son las 02:00 del martes en UTC. Cortar
    // el ISO daría martes: un día más que el que la persona escribió.
    expect(fechaEnElClub('2026-08-18T02:00:00.000Z')).toBe('2026-08-17');
  });

  it('nombra el día sin correrlo al anterior', () => {
    // Leer la fecha a medianoche UTC daría el día anterior en Santiago, y el
    // encabezado diría un día distinto del que muestra la grilla.
    expect(diaEnPalabras('2026-08-17')).toContain('lunes');
    expect(diaEnPalabras('2026-08-17')).toContain('17');
  });

  it('escribe los montos en pesos chilenos, sin decimales', () => {
    // Sin espacios: según la versión de ICU el símbolo va pegado o separado por
    // un espacio duro, y no es eso lo que este test tiene que fijar.
    expect(enPesos(12000).replace(/\s/g, '')).toBe('$12.000');
  });
});

describe('La tira de días', () => {
  it('empieza en hoy y los dos primeros se llaman por su nombre', () => {
    const dias = proximosDias(7, new Date('2026-08-21T15:00:00.000Z'));

    expect(dias).toHaveLength(7);
    expect(dias[0]).toMatchObject({ fecha: '2026-08-21', etiqueta: 'Hoy', numero: '21' });
    expect(dias[1]).toMatchObject({ fecha: '2026-08-22', etiqueta: 'Mañana' });
    expect(dias[2].etiqueta).toBe('dom');
  });

  it('cruza el fin de mes sin inventar un día 32', () => {
    const dias = proximosDias(3, new Date('2026-08-30T15:00:00.000Z'));

    expect(dias.map((d) => d.fecha)).toEqual(['2026-08-30', '2026-08-31', '2026-09-01']);
  });

  it('el domingo que Chile adelanta la hora no se salta un día', () => {
    // El cambio es a medianoche del primer domingo de septiembre: ese día tiene
    // 23 horas, y una tira que sumara 24 se saltaría el lunes.
    const dias = proximosDias(3, new Date('2026-09-05T15:00:00.000Z'));

    expect(dias.map((d) => d.fecha)).toEqual(['2026-09-05', '2026-09-06', '2026-09-07']);
  });
});
