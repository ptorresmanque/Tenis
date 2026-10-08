import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BloqueDisponible, Cancha, GrillaDeCancha } from '../disponibilidad';
import { tablaDelDia } from './tabla';

/**
 * T102. La disponibilidad como tabla (opción C, elegida por el club el 2026-10-08): una
 * fila por hora de inicio y una columna por tipo de cancha, con el precio y las libres
 * en cada celda.
 */
describe('tablaDelDia', () => {
  // Las 07:00 del club en agosto: todo lo del día está por venir.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-17T11:00:00.000Z');
  });
  afterEach(() => vi.useRealTimers());

  const cancha = (id: number, techada: boolean): Cancha => ({
    id,
    nombre: `Cancha ${id}`,
    superficie: 'CEMENTO',
    techada,
    iluminacion: true,
  });

  /** 12:00Z son las 08:00 del club; 12:30Z, las 08:30. */
  const bloque = (
    inicio: string,
    parche: Partial<BloqueDisponible> = {},
  ): BloqueDisponible => ({
    inicio,
    fin: new Date(new Date(inicio).getTime() + 60 * 60 * 1000).toISOString(),
    canchaId: 0,
    montoClp: 12000,
    esPico: false,
    bloqueado: false,
    motivoBloqueo: null,
    reservado: false,
    ...parche,
  });
  const OCHO = '2026-08-17T12:00:00.000Z';
  const OCHO_Y_MEDIA = '2026-08-17T12:30:00.000Z';

  const nadieEspecial = {
    reportable: () => false,
    noSeLeVende: (b: BloqueDisponible) => b.montoClp === null,
  };
  const tabla = (grillas: GrillaDeCancha[]) => tablaDelDia(grillas, nadieEspecial);

  it('con canchas solo abiertas hay una columna', () => {
    const t = tabla([
      { cancha: cancha(1, false), bloques: [bloque(OCHO)] },
      { cancha: cancha(2, false), bloques: [bloque(OCHO)] },
    ]);

    expect(t.columnas).toEqual(['abierta']);
  });

  it('**con los dos tipos hay dos columnas, abiertas primero** aunque lleguen después', () => {
    const t = tabla([
      { cancha: cancha(5, true), bloques: [bloque(OCHO)] },
      { cancha: cancha(1, false), bloques: [bloque(OCHO)] },
    ]);

    expect(t.columnas).toEqual(['abierta', 'techada']);
    expect(t.filas[0].celdas.map((c) => c.libres[0].cancha.id)).toEqual([1, 5]);
  });

  it('una fila por inicio, en orden, con cada tipo en su celda', () => {
    const t = tabla([
      { cancha: cancha(1, false), bloques: [bloque(OCHO), bloque(OCHO_Y_MEDIA)] },
      {
        cancha: cancha(5, true),
        bloques: [bloque(OCHO, { montoClp: 15000 }), bloque(OCHO_Y_MEDIA, { montoClp: 15000 })],
      },
    ]);

    expect(t.filas.map((f) => f.inicio)).toEqual([OCHO, OCHO_Y_MEDIA]);
    expect(t.filas[0].celdas.map((c) => c.precio)).toEqual(['$12.000', '$15.000']);
  });

  it('las libres de una celda van en el orden del club: la primera es la que se preelige', () => {
    const t = tabla([
      { cancha: cancha(3, false), bloques: [bloque(OCHO)] },
      { cancha: cancha(1, false), bloques: [bloque(OCHO)] },
    ]);

    expect(t.filas[0].celdas[0].libres.map((l) => l.cancha.id)).toEqual([3, 1]);
  });

  it('si las canchas de un tipo cuestan distinto, la celda dice "desde" el menor', () => {
    const t = tabla([
      { cancha: cancha(1, false), bloques: [bloque(OCHO, { montoClp: 14000 })] },
      { cancha: cancha(2, false), bloques: [bloque(OCHO, { montoClp: 12000 })] },
    ]);

    expect(t.filas[0].celdas[0].precio).toBe('desde $12.000');
  });

  describe('una celda sin libres dice por qué', () => {
    it('llena: todas tomadas', () => {
      const t = tabla([
        { cancha: cancha(1, false), bloques: [bloque(OCHO, { reservado: true })] },
      ]);

      expect(t.filas[0].celdas[0].sinLibres).toBe('llena');
    });

    it('llena también si la toma una clase o un torneo', () => {
      const t = tabla([
        {
          cancha: cancha(1, false),
          bloques: [bloque(OCHO, { bloqueado: true, motivoBloqueo: 'CLASE' })],
        },
        {
          cancha: cancha(2, false),
          bloques: [bloque(OCHO, { bloqueado: true, motivoBloqueo: 'TORNEO' })],
        },
      ]);

      expect(t.filas[0].celdas[0]).toMatchObject({
        sinLibres: 'llena',
        enClase: 1,
        enTorneo: 1,
      });
    });

    it('ya pasó', () => {
      vi.setSystemTime('2026-08-17T12:10:00.000Z');
      const t = tabla([{ cancha: cancha(1, false), bloques: [bloque(OCHO)] }]);

      expect(t.filas[0]).toMatchObject({ yaPaso: true });
      expect(t.filas[0].celdas[0].sinLibres).toBe('ya-paso');
    });

    it('no se arrienda: es la hora y media sin precio para quien no es socio', () => {
      const t = tabla([
        { cancha: cancha(1, false), bloques: [bloque(OCHO, { montoClp: null })] },
      ]);

      expect(t.filas[0].celdas[0].sinLibres).toBe('no-se-arrienda');
      expect(t.filas[0].celdas[0].precio).toBeNull();
    });

    it('cerrada: ese tipo no abre a esa hora, o está todo en mantención', () => {
      const t = tabla([
        { cancha: cancha(1, false), bloques: [bloque(OCHO_Y_MEDIA)] },
        {
          cancha: cancha(5, true),
          bloques: [
            bloque(OCHO, { bloqueado: true, motivoBloqueo: 'MANTENCION' }),
            bloque(OCHO_Y_MEDIA),
          ],
        },
      ]);

      // A las 08:00 las abiertas no abren y las techadas están en mantención.
      expect(t.filas[0].celdas.map((c) => c.sinLibres)).toEqual(['cerrada', 'cerrada']);
      expect(t.filas[0].celdas[1].enMantencion).toBe(1);
    });
  });

  it('el pico se dice por celda, y la fila dice si lo es entera, nada o en parte', () => {
    const t = tabla([
      {
        cancha: cancha(1, false),
        bloques: [bloque(OCHO, { esPico: false }), bloque(OCHO_Y_MEDIA, { esPico: true })],
      },
      {
        cancha: cancha(5, true),
        bloques: [bloque(OCHO, { esPico: true }), bloque(OCHO_Y_MEDIA, { esPico: true })],
      },
    ]);

    expect(t.filas[0].celdas.map((c) => c.esPico)).toEqual([false, true]);
    expect(t.filas[0].pico).toBeNull();
    expect(t.filas[1].pico).toBe(true);
  });

  it('las horas propias que ya pasaron siguen a mano para reportarlas (T35)', () => {
    vi.setSystemTime('2026-08-17T14:00:00.000Z');
    const t = tablaDelDia(
      [{ cancha: cancha(1, false), bloques: [bloque(OCHO, { reservado: true })] }],
      { ...nadieEspecial, reportable: () => true },
    );

    expect(t.filas[0].reportables.map((r) => r.cancha.id)).toEqual([1]);
  });
});
