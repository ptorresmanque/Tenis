import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PartidoPublico } from '../torneos.service';
import { Arbol } from './arbol';

/**
 * T137, con el diseño de la opción B: el cuadro de siempre, como el del mural. Las rondas
 * en columnas con líneas hacia la ronda siguiente, la siembra al lado de cada nombre, los
 * sets de cada uno y, bajo cada partido, el día, la hora y la cancha.
 */
describe('Arbol', () => {
  const partido = (parche: Partial<PartidoPublico>): PartidoPublico => ({
    ronda: 1,
    ronda_nombre: 'Semifinal',
    posicion: 1,
    jugadorA: null,
    jugadorB: null,
    siembraA: null,
    siembraB: null,
    ganador: null,
    marcador: null,
    walkover: false,
    inicio: null,
    fin: null,
    cancha: null,
    ...parche,
  });

  const PARTIDOS: PartidoPublico[] = [
    partido({
      posicion: 1,
      jugadorA: 'Ana Uno',
      jugadorB: 'Beto Dos',
      siembraA: 1,
      ganador: 'Ana Uno',
      marcador: '6-4 6-2',
      // Sábado 5 de diciembre de 2026, 10:00 en Santiago.
      inicio: '2026-12-05T13:00:00.000Z',
      fin: '2026-12-05T14:30:00.000Z',
      cancha: 'Cancha 1',
    }),
    partido({
      posicion: 2,
      jugadorA: 'Carla Tres',
      jugadorB: 'Diego Cuatro',
      siembraB: 2,
      ganador: 'Carla Tres',
      walkover: true,
    }),
    partido({ ronda: 2, ronda_nombre: 'Final', posicion: 1, jugadorA: 'Ana Uno' }),
  ];

  let fixture: ComponentFixture<Arbol>;

  const montar = async (partidos = PARTIDOS, busqueda = '') => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(Arbol);
    fixture.componentRef.setInput('partidos', partidos);
    fixture.componentRef.setInput('busqueda', busqueda);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const columnas = () => [...elemento().querySelectorAll('[data-ronda]')];
  const cajas = () => [...elemento().querySelectorAll<HTMLElement>('[data-partido]')];
  const filas = (caja: HTMLElement) => [...caja.querySelectorAll<HTMLElement>('[data-fila]')];
  const sets = (fila: HTMLElement) =>
    [...fila.querySelectorAll('[data-sets] > span')].map((s) => s.textContent?.trim());
  const limpio = (texto: string | null | undefined) => texto?.replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await montar();
  });

  describe('la forma', () => {
    it('**las rondas van en columnas que se desplazan de lado**, no en una tabla', () => {
      const marco = elemento().querySelector('[data-cuadro]');

      expect(marco?.matches('.overflow-x-auto')).toBe(true);
      expect(marco?.querySelector('table')).toBeNull();
      expect(columnas().map((c) => c.querySelector('h3')?.textContent?.trim())).toEqual([
        'Semifinal',
        'Final',
      ]);
    });

    it('**cada partido es una caja con una fila por jugador**', () => {
      expect(cajas()).toHaveLength(3);
      expect(filas(cajas()[0])).toHaveLength(2);
    });

    it('**las cajas que siguen llevan la línea a la ronda siguiente**; la final no', () => {
      expect(cajas()[0].hasAttribute('data-sigue')).toBe(true);
      expect(cajas()[2].hasAttribute('data-sigue')).toBe(false);
    });
  });

  describe('cada fila', () => {
    it('**la siembra va en su cajita al lado del nombre**, vacía si no tiene', () => {
      const [ana, beto] = filas(cajas()[0]);

      expect(ana.querySelector('[data-siembra]')?.textContent?.trim()).toBe('1');
      expect(beto.querySelector('[data-siembra]')?.textContent?.trim()).toBe('');
    });

    it('**el nombre va abreviado, y el lector oye el completo**', () => {
      const [ana] = filas(cajas()[0]);

      expect(ana.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('A. Uno');
      expect(ana.querySelector('.sr-only')?.textContent).toContain('Ana Uno');
    });

    it('**los sets de cada uno, en su fila**: el marcador va con los del ganador primero', () => {
      const [ana, beto] = filas(cajas()[0]);

      expect(sets(ana)).toEqual(['6', '6']);
      expect(sets(beto)).toEqual(['4', '2']);
    });

    it('**el ganador va en negrita**; el que perdió, en gris', () => {
      // Sin la franja azul de la maqueta: el sitio no marca con franjas al costado.
      const [ana, beto] = filas(cajas()[0]);

      expect(ana.hasAttribute('data-gano')).toBe(true);
      expect(ana.classList).toContain('font-bold');
      expect(beto.classList).toContain('text-muted-foreground');
    });

    it('un marcador que no se puede leer por sets se muestra tal cual', async () => {
      await montar([{ ...PARTIDOS[0], marcador: '6-4 2-0 ret.' }]);

      expect(sets(filas(cajas()[0])[0])).toEqual([]);
      expect(limpio(cajas()[0].querySelector('[data-marcador]')?.textContent)).toBe('6-4 2-0 ret.');
    });

    it('**y uno que no calza con el ganador también**: no se reparte al revés', async () => {
      // Con los del ganador primero, "4-6 2-6" diría que Ana perdió los dos sets.
      await montar([{ ...PARTIDOS[0], marcador: '4-6 2-6' }]);

      expect(sets(filas(cajas()[0])[0])).toEqual([]);
      expect(limpio(cajas()[0].querySelector('[data-marcador]')?.textContent)).toBe('4-6 2-6');
    });

    it('**el walkover lo dice en la fila del que no se presentó**', () => {
      const [, diego] = filas(cajas()[1]);

      expect(diego.textContent).toContain('W.O.');
      expect(diego.textContent).toContain('no se presentó');
    });
  });

  describe('bajo cada partido', () => {
    it('**el día, la hora y la cancha**, como en el mural', () => {
      expect(limpio(cajas()[0].querySelector('[data-cuando]')?.textContent)).toBe(
        'Sáb 10:00 · Cancha 1',
      );
    });

    it('"Por programar" si todavía no se juega ni tiene hora', () => {
      expect(limpio(cajas()[2].querySelector('[data-cuando]')?.textContent)).toBe(
        'Por programar',
      );
    });

    it('nada si ya se jugó sin hora: no hay nada que programar', () => {
      expect(cajas()[1].querySelector('[data-cuando]')).toBeNull();
    });
  });

  describe('los lugares que todavía no se saben', () => {
    it('**dicen de qué partido sale el que llega**: "Ganador S2"', () => {
      const [, segunda] = filas(cajas()[2]);

      expect(segunda.textContent).toContain('Ganador S2');
    });

    it('un hueco de primera ronda es un bye', async () => {
      await montar([partido({ jugadorA: 'Ana Uno', ganador: 'Ana Uno' })]);

      expect(filas(cajas()[0])[1].textContent).toContain('Bye');
    });
  });

  describe('la búsqueda (T137)', () => {
    it('**marca los partidos de quien se busca**', async () => {
      await montar(PARTIDOS, 'carla');

      const marcadas = cajas().filter((c) => c.hasAttribute('data-tuyo'));
      expect(marcadas).toHaveLength(1);
      expect(marcadas[0].querySelector('.bg-accent-soft')?.textContent).toContain('C. Tres');
    });

    it('sin búsqueda no marca nada', () => {
      expect(cajas().some((c) => c.hasAttribute('data-tuyo'))).toBe(false);
    });
  });
});
