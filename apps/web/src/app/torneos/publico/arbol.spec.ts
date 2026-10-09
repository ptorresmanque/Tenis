import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PartidoPublico } from '../torneos.service';
import { Arbol } from './arbol';

/**
 * T137. El árbol del cuadro, en la segunda pestaña: las rondas en columnas con los
 * ganadores avanzando, y la cancha y la hora bajo cada partido. En el teléfono se desliza
 * hacia el costado.
 */
describe('Arbol', () => {
  const partido = (parche: Partial<PartidoPublico>): PartidoPublico => ({
    ronda: 1,
    ronda_nombre: 'Semifinal',
    posicion: 1,
    jugadorA: null,
    jugadorB: null,
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
      ganador: 'Carla Tres',
      walkover: true,
    }),
    partido({
      ronda: 2,
      ronda_nombre: 'Final',
      posicion: 1,
      jugadorA: 'Ana Uno',
      jugadorB: 'Carla Tres',
    }),
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

  beforeEach(async () => {
    await montar();
  });

  it('**las rondas van en columnas que se desplazan de lado**, no en una tabla', () => {
    const marco = elemento().querySelector('[data-cuadro]');

    expect(marco?.matches('.overflow-x-auto')).toBe(true);
    expect(marco?.querySelector('table')).toBeNull();
    expect(columnas().map((c) => c.querySelector('h3')?.textContent?.trim())).toEqual([
      'Semifinal',
      'Final',
    ]);
  });

  it('**el ganador avanza**: el de la semifinal aparece en la final', () => {
    expect(columnas()[1].textContent).toContain('Ana Uno');
    expect(cajas()[0].querySelector('[data-gano]')?.textContent).toContain('Ana Uno');
  });

  it('muestra el marcador, y el walkover lo dice', () => {
    expect(cajas()[0].textContent).toContain('6-4 6-2');
    expect(cajas()[1].textContent?.replace(/\s+/g, ' ')).toContain(
      'Diego Cuatro no se presentó',
    );
  });

  it('**la cancha y la hora van bajo el partido**, si ya está programado', () => {
    const cuando = cajas()[0].querySelector('[data-cuando]')?.textContent?.replace(/\s+/g, ' ');

    expect(cuando).toContain('sábado, 5 de diciembre');
    expect(cuando).toContain('10:00');
    expect(cuando).toContain('Cancha 1');
    // El de la final no tiene hora todavía: no se inventa una línea vacía.
    expect(cajas()[2].querySelector('[data-cuando]')).toBeNull();
  });

  it('un hueco de primera ronda es un bye; en las demás, "por definir"', async () => {
    await montar([
      partido({ posicion: 1, jugadorA: 'Ana Uno', ganador: 'Ana Uno' }),
      partido({ ronda: 2, ronda_nombre: 'Final', jugadorA: 'Ana Uno' }),
    ]);

    expect(cajas()[0].textContent).toContain('Bye');
    expect(cajas()[1].textContent).toContain('Por definir');
  });

  it('**la búsqueda también marca en el árbol** (T137)', async () => {
    await montar(PARTIDOS, 'carla');

    const marcadas = cajas().filter((c) => c.hasAttribute('data-tuyo'));
    expect(marcadas).toHaveLength(2);
    expect(marcadas[0].querySelector('.bg-accent-soft')?.textContent).toContain('Carla Tres');
  });

  it('sin búsqueda no marca nada', () => {
    expect(cajas().some((c) => c.hasAttribute('data-tuyo'))).toBe(false);
  });
});
