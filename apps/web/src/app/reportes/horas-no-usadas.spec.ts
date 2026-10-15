import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Pendientes } from '../core/pendientes';
import { HorasNoUsadas } from './horas-no-usadas';

/**
 * T287 (SPEC-panel.md D6). Las horas que un socio reportó y la estadística del período, en una
 * pantalla con pestañas. «Por revisar» va primero: es lo que hay que resolver, y la estadística
 * solo cuenta lo resuelto.
 */
describe('Horas no usadas', () => {
  const montar = (horasPorRevisar: number) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Pendientes,
          useValue: { conteo: signal({ horasPorRevisar, consultasSinAtender: 0 }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(HorasNoUsadas);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('se titula como su ítem del menú', () => {
    expect(montar(0).querySelector('h1')?.textContent?.trim()).toBe('Horas no usadas');
  });

  it('**Por revisar primero, con su badge; después Período**', () => {
    const el = montar(3);
    const pestanas = [...el.querySelectorAll('nav[mat-tab-nav-bar] a')];

    expect(pestanas.map((a) => a.getAttribute('href'))).toEqual([
      '/administracion/no-uso/por-revisar',
      '/administracion/no-uso/periodo',
    ]);
    expect(pestanas[0].querySelector('.mat-badge-content')?.textContent?.trim()).toBe('3');
  });
});
